import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { closeAnchorVirtualNuban } from '@/lib/anchor';
import { sendSystemAlert } from '@/lib/alerts';
import {
  executeBuyerOrderRefund,
  getDeliveryAndLifecycleConfig,
  mergeTransactionWithLifecycleOverlay,
  updateTransactionWithFallback,
} from '@/lib/orderLifecycle';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, reason, cancelledBy = 'VENDOR' } = body || {};

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data: rawTx, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txErr || !rawTx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }
    const tx = mergeTransactionWithLifecycleOverlay(rawTx);
    const nowIso = new Date().toISOString();
    const cleanReason = String(reason || 'Cancelled by vendor before dispatch').trim();

    if (tx.status === 'DISPATCHED' || tx.status === 'RELEASED' || tx.status === 'RELEASING' || tx.status === 'VENDOR_PAID') {
      return NextResponse.json(
        { success: false, error: `Cannot cancel order in status '${tx.status}'.` },
        { status: 400 }
      );
    }

    if (tx.status === 'CANCELLED' || tx.status === 'EXPIRED' || tx.status === 'REFUNDED') {
      return NextResponse.json(
        { success: false, error: `Order is already terminated (${tx.status}).` },
        { status: 400 }
      );
    }

    // Case 1: Unpaid pre-payment cancellation -> close Virtual NUBAN & mark CANCELLED
    if (tx.status === 'AWAITING_PAYMENT' && Number(tx.amount_paid || 0) <= 0) {
      const closedRes = await closeAnchorVirtualNuban(tx.virtual_nuban_id);
      await updateTransactionWithFallback(
        tx.id,
        {
          status: 'CANCELLED',
          cancelled_at: nowIso,
          cancelled_by: String(cancelledBy),
          cancellation_reason: cleanReason,
          virtual_account_closed: closedRes.closed,
          updated_at: nowIso,
        },
        supabase
      );

      await sendSystemAlert({
        type: 'ADMIN_ACTION',
        severity: 'WARNING',
        title: `Vendor Cancelled Unpaid Order (${tx.id.slice(0, 8)})`,
        transactionId: tx.id,
        vendorHandle: tx.vendor_handle,
        details: { reason: cleanReason, virtualAccountClosed: closedRes.closed },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        status: 'CANCELLED',
        virtualAccountClosed: closedRes.closed,
        message: 'Order cancelled cleanly before payment.',
      });
    }

    // Case 2: Post-payment pre-dispatch cancellation -> Verified buyer refund (configurable fee refundability)
    const cfg = await getDeliveryAndLifecycleConfig(supabase);
    const amountPaid = Number(tx.amount_paid || tx.total_amount || 0);
    const protectionFee = Number(tx.protection_fee || 0);
    const refundAmount = cfg.lifecycle.refund_fee_on_vendor_cancel
      ? amountPaid
      : Math.max(0, amountPaid - protectionFee);

    const refundRes = await executeBuyerOrderRefund({
      tx,
      amountNgn: refundAmount,
      reasonTag: 'VENDOR_CANCEL_REFUND',
      targetStatus: 'REFUNDED',
      referenceKey: `cancel_${tx.id}`,
      adminEmail: `vendor:${tx.vendor_handle || 'vendor'}`,
      supabaseClient: supabase,
    });

    if (!refundRes.success) {
      return NextResponse.json(
        { success: false, error: refundRes.error, requiresVerifiedRefundAccount: true },
        { status: refundRes.statusCode }
      );
    }

    await updateTransactionWithFallback(
      tx.id,
      {
        cancelled_at: nowIso,
        cancelled_by: String(cancelledBy),
        cancellation_reason: cleanReason,
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      status: 'REFUNDED',
      refundAmountNgn: refundAmount,
      refundFeeIncluded: cfg.lifecycle.refund_fee_on_vendor_cancel,
      refundTransferId: refundRes.transferId,
      message: 'Vendor cancellation processed and funds refunded to verified buyer destination.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to cancel transaction.' },
      { status: 500 }
    );
  }
}
