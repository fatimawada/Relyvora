/**
 * Order Lifecycle Automation, Expiry, Overdue Dispatch Detection, Stuck-Leg Recovery & Verified Refunds
 */

import { getServiceSupabase } from '@/lib/supabaseServer';
import { getHotSettings } from '@/lib/safetyLimits';
import {
  closeAnchorVirtualNuban,
  createAnchorCounterParty,
  executeAnchorBookTransfer,
  executeAnchorNipTransfer,
  RELYVORA_FBO_ACCOUNT_ID,
  RELYVORA_REVENUE_ACCOUNT_ID,
} from '@/lib/anchor';
import { sendSystemAlert } from '@/lib/alerts';
import { recordLedgerEntry } from '@/lib/ledger';
import { resolveVerifiedRefundDestination } from '@/lib/refundDestination';
import { isSchemaMissingError, sendDeliveryReminderWhatsapp } from '@/lib/whatsapp';
import { logError, logInfo, logWarn } from '@/lib/logger';

export interface TxLifecycleOverlay {
  delivery_type?: 'same_city' | 'interstate';
  delivery_window_days?: number;
  dispatch_deadline_at?: string | null;
  delivery_deadline_at?: string | null;
  reminder_sent_at?: string | null;
  courier_name?: string | null;
  courier_phone?: string | null;
  tracking_number?: string | null;
  dispatch_notes?: string | null;
  dispatch_proof_count?: number;
  handover_proof_count?: number;
  dispute_raised_by?: string | null;
  dispute_response_deadline_at?: string | null;
  counterparty_response_text?: string | null;
  counterparty_responded_at?: string | null;
  expires_at?: string | null;
  expired_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  virtual_account_closed?: boolean;
  excess_refund_amount?: number;
  excess_refund_transfer_id?: string | null;
  buyer_terms_accepted_at?: string | null;
  buyer_terms_version?: string | null;
  buyer_consent_ip_hash?: string | null;
  whatsapp_retry_count?: number;
  [key: string]: unknown;
}

const gLc = globalThis as unknown as { __relyvoraTxLifecycleOverlay?: Map<string, TxLifecycleOverlay> };

function getOverlayMap(): Map<string, TxLifecycleOverlay> {
  if (!gLc.__relyvoraTxLifecycleOverlay) {
    gLc.__relyvoraTxLifecycleOverlay = new Map();
  }
  return gLc.__relyvoraTxLifecycleOverlay;
}

export function setTxLifecycleOverlay(txId: string, patch: Partial<TxLifecycleOverlay>) {
  const prev = getOverlayMap().get(txId) || {};
  getOverlayMap().set(txId, { ...prev, ...patch });
}

export function getTxLifecycleOverlay(txId: string): TxLifecycleOverlay | undefined {
  return getOverlayMap().get(txId);
}

export function mergeTransactionWithLifecycleOverlay<T extends Record<string, any>>(tx: T): T {
  if (!tx?.id) return tx;
  const ov = getOverlayMap().get(tx.id);
  if (!ov) return tx;
  return { ...tx, ...ov };
}

export function resetTxLifecycleOverlayForTests() {
  getOverlayMap().clear();
}

export async function updateTransactionWithFallback(
  txId: string,
  patch: Record<string, any>,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ success: boolean; usedFallback?: boolean; error?: string }> {
  const supabase = supabaseClient || getServiceSupabase();
  setTxLifecycleOverlay(txId, patch);

  let remainingPatch = { ...patch };
  let usedFallback = false;

  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (Object.keys(remainingPatch).length === 0) {
        return { success: true, usedFallback: true };
      }

      const { error } = await supabase.from('transactions').update(remainingPatch).eq('id', txId);
      if (!error) {
        return { success: true, ...(usedFallback ? { usedFallback: true } : {}) };
      }

      if (!isSchemaMissingError(error)) {
        return { success: false, error: error.message };
      }

      usedFallback = true;
      const msg = String(error.message || '');
      const colMatch =
        msg.match(/Could not find the '([^']+)' column/i) ||
        msg.match(/column "([^"]+)" of relation/i);

      if (colMatch?.[1] && colMatch[1] in remainingPatch) {
        const next = { ...remainingPatch };
        delete next[colMatch[1]];
        remainingPatch = next;
        continue;
      }

      // Fall back to strictly guaranteed baseline columns
      const baselineKeys = new Set([
        'status',
        'updated_at',
        'paid_at',
        'dispatched_at',
        'released_at',
        'disputed_at',
        'resolving_at',
        'resolved_at',
        'dispute_reason',
        'dispute_scenario',
        'resolution_action',
        'resolution_notes',
        'release_code_hash',
        'code_expires_at',
        'failed_code_attempts',
        'code_locked',
        'anchor_vendor_transfer_id',
        'anchor_fee_transfer_id',
        'refund_destination_account',
        'refund_destination_bank',
      ]);
      const safePatch: Record<string, any> = {};
      for (const [k, v] of Object.entries(remainingPatch)) {
        if (baselineKeys.has(k)) safePatch[k] = v;
      }
      if (Object.keys(safePatch).length === 0) {
        return { success: true, usedFallback: true };
      }
      const retry = await supabase.from('transactions').update(safePatch).eq('id', txId);
      if (!retry.error) {
        return { success: true, usedFallback: true };
      }
      return { success: false, error: retry.error.message };
    }

    return { success: true, usedFallback: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Transaction update failed' };
  }
}

export async function getDeliveryAndLifecycleConfig(_supabaseClient?: ReturnType<typeof getServiceSupabase>) {
  const settings = await getHotSettings();
  const delRaw = (settings.delivery_window_config || {}) as Record<string, unknown>;
  const lcRaw = (settings.order_lifecycle_config || {}) as Record<string, unknown>;
  const dispRaw = (settings.dispatch_proof_config || {}) as Record<string, unknown>;
  const polRaw = (settings.dispute_policy_config || {}) as Record<string, unknown>;
  return {
    delivery: {
      same_city_days: Number(delRaw.same_city_days ?? 3),
      interstate_days: Number(delRaw.interstate_days ?? 7),
      grace_days: Number(delRaw.grace_days ?? 3),
      hard_max_days: Number(delRaw.hard_max_days ?? 14),
      dispatch_deadline_days: Number(delRaw.dispatch_deadline_days ?? 3),
      reminder_hours_before_expiry: Number(delRaw.reminder_hours_before_expiry ?? 24),
    },
    lifecycle: {
      payment_expiry_hours: Number(lcRaw.payment_expiry_hours ?? 24),
      stuck_settlement_minutes: Number(lcRaw.stuck_settlement_minutes ?? 15),
      refund_fee_on_vendor_cancel:
        typeof lcRaw.refund_fee_on_vendor_cancel === 'boolean'
          ? lcRaw.refund_fee_on_vendor_cancel
          : true,
    },
    dispatchProof: {
      require_upload: typeof dispRaw.require_upload === 'boolean' ? dispRaw.require_upload : true,
      require_courier_name:
        typeof dispRaw.require_courier_name === 'boolean' ? dispRaw.require_courier_name : true,
      require_courier_phone:
        typeof dispRaw.require_courier_phone === 'boolean' ? dispRaw.require_courier_phone : true,
      require_tracking_for_interstate:
        typeof dispRaw.require_tracking_for_interstate === 'boolean'
          ? dispRaw.require_tracking_for_interstate
          : true,
    },
    disputePolicy: {
      timezone: String(polRaw.timezone || 'Africa/Lagos'),
      start_hour: Number(polRaw.start_hour ?? 8),
      end_hour: Number(polRaw.end_hour ?? 20),
      work_days: Array.isArray(polRaw.work_days) ? (polRaw.work_days as number[]) : [1, 2, 3, 4, 5, 6],
    },
  };
}

/**
 * Transitions unpaid AWAITING_PAYMENT orders past `expires_at` to EXPIRED and closes Virtual NUBANs.
 */
export async function expireUnpaidOrders(
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ expiredCount: number; processedIds: string[] }> {
  const supabase = supabaseClient || getServiceSupabase();
  const cfg = await getDeliveryAndLifecycleConfig(supabase);
  const now = new Date();
  const nowIso = now.toISOString();
  const fallbackCutoffIso = new Date(
    now.getTime() - cfg.lifecycle.payment_expiry_hours * 3600 * 1000
  ).toISOString();

  const { data: rows } = await supabase
    .from('transactions')
    .select('*')
    .eq('status', 'AWAITING_PAYMENT')
    .limit(100);

  const expiredIds: string[] = [];
  for (const rawTx of rows || []) {
    const tx = mergeTransactionWithLifecycleOverlay(rawTx);
    const effectiveExpiresAt = tx.expires_at
      ? new Date(tx.expires_at).getTime()
      : new Date(tx.created_at).getTime() + cfg.lifecycle.payment_expiry_hours * 3600 * 1000;

    if (effectiveExpiresAt > now.getTime() && (!tx.expires_at ? tx.created_at > fallbackCutoffIso : true)) {
      continue;
    }

    const closedRes = await closeAnchorVirtualNuban(tx.virtual_nuban_id);
    const upd = await updateTransactionWithFallback(
      tx.id,
      {
        status: 'EXPIRED',
        expired_at: nowIso,
        virtual_account_closed: closedRes.closed,
        updated_at: nowIso,
      },
      supabase
    );
    if (upd.success) {
      expiredIds.push(tx.id);
    }
  }

  if (expiredIds.length > 0) {
    logInfo('UNPAID_ORDERS_EXPIRED', { expiredCount: expiredIds.length });
  }
  return { expiredCount: expiredIds.length, processedIds: expiredIds };
}

/**
 * Flags FUNDS_LOCKED orders that passed dispatch_deadline_at (Scenario 6 / admin review)
 * and sends 24-hour pre-expiry buyer WhatsApp reminders.
 */
export async function flagOverdueDispatchesAndSendReminders(
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ overdueFlagged: number; remindersSent: number }> {
  const supabase = supabaseClient || getServiceSupabase();
  const cfg = await getDeliveryAndLifecycleConfig(supabase);
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: activeRows } = await supabase
    .from('transactions')
    .select('*')
    .in('status', ['FUNDS_LOCKED', 'DISPATCHED'])
    .limit(150);

  let overdueFlagged = 0;
  let remindersSent = 0;

  for (const rawTx of activeRows || []) {
    const tx = mergeTransactionWithLifecycleOverlay(rawTx);

    // 1. Overdue Dispatch Check (FUNDS_LOCKED only)
    if (tx.status === 'FUNDS_LOCKED' && tx.paid_at && !tx.review_hold) {
      const dispatchDeadlineMs = tx.dispatch_deadline_at
        ? new Date(tx.dispatch_deadline_at).getTime()
        : new Date(tx.paid_at).getTime() + cfg.delivery.dispatch_deadline_days * 24 * 3600 * 1000;

      if (now.getTime() > dispatchDeadlineMs) {
        await updateTransactionWithFallback(
          tx.id,
          {
            review_hold: true,
            review_hold_reason: `Overdue dispatch deadline (>${cfg.delivery.dispatch_deadline_days}d without proof of dispatch — Scenario 6 vendor failure applies)`,
            dispute_scenario: 6,
            updated_at: nowIso,
          },
          supabase
        );
        overdueFlagged++;
        await sendSystemAlert({
          type: 'RISK_HOLD',
          severity: 'WARNING',
          title: 'Overdue Vendor Dispatch Flagged for Admin Review (Scenario 6)',
          transactionId: tx.id,
          vendorHandle: tx.vendor_handle,
          details: {
            paidAt: tx.paid_at,
            dispatchDeadlineAt: new Date(dispatchDeadlineMs).toISOString(),
            rule: 'Scenario 6: Vendor Failure to Deliver',
          },
        }).catch(() => {});
      }
    }

    // 2. Buyer 24-hour delivery reminder
    if (!tx.reminder_sent_at && tx.buyer_phone) {
      const deliveryDeadlineMs = tx.delivery_deadline_at
        ? new Date(tx.delivery_deadline_at).getTime()
        : tx.paid_at
        ? new Date(tx.paid_at).getTime() +
          (tx.delivery_type === 'interstate' ? cfg.delivery.interstate_days : cfg.delivery.same_city_days) *
            24 *
            3600 *
            1000
        : null;

      if (deliveryDeadlineMs) {
        const msRemaining = deliveryDeadlineMs - now.getTime();
        const reminderThresholdMs = cfg.delivery.reminder_hours_before_expiry * 3600 * 1000;
        if (msRemaining > 0 && msRemaining <= reminderThresholdMs) {
          const hoursLeft = Math.max(1, Math.round(msRemaining / (3600 * 1000)));
          const wa = await sendDeliveryReminderWhatsapp(
            {
              transactionId: tx.id,
              buyerPhone: tx.buyer_phone,
              itemName: tx.item_name || 'Escrow Order',
              vendorDisplayName: tx.vendor_handle || 'Relyvora Vendor',
              hoursLeftText: `${hoursLeft} hour(s)`,
              vendorId: tx.vendor_id,
            },
            supabase
          );
          if (wa.success) {
            remindersSent++;
            await updateTransactionWithFallback(tx.id, { reminder_sent_at: nowIso, updated_at: nowIso }, supabase);
          }
        }
      }
    }
  }

  return { overdueFlagged, remindersSent };
}

/**
 * Retries orders stuck in RELEASING or VENDOR_PAID beyond stuck_settlement_minutes using deterministic idempotency keys.
 */
export async function retryStuckSettlementLegs(
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ checked: number; recovered: number; failed: number }> {
  const supabase = supabaseClient || getServiceSupabase();
  const cfg = await getDeliveryAndLifecycleConfig(supabase);
  const cutoffIso = new Date(
    Date.now() - cfg.lifecycle.stuck_settlement_minutes * 60 * 1000
  ).toISOString();

  const { data: stuckRows } = await supabase
    .from('transactions')
    .select('*, vendors(id, anchor_deposit_account_id)')
    .in('status', ['RELEASING', 'VENDOR_PAID'])
    .lt('updated_at', cutoffIso)
    .limit(50);

  let checked = 0;
  let recovered = 0;
  let failed = 0;
  const isLive = process.env.PAYMENTS_MODE === 'live';

  for (const tx of stuckRows || []) {
    checked++;
    try {
      const vendorAcc = (tx.vendors as any)?.anchor_deposit_account_id;
      const total = Number(tx.total_amount) || 0;
      const feeAmt = Number(tx.protection_fee) || 500;
      const vendorAmt = Math.max(0, total - feeAmt);

      let vendorTransferId = tx.anchor_vendor_transfer_id;
      let feeTransferId = tx.anchor_fee_transfer_id;

      if (tx.status === 'RELEASING' && !vendorTransferId) {
        if (isLive) {
          if (!vendorAcc) throw new Error('Vendor Anchor deposit account missing');
          const resV = await executeAnchorBookTransfer({
            sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
            destinationAccountId: vendorAcc,
            amount: Math.round(vendorAmt * 100),
            reason: `Retry Stuck Release Payout (${tx.id.slice(0, 8)})`,
            reference: tx.leg1_idempotency_key || `leg1_${tx.id}`,
          });
          vendorTransferId = resV.transferId;
        } else {
          vendorTransferId = `sandbox_retry_leg1_${tx.id}`;
        }
        await supabase.rpc('rpc_finalize_release_step', {
          p_transaction_id: tx.id,
          p_step: 'VENDOR_PAID',
          p_transfer_id: vendorTransferId,
          p_idempotency_key: tx.leg1_idempotency_key || `leg1_${tx.id}`,
        });
      }

      if (!feeTransferId) {
        if (isLive) {
          const resF = await executeAnchorBookTransfer({
            sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
            destinationAccountId: RELYVORA_REVENUE_ACCOUNT_ID,
            amount: Math.round(feeAmt * 100),
            reason: `Retry Stuck Release Fee (${tx.id.slice(0, 8)})`,
            reference: tx.leg2_idempotency_key || `leg2_${tx.id}`,
          });
          feeTransferId = resF.transferId;
        } else {
          feeTransferId = `sandbox_retry_leg2_${tx.id}`;
        }
        await supabase.rpc('rpc_finalize_release_step', {
          p_transaction_id: tx.id,
          p_step: 'RELEASED',
          p_transfer_id: feeTransferId,
          p_idempotency_key: tx.leg2_idempotency_key || `leg2_${tx.id}`,
        });
      }

      recovered++;
      await sendSystemAlert({
        type: 'STUCK_FUNDS',
        severity: 'WARNING',
        title: `Stuck Settlement Leg Recovered (${tx.id.slice(0, 8)})`,
        transactionId: tx.id,
        vendorHandle: tx.vendor_handle,
        details: { previousStatus: tx.status, vendorTransferId, feeTransferId },
      }).catch(() => {});
    } catch (err: any) {
      failed++;
      logError('STUCK_SETTLEMENT_RETRY_FAILED', { transactionId: tx.id, error: err?.message });
      await sendSystemAlert({
        type: 'PAYOUT_FAILURE',
        severity: 'CRITICAL',
        title: `Stuck Settlement Retry Failed (${tx.id.slice(0, 8)})`,
        transactionId: tx.id,
        vendorHandle: tx.vendor_handle,
        details: { status: tx.status, error: err?.message || 'Unknown transfer failure' },
      }).catch(() => {});
    }
  }

  return { checked, recovered, failed };
}

/**
 * Executes a verified buyer refund via Anchor NIP (or sandbox reference) for:
 * - Vendor cancellation after payment
 * - Late deposit on EXPIRED / CANCELLED order
 * - Partial deposit refund
 * - Excess overpayment refund
 * Strictly refuses unless resolveVerifiedRefundDestination(tx) returns verified=true.
 */
export async function executeBuyerOrderRefund(params: {
  tx: Record<string, any>;
  amountNgn: number;
  reasonTag: 'VENDOR_CANCEL_REFUND' | 'LATE_DEPOSIT_REFUND' | 'PARTIAL_DEPOSIT_REFUND' | 'EXCESS_DEPOSIT_REFUND';
  targetStatus?: 'REFUNDED' | null;
  referenceKey: string;
  adminEmail?: string;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{ success: boolean; transferId?: string; statusCode: number; error?: string }> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const amt = Number(params.amountNgn || 0);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { success: false, statusCode: 400, error: 'Refund amount must be greater than ₦0.' };
  }

  const dest = await resolveVerifiedRefundDestination(params.tx, supabase);
  if (!dest.verified || !dest.accountNumber || !dest.bankCode) {
    return {
      success: false,
      statusCode: 422,
      error:
        'Verified buyer refund destination missing. Buyer must confirm a Nigerian NUBAN via WhatsApp OTP before any refund transfer can execute.',
    };
  }

  const isLive = process.env.PAYMENTS_MODE === 'live';
  let refundTransferId: string;

  if (isLive) {
    try {
      const cp = await createAnchorCounterParty({
        bankCode: dest.bankCode,
        accountNumber: dest.accountNumber,
        accountName: dest.accountName || 'Verified Buyer',
        verifyName: false,
      });
      const nip = await executeAnchorNipTransfer({
        sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
        counterPartyId: cp.counterPartyId,
        amount: Math.round(amt * 100),
        reason: `Relyvora ${params.reasonTag} (${String(params.tx.id).slice(0, 8)})`,
        reference: params.referenceKey,
      });
      refundTransferId = nip.transferId;
    } catch (err: any) {
      logWarn('BUYER_REFUND_TRANSFER_FAILED', {
        transactionId: params.tx.id,
        reasonTag: params.reasonTag,
        error: err?.message,
      });
      return {
        success: false,
        statusCode: 502,
        error: err?.message || 'Anchor refund transfer failed.',
      };
    }
  } else {
    refundTransferId = `sandbox_${params.reasonTag.toLowerCase()}_${Date.now()}`;
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, any> = {
    updated_at: nowIso,
  };
  if (params.reasonTag === 'EXCESS_DEPOSIT_REFUND' || params.reasonTag === 'LATE_DEPOSIT_REFUND') {
    patch.excess_refund_amount = amt;
    patch.excess_refund_transfer_id = refundTransferId;
    patch.review_hold = false;
    patch.review_hold_reason = null;
  } else {
    patch.refund_transfer_id = refundTransferId;
    patch.resolved_at = nowIso;
    patch.resolution_action = params.reasonTag;
  }
  if (params.targetStatus === 'REFUNDED') {
    patch.status = 'REFUNDED';
  }

  await updateTransactionWithFallback(params.tx.id, patch, supabase);

  await recordLedgerEntry({
    transactionId: params.tx.id,
    entryType: 'REFUND_BUYER',
    amount: amt,
    currency: 'NGN',
    fromAccount: 'Relyvora Escrow FBO',
    toAccount: `Verified Buyer (${dest.maskedAccount || '******'})`,
    anchorTransferId: refundTransferId,
    idempotencyKey: `ledger_${params.referenceKey}`,
    metadata: {
      reasonTag: params.reasonTag,
      source: dest.source,
      executedBy: params.adminEmail || 'system:lifecycle',
    },
  });

  await sendSystemAlert({
    type: 'ADMIN_ACTION',
    severity: 'WARNING',
    title: `Buyer Refund Executed (${params.reasonTag})`,
    transactionId: params.tx.id,
    vendorHandle: params.tx.vendor_handle,
    details: {
      amountNgn: amt,
      transferId: refundTransferId,
      destinationSource: dest.source,
      maskedAccount: dest.maskedAccount,
    },
  }).catch(() => {});

  return { success: true, statusCode: 200, transferId: refundTransferId };
}
