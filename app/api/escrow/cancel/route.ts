import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { closeAnchorVirtualNuban } from '@/lib/anchor';
import { sendSystemAlert } from '@/lib/alerts';
import { resolveOrderActor } from '@/lib/orderAuth';
import {
  executeBuyerOrderRefund,
  getDeliveryAndLifecycleConfig,
  updateTransactionStrict,
} from '@/lib/orderLifecycle';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, reason } = body || {};

    if (!transactionId || typeof transactionId !== 'string') {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (txErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Cancel Transaction Lookup Failed (Fail Closed)',
        transactionId,
        details: { error: txErr.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: `Transaction lookup failed: ${txErr.message}` }, { status: 500 });
    }

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    // Strict authentication: ONLY owning Vendor or AAL2 Admin may cancel; derive cancelledBy from session
    const actor = await resolveOrderActor(request, tx, supabase);
    if (!actor.authenticated) {
      return NextResponse.json(
        { success: false, code: actor.code, error: actor.error || 'Authentication required.' },
        { status: actor.statusCode || 401 }
      );
    }

    if (actor.role !== 'VENDOR' && actor.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Only the owning vendor or admin may cancel this order.' },
        { status: 403 }
      );
    }

    const serverCancelledBy =
      actor.role === 'ADMIN'
        ? `ADMIN:${actor.adminUserId || 'admin'}`
        : `VENDOR:${actor.vendorId || tx.vendor_handle}`;

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
      const upd = await updateTransactionStrict(
        tx.id,
        {
          status: 'CANCELLED',
          cancelled_at: nowIso,
          cancelled_by: serverCancelledBy,
          cancellation_reason: cleanReason,
          virtual_account_closed: closedRes.closed,
          updated_at: nowIso,
        },
        supabase
      );

      if (!upd.success) {
        return NextResponse.json(
          { success: false, error: upd.error || 'Failed to mark order cancelled.' },
          { status: 500 }
        );
      }

      await sendSystemAlert({
        type: 'ADMIN_ACTION',
        severity: 'WARNING',
        title: `Vendor Cancelled Unpaid Order (${tx.id.slice(0, 8)})`,
        transactionId: tx.id,
        vendorHandle: tx.vendor_handle,
        details: { reason: cleanReason, cancelledBy: serverCancelledBy, virtualAccountClosed: closedRes.closed },
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
      adminEmail: serverCancelledBy,
      supabaseClient: supabase,
    });

    if (!refundRes.success) {
      return NextResponse.json(
        { success: false, error: refundRes.error, requiresVerifiedRefundAccount: true },
        { status: refundRes.statusCode }
      );
    }

    const upd = await updateTransactionStrict(
      tx.id,
      {
        cancelled_at: nowIso,
        cancelled_by: serverCancelledBy,
        cancellation_reason: cleanReason,
        updated_at: nowIso,
      },
      supabase
    );

    if (!upd.success) {
      return NextResponse.json(
        { success: false, error: upd.error || 'Failed to record cancellation metadata.' },
        { status: 500 }
      );
    }

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
