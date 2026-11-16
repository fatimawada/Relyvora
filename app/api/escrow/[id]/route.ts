import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getServerPaymentsMode } from '@/lib/paymentsMode';
import { maskPhoneNumber } from '@/lib/smsDelivery';
import { SAFE_TRANSACTION_PUBLIC_COLUMNS } from '@/lib/transactionSelect';
import {
  applyWhatsappVerificationRedaction,
  selectTransactionWithWhatsapp,
} from '@/lib/whatsapp';
import {
  getDeliveryAndLifecycleConfig,
  mergeTransactionWithLifecycleOverlay,
} from '@/lib/orderLifecycle';
import { getAuthorizedEvidenceSummary } from '@/lib/evidenceStorage';
import { resolveVerifiedRefundDestination } from '@/lib/refundDestination';
import { calculateBusinessSlaCountdown, DISPUTE_SCENARIOS } from '@/lib/disputeScenarios';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'Transaction ID is required' }, { status: 400 });
    }

    const viewerParam = (request.nextUrl.searchParams.get('viewer') || '').toUpperCase();
    const viewerRole: 'BUYER' | 'VENDOR' = viewerParam === 'VENDOR' ? 'VENDOR' : 'BUYER';

    const supabase = getServiceSupabase();

    // Query transaction with service role, selecting buyer_phone only to compute mask server-side
    const { data: tx, error } = await selectTransactionWithWhatsapp<any>(
      supabase,
      id,
      `${SAFE_TRANSACTION_PUBLIC_COLUMNS}, buyer_phone, virtual_nuban_id`
    );

    if (error || !tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    const withOverlay = mergeTransactionWithLifecycleOverlay(tx);
    const withRedaction = applyWhatsappVerificationRedaction(withOverlay);
    const cfg = await getDeliveryAndLifecycleConfig(supabase);
    const refundDest = await resolveVerifiedRefundDestination(withOverlay, supabase);
    const evidenceSummary = await getAuthorizedEvidenceSummary({
      transactionId: id,
      viewerRole,
      supabaseClient: supabase,
    });

    const deliveryType = withOverlay.delivery_type === 'interstate' ? 'interstate' : 'same_city';
    const isCodeExpired = Boolean(
      withOverlay.code_expires_at &&
        new Date(withOverlay.code_expires_at).getTime() <= Date.now() &&
        ['FUNDS_LOCKED', 'DISPATCHED'].includes(withOverlay.status)
    );
    const isDispatchOverdue = Boolean(
      withOverlay.status === 'FUNDS_LOCKED' &&
        withOverlay.dispatch_deadline_at &&
        new Date(withOverlay.dispatch_deadline_at).getTime() <= Date.now()
    );

    let disputeSla = null;
    if (withOverlay.status === 'DISPUTED' || withOverlay.status === 'RESOLVING') {
      const sc = DISPUTE_SCENARIOS.find((s) => s.id === Number(withOverlay.dispute_scenario));
      const baseIso = withOverlay.disputed_at || withOverlay.updated_at || new Date().toISOString();
      disputeSla = calculateBusinessSlaCountdown(
        baseIso,
        sc?.slaHours || 24,
        withOverlay.dispute_response_deadline_at || null,
        cfg.disputePolicy
      );
    }

    // NEVER return plaintext release code, hashes, unmasked buyer PII,
    // or full decrypted refund bank account numbers on public order GET.
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
      disputed_at: withRedaction.disputed_at,
      dispute_reason: withRedaction.dispute_reason,
      dispute_scenario: withOverlay.dispute_scenario || null,
      dispute_raised_by: withOverlay.dispute_raised_by || null,
      dispute_response_deadline_at: disputeSla?.deadline?.toISOString() || withOverlay.dispute_response_deadline_at || null,
      dispute_sla: disputeSla,
      counterparty_response_text: withOverlay.counterparty_response_text || null,
      counterparty_responded_at: withOverlay.counterparty_responded_at || null,
      delivery_type: deliveryType,
      delivery_window_days:
        Number(withOverlay.delivery_window_days) ||
        (deliveryType === 'interstate' ? cfg.delivery.interstate_days : cfg.delivery.same_city_days),
      dispatch_deadline_at: withOverlay.dispatch_deadline_at || null,
      delivery_deadline_at: withOverlay.delivery_deadline_at || null,
      is_dispatch_overdue: isDispatchOverdue,
      expires_at: withOverlay.expires_at || null,
      expired_at: withOverlay.expired_at || null,
      cancelled_at: withOverlay.cancelled_at || null,
      cancelled_by: withOverlay.cancelled_by || null,
      cancellation_reason: withOverlay.cancellation_reason || null,
      courier_name: withOverlay.courier_name || null,
      courier_phone: withOverlay.courier_phone || null,
      tracking_number: withOverlay.tracking_number || null,
      dispatch_notes: withOverlay.dispatch_notes || null,
      buyer_terms_accepted_at: withOverlay.buyer_terms_accepted_at || null,
      buyer_terms_version: withOverlay.buyer_terms_version || null,
      virtual_account_number:
        ['EXPIRED', 'CANCELLED'].includes(withOverlay.status)
          ? null
          : withRedaction.virtual_account_number,
      virtual_bank_name:
        ['EXPIRED', 'CANCELLED'].includes(withOverlay.status)
          ? null
          : withRedaction.virtual_bank_name,
      virtual_account_name:
        ['EXPIRED', 'CANCELLED'].includes(withOverlay.status)
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
      release_code: null,
    };

    return NextResponse.json({ success: true, transaction: sanitizedTransaction });
  } catch (err: any) {
    console.error('Unhandled error in get-transaction:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
