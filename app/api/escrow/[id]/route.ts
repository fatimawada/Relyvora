import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getServerPaymentsMode } from '@/lib/paymentsMode';
import { maskPhoneNumber } from '@/lib/smsDelivery';
import { SAFE_TRANSACTION_PUBLIC_COLUMNS } from '@/lib/transactionSelect';
import {
  applyWhatsappVerificationRedaction,
  selectTransactionWithWhatsapp,
} from '@/lib/whatsapp';
import { getDeliveryAndLifecycleConfig } from '@/lib/orderLifecycle';
import { getAuthorizedEvidenceSummary } from '@/lib/evidenceStorage';
import { resolveVerifiedRefundDestination } from '@/lib/refundDestination';
import { calculateBusinessSlaCountdown, DISPUTE_SCENARIOS } from '@/lib/disputeScenarios';
import { resolveOrderActor } from '@/lib/orderAuth';
import { sendSystemAlert } from '@/lib/alerts';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'Transaction ID is required' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { data: tx, error } = await selectTransactionWithWhatsapp<any>(
      supabase,
      id,
      `${SAFE_TRANSACTION_PUBLIC_COLUMNS}, buyer_phone, virtual_nuban_id, vendor_id`
    );

    if (error) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Transaction GET Query Failed (Fail Closed)',
        transactionId: id,
        details: { error: error.message || String(error) },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: 'Transaction query failed' }, { status: 500 });
    }

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    const actor = await resolveOrderActor(request, tx, supabase);
    const withRedaction = applyWhatsappVerificationRedaction(tx);

    // Explicitly presented bad/wrong-order/foreign credentials always fail with 403/401
    if (!actor.authenticated && actor.statusCode === 403) {
      return NextResponse.json(
        { success: false, code: actor.code, error: actor.error || 'Forbidden' },
        { status: 403 }
      );
    }

    // Public unauthenticated checkout preview is strictly restricted to pre-payment / expired / cancelled links
    if (!actor.authenticated) {
      if (['AWAITING_PAYMENT', 'EXPIRED', 'CANCELLED'].includes(tx.status)) {
        const cfg = await getDeliveryAndLifecycleConfig(supabase);
        const deliveryType = tx.delivery_type === 'interstate' ? 'interstate' : 'same_city';
        const checkoutPreview = {
          id: withRedaction.id,
          created_at: withRedaction.created_at,
          updated_at: withRedaction.updated_at,
          item_name: withRedaction.item_name,
          item_price: withRedaction.item_price,
          delivery_fee: withRedaction.delivery_fee || 0,
          protection_fee: withRedaction.protection_fee,
          total_amount: withRedaction.total_amount,
          amount_paid: withRedaction.amount_paid || 0,
          vendor_handle: withRedaction.vendor_handle,
          status: withRedaction.status,
          payments_mode: withRedaction.payments_mode || getServerPaymentsMode(),
          delivery_type: deliveryType,
          delivery_window_days:
            Number(tx.delivery_window_days) ||
            (deliveryType === 'interstate' ? cfg.delivery.interstate_days : cfg.delivery.same_city_days),
          expires_at: tx.expires_at || null,
          expired_at: tx.expired_at || null,
          cancelled_at: tx.cancelled_at || null,
          buyer_terms_accepted_at: tx.buyer_terms_accepted_at || null,
          buyer_terms_version: tx.buyer_terms_version || null,
          virtual_account_number:
            tx.status === 'AWAITING_PAYMENT' ? withRedaction.virtual_account_number : null,
          virtual_bank_name:
            tx.status === 'AWAITING_PAYMENT' ? withRedaction.virtual_bank_name : null,
          virtual_account_name:
            tx.status === 'AWAITING_PAYMENT' ? withRedaction.virtual_account_name : null,
          buyer_phone_masked: maskPhoneNumber(withRedaction.buyer_phone),
          has_buyer_phone: Boolean(withRedaction.buyer_phone),
          buyer_whatsapp_consent: Boolean(withRedaction.buyer_whatsapp_consent),
          buyer_phone_verified: Boolean(withRedaction.buyer_phone_verified),
          buyer_phone_verified_at: withRedaction.buyer_phone_verified_at || null,
          whatsapp_delivery_status: withRedaction.whatsapp_delivery_status || 'not_sent',
          whatsapp_blocked: Boolean(withRedaction.whatsapp_blocked),
          authenticated_role: null,
          release_code: null,
        };
        return NextResponse.json({ success: true, transaction: checkoutPreview, authenticated_role: null });
      }

      return NextResponse.json(
        {
          success: false,
          code: actor.code || 'AUTH_REQUIRED',
          requiresAuth: true,
          requiresBuyerSession: true,
          error: actor.error || 'Authentication required to view order details.',
          transactionPreview: {
            id: withRedaction.id,
            status: withRedaction.status,
            item_name: withRedaction.item_name,
            vendor_handle: withRedaction.vendor_handle,
            buyer_phone_verified: Boolean(withRedaction.buyer_phone_verified),
            buyer_phone_masked: maskPhoneNumber(withRedaction.buyer_phone),
            whatsapp_blocked: Boolean(withRedaction.whatsapp_blocked),
          },
        },
        { status: actor.statusCode || 401 }
      );
    }

    const viewerRole = actor.role!;
    const cfg = await getDeliveryAndLifecycleConfig(supabase);
    const refundDest =
      viewerRole === 'BUYER' || viewerRole === 'ADMIN'
        ? await resolveVerifiedRefundDestination(tx, supabase)
        : { verified: false, source: null, maskedAccount: null, accountName: null, bankCode: null, accountNumber: null, verifiedAt: null };
    const evidenceSummary = await getAuthorizedEvidenceSummary({
      transactionId: id,
      viewerRole,
      supabaseClient: supabase,
    });

    const deliveryType = tx.delivery_type === 'interstate' ? 'interstate' : 'same_city';
    const isCodeExpired = Boolean(
      tx.code_expires_at &&
        new Date(tx.code_expires_at).getTime() <= Date.now() &&
        ['FUNDS_LOCKED', 'DISPATCHED'].includes(tx.status)
    );
    const isDispatchOverdue = Boolean(
      tx.status === 'FUNDS_LOCKED' &&
        tx.dispatch_deadline_at &&
        new Date(tx.dispatch_deadline_at).getTime() <= Date.now()
    );

    let disputeSla = null;
    if (tx.status === 'DISPUTED' || tx.status === 'RESOLVING') {
      const sc = DISPUTE_SCENARIOS.find((s) => s.id === Number(tx.dispute_scenario));
      const baseIso = tx.disputed_at || tx.updated_at || new Date().toISOString();
      disputeSla = calculateBusinessSlaCountdown(
        baseIso,
        sc?.slaHours || 24,
        tx.dispute_response_deadline_at || null,
        cfg.disputePolicy
      );
    }

    const sanitizedTransaction = {
      id: withRedaction.id,
      created_at: withRedaction.created_at,
      updated_at: withRedaction.updated_at,
      item_name: withRedaction.item_name,
      item_price: withRedaction.item_price,
      delivery_fee: withRedaction.delivery_fee || 0,
      protection_fee: withRedaction.protection_fee,
      total_amount: withRedaction.total_amount,
      amount_paid: withRedaction.amount_paid || 0,
      excess_amount: withRedaction.excess_amount || 0,
      vendor_handle: withRedaction.vendor_handle,
      status: withRedaction.status,
      payments_mode: withRedaction.payments_mode || getServerPaymentsMode(),
      paid_at: withRedaction.paid_at,
      dispatched_at: withRedaction.dispatched_at,
      released_at: withRedaction.released_at,
      vendor_paid_at: tx.vendor_paid_at || null,
      disputed_at: withRedaction.disputed_at,
      dispute_reason: withRedaction.dispute_reason,
      dispute_scenario: tx.dispute_scenario || null,
      dispute_raised_by: tx.dispute_raised_by || null,
      dispute_response_deadline_at: disputeSla?.deadline?.toISOString() || tx.dispute_response_deadline_at || null,
      dispute_sla: disputeSla,
      counterparty_response_text: tx.counterparty_response_text || null,
      counterparty_responded_at: tx.counterparty_responded_at || null,
      resolution_action: tx.resolution_action || null,
      resolution_notes: tx.resolution_notes || null,
      resolved_at: tx.resolved_at || null,
      cooling_window_hours: tx.cooling_window_hours ?? null,
      payout_available_at: tx.payout_available_at || null,
      anchor_transfer_id: tx.anchor_transfer_id || null,
      anchor_revenue_transfer_id: tx.anchor_revenue_transfer_id || null,
      anchor_vendor_transfer_id: tx.anchor_vendor_transfer_id || null,
      anchor_fee_transfer_id: tx.anchor_fee_transfer_id || null,
      refund_transfer_id: tx.refund_transfer_id || null,
      payout_transfer_id: tx.payout_transfer_id || null,
      delivery_type: deliveryType,
      delivery_window_days:
        Number(tx.delivery_window_days) ||
        (deliveryType === 'interstate' ? cfg.delivery.interstate_days : cfg.delivery.same_city_days),
      dispatch_deadline_at: tx.dispatch_deadline_at || null,
      delivery_deadline_at: tx.delivery_deadline_at || null,
      is_dispatch_overdue: isDispatchOverdue,
      expires_at: tx.expires_at || null,
      expired_at: tx.expired_at || null,
      cancelled_at: tx.cancelled_at || null,
      cancelled_by: tx.cancelled_by || null,
      cancellation_reason: tx.cancellation_reason || null,
      courier_name: tx.courier_name || null,
      courier_phone: tx.courier_phone || null,
      tracking_number: tx.tracking_number || null,
      dispatch_notes: tx.dispatch_notes || null,
      buyer_terms_accepted_at: tx.buyer_terms_accepted_at || null,
      buyer_terms_version: tx.buyer_terms_version || null,
      virtual_account_number:
        ['EXPIRED', 'CANCELLED'].includes(tx.status)
          ? null
          : withRedaction.virtual_account_number,
      virtual_bank_name:
        ['EXPIRED', 'CANCELLED'].includes(tx.status)
          ? null
          : withRedaction.virtual_bank_name,
      virtual_account_name:
        ['EXPIRED', 'CANCELLED'].includes(tx.status)
          ? null
          : withRedaction.virtual_account_name,
      code_locked: Boolean(withRedaction.code_locked),
      failed_code_attempts: withRedaction.failed_code_attempts || 0,
      code_expires_at: withRedaction.code_expires_at,
      code_expired: isCodeExpired,
      buyer_phone_masked: maskPhoneNumber(withRedaction.buyer_phone),
      has_buyer_phone: Boolean(withRedaction.buyer_phone),
      buyer_whatsapp_consent: Boolean(withRedaction.buyer_whatsapp_consent),
      buyer_phone_verified: Boolean(withRedaction.buyer_phone_verified),
      buyer_phone_verified_at: withRedaction.buyer_phone_verified_at || null,
      whatsapp_delivery_status: withRedaction.whatsapp_delivery_status || 'not_sent',
      whatsapp_blocked: Boolean(withRedaction.whatsapp_blocked),
      refund_destination_verified: refundDest.verified,
      refund_destination_source: refundDest.source,
      refund_destination_masked: refundDest.maskedAccount,
      refund_destination_name: refundDest.accountName,
      evidence_summary: evidenceSummary,
      dispatch_proof_config: cfg.dispatchProof,
      authenticated_role: viewerRole,
      release_code: null,
    };

    return NextResponse.json({
      success: true,
      authenticated_role: viewerRole,
      transaction: sanitizedTransaction,
    });
  } catch (err: any) {
    console.error('Unhandled error in get-transaction:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
