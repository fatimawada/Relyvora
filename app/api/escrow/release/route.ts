import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { isSandboxMode, getServerPaymentsMode } from '@/lib/paymentsMode';
import { computeReleaseCodeHmac, MAX_CODE_ATTEMPTS } from '@/lib/releaseCode';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';
import { sendSystemAlert } from '@/lib/alerts';
import { SAFE_TRANSACTION_PUBLIC_COLUMNS } from '@/lib/transactionSelect';
import {
  getCoolingWindowConfigServer,
  getHotSettings,
  getRiskEngineConfigServer,
  isPayoutsEnabledServer,
} from '@/lib/safetyLimits';
import { checkVendorPayoutSafetyGate, getVendorSafetyOverlay } from '@/lib/payoutSafety';
import { getTxRiskFallback } from '@/lib/riskEngine';
import { recordCompletedOrderAndEvaluateTier } from '@/lib/vendorTiers';
import { sendCoolingWindowWhatsappNotice } from '@/lib/whatsapp';
import { 
  executeAnchorBookTransfer, 
  RELYVORA_FBO_ACCOUNT_ID, 
  RELYVORA_REVENUE_ACCOUNT_ID,
  AnchorApiError 
} from '@/lib/anchor';

const globalForCooling = globalThis as unknown as {
  __relyvoraCoolingFallback?: Map<string, { payoutAvailableAt: string; coolingWindowHours: number }>;
};

function getCoolingFallbackMap() {
  if (!globalForCooling.__relyvoraCoolingFallback) {
    globalForCooling.__relyvoraCoolingFallback = new Map();
  }
  return globalForCooling.__relyvoraCoolingFallback;
}

export async function POST(request: NextRequest) {
  try {
    // 0. Incident kill switch check (payouts_enabled)
    const payoutsEnabled = await isPayoutsEnabledServer();
    if (!payoutsEnabled) {
      return NextResponse.json(
        {
          success: false,
          code: 'PAYOUTS_PAUSED',
          error: 'Payouts are currently paused by an operations safety switch.',
        },
        { status: 503 }
      );
    }

    // 1. IP Rate Limiting
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`${clientIp}:escrow_release`, 10, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many verification attempts from this IP. Please wait 15 minutes.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { transactionId, releaseCode } = body;

    if (!transactionId || !releaseCode || typeof releaseCode !== 'string') {
      return NextResponse.json(
        { success: false, error: 'transactionId and 6-digit releaseCode are required.' },
        { status: 400 }
      );
    }

    const cleanCode = releaseCode.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      return NextResponse.json(
        { success: false, error: 'Release code must be exactly 6 digits.' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const isSandbox = isSandboxMode();
    const serverPaymentsMode = getServerPaymentsMode();

    // 1b. Pre-release Risk Hold, Self-Dealing Block & Payout Safety Gates
    const { data: txMeta } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    const txRiskFallback = getTxRiskFallback(transactionId);
    const effectiveOrderBlocked = Boolean(txMeta?.order_blocked || txRiskFallback?.order_blocked);
    const effectiveReviewHold = Boolean(txMeta?.review_hold || txRiskFallback?.review_hold);

    if (effectiveOrderBlocked) {
      return NextResponse.json(
        {
          success: false,
          code: 'ORDER_BLOCKED',
          error:
            txMeta?.order_block_reason ||
            txRiskFallback?.order_block_reason ||
            'Transaction is blocked due to high-risk/self-dealing detection. Payout refused.',
        },
        { status: 423 }
      );
    }

    if (effectiveReviewHold) {
      return NextResponse.json(
        {
          success: false,
          code: 'RISK_REVIEW_HOLD',
          error:
            txMeta?.review_hold_reason ||
            txRiskFallback?.review_hold_reason ||
            'Transaction is on risk review hold. Admin clearance is required before payout.',
        },
        { status: 423 }
      );
    }

    let coolingHours = 0;
    let preReleaseSalesCount: number | undefined;
    if (txMeta?.vendor_id) {
      const gate = await checkVendorPayoutSafetyGate({
        vendorId: txMeta.vendor_id,
        supabaseClient: supabase,
      });
      if (!gate.allowed) {
        return NextResponse.json(
          {
            success: false,
            code: gate.code,
            payoutHoldUntil: gate.payoutHoldUntil || null,
            error: gate.reason || 'Vendor payout safety gate blocked release.',
          },
          { status: gate.code === 'SETTLEMENT_CHANGE_HOLD' ? 423 : 422 }
        );
      }

      const { data: vendorRow } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', txMeta.vendor_id)
        .maybeSingle();
      const vendorOverlay = getVendorSafetyOverlay(txMeta.vendor_id) || {};
      const mergedVendor = { ...(vendorRow || {}), ...vendorOverlay };
      if (typeof mergedVendor?.successful_sales_count === 'number') {
        preReleaseSalesCount = mergedVendor.successful_sales_count;
      } else if (typeof mergedVendor?.completed_orders_count === 'number') {
        preReleaseSalesCount = mergedVendor.completed_orders_count;
      }
      const tierRaw = String(mergedVendor?.tier || 'NEW').toUpperCase();
      const vendorTier =
        tierRaw === 'TRUSTED' || tierRaw === 'ESTABLISHED' ? tierRaw : 'NEW';
      const coolingCfg = await getCoolingWindowConfigServer();
      const riskCfg = await getRiskEngineConfigServer();
      const tierCoolingHours = Math.max(0, Number(coolingCfg.hours_by_tier[vendorTier] ?? 0));
      const isAtOrAboveReviewThreshold =
        Number(txMeta?.total_amount || 0) >= Number(riskCfg.amount_review_threshold_ngn || 500000);
      const highValueCoolingHours = isAtOrAboveReviewThreshold
        ? Math.max(0, Number(coolingCfg.high_value_cooling_hours ?? coolingCfg.hours_by_tier.NEW ?? 2))
        : 0;
      coolingHours = Math.max(tierCoolingHours, highValueCoolingHours);
    }

    // 2. Compute HMAC-SHA256 keyed by server-side RELEASE_CODE_PEPPER
    const hmacHash = computeReleaseCodeHmac(transactionId, cleanCode);

    // 3. Atomic Database Verification & Row Lock (SELECT ... FOR UPDATE)
    let rpcResult: any = null;
    let rpcError: any = null;

    const firstRpc = await supabase.rpc('rpc_verify_and_prepare_release', {
      p_transaction_id: transactionId,
      p_hmac_hash: hmacHash,
      p_max_attempts: MAX_CODE_ATTEMPTS,
      p_cooling_hours: coolingHours,
    });
    rpcResult = firstRpc.data;
    rpcError = firstRpc.error;

    // Schema/function-signature fallback when Staging hasn't applied STAGING-ADDITIONS.sql yet
    if (
      rpcError &&
      (rpcError.code === 'PGRST202' ||
        String(rpcError.message || '').includes('Could not find the function') ||
        String(rpcError.message || '').includes('p_cooling_hours'))
    ) {
      const hotSettings = await getHotSettings();
      const allowlistMode =
        hotSettings.vendor_allowlist_mode !== undefined
          ? Boolean(hotSettings.vendor_allowlist_mode === true || hotSettings.vendor_allowlist_mode === 'true')
          : false;

      if (!txMeta) {
        return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
      }
      if (txMeta.status === 'DISPUTED') {
        return NextResponse.json(
          { success: false, error: 'Transaction is in dispute. Code verification is disabled.' },
          { status: 400 }
        );
      }
      if (['RELEASING', 'VENDOR_PAID', 'RELEASED'].includes(txMeta.status)) {
        return NextResponse.json(
          { success: false, error: 'Transaction is already releasing or completed.' },
          { status: 400 }
        );
      }
      if (!['FUNDS_LOCKED', 'DISPATCHED'].includes(txMeta.status)) {
        return NextResponse.json(
          { success: false, error: `Invalid state: transaction is ${txMeta.status}` },
          { status: 400 }
        );
      }
      if (txMeta.code_locked || (txMeta.failed_code_attempts || 0) >= MAX_CODE_ATTEMPTS) {
        return NextResponse.json(
          { success: false, error: 'Transaction is locked due to too many failed attempts.', isLocked: true },
          { status: 423 }
        );
      }
      if (txMeta.code_expires_at && new Date() > new Date(txMeta.code_expires_at)) {
        return NextResponse.json(
          { success: false, error: 'Release code has expired. Dispute arbitration required.' },
          { status: 410 }
        );
      }

      const coolingMem = getCoolingFallbackMap().get(transactionId);
      const aBuf = Buffer.from(String(txMeta.release_code_hash || ''), 'utf8');
      const bBuf = Buffer.from(hmacHash, 'utf8');
      const codeMatches = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);

      if (!codeMatches) {
        const nextAttempts = Number(txMeta.failed_code_attempts || 0) + 1;
        const locked = nextAttempts >= MAX_CODE_ATTEMPTS;
        await supabase
          .from('transactions')
          .update({
            failed_code_attempts: nextAttempts,
            code_locked: locked,
            code_locked_at: locked ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', transactionId);
        return NextResponse.json(
          {
            success: false,
            error: locked ? 'Maximum verification attempts exceeded. Escrow is locked.' : 'Invalid 6-digit release code.',
            remainingAttempts: Math.max(0, MAX_CODE_ATTEMPTS - nextAttempts),
            isLocked: locked,
          },
          { status: locked ? 423 : 400 }
        );
      }

      const { data: vRow } = txMeta.vendor_id
        ? await supabase.from('vendors').select('*').eq('id', txMeta.vendor_id).maybeSingle()
        : { data: null };

      if (vRow && allowlistMode && !vRow.is_allowlisted) {
        return NextResponse.json(
          { success: false, error: 'Vendor is not on the active launch allowlist. Payout blocked.' },
          { status: 422 }
        );
      }

      if (coolingHours > 0 && !coolingMem) {
        const availAt = new Date(Date.now() + coolingHours * 3600_000).toISOString();
        getCoolingFallbackMap().set(transactionId, {
          payoutAvailableAt: availAt,
          coolingWindowHours: coolingHours,
        });
        rpcError = null;
        rpcResult = {
          success: true,
          cooling_active: true,
          cooling_window_hours: coolingHours,
          payout_available_at: availAt,
          status_code: 202,
        };
      } else if (coolingMem && Date.now() < new Date(coolingMem.payoutAvailableAt).getTime()) {
        rpcError = null;
        rpcResult = {
          success: true,
          cooling_active: true,
          cooling_window_hours: coolingMem.coolingWindowHours,
          payout_available_at: coolingMem.payoutAvailableAt,
          status_code: 202,
        };
      } else {
        await supabase
          .from('transactions')
          .update({
            status: 'RELEASING',
            releasing_at: new Date().toISOString(),
            failed_code_attempts: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', transactionId);
        rpcError = null;
        rpcResult = {
          success: true,
          cooling_active: false,
          transaction_id: transactionId,
          item_price: txMeta.item_price,
          delivery_fee: txMeta.delivery_fee,
          protection_fee: txMeta.protection_fee,
          total_amount: txMeta.total_amount,
          vendor_payout_amount: Number(txMeta.total_amount) - Number(txMeta.protection_fee),
          vendor_id: vRow?.id || txMeta.vendor_id,
          vendor_handle: vRow?.store_name || txMeta.vendor_handle,
          vendor_anchor_account_id: vRow?.anchor_deposit_account_id,
        };
      }
    }

    if (rpcError) {
      console.error('RPC rpc_verify_and_prepare_release error:', rpcError);
      return NextResponse.json({ success: false, error: rpcError.message }, { status: 500 });
    }

    // 4. Handle Lockout or Incorrect Code
    if (!rpcResult.success) {
      if (rpcResult.is_locked) {
        sendSystemAlert({
          type: 'SECURITY_LOCKOUT',
          severity: 'CRITICAL',
          title: 'Brute-Force Lockout Activated (5 Failed Attempts)',
          transactionId,
          details: {
            clientIp,
            lockedAt: new Date().toISOString(),
          },
        }).catch(() => {});
      }

      return NextResponse.json(
        {
          success: false,
          error: rpcResult.error,
          remainingAttempts: rpcResult.remaining_attempts,
          isLocked: Boolean(rpcResult.is_locked),
        },
        { status: rpcResult.status_code || 400 }
      );
    }

    // 4b. Handle Active Cooling Window (HTTP 202, do NOT payout yet, notify buyer via WhatsApp)
    if (rpcResult.cooling_active) {
      const coolingCfg = await getCoolingWindowConfigServer();
      const coolingMem = getCoolingFallbackMap().get(transactionId);
      if (!coolingMem) {
        getCoolingFallbackMap().set(transactionId, {
          payoutAvailableAt: rpcResult.payout_available_at,
          coolingWindowHours: Number(rpcResult.cooling_window_hours || coolingHours),
        });
      }

      let waCoolingStatus = 'not_sent';
      if (coolingCfg.notify_buyer_on_code_use && txMeta?.buyer_phone) {
        const waNotice = await sendCoolingWindowWhatsappNotice(
          {
            transactionId,
            buyerPhone: txMeta.buyer_phone,
            itemName: txMeta.item_name || 'Escrow Order',
            totalAmount: Number(txMeta.total_amount || 0),
            coolingHours: Number(rpcResult.cooling_window_hours || coolingHours),
            payoutAvailableAt: String(rpcResult.payout_available_at),
            vendorId: txMeta.vendor_id || null,
            vendorHandle: txMeta.vendor_handle || null,
          },
          supabase
        );
        waCoolingStatus = waNotice.status;
      }

      return NextResponse.json(
        {
          success: true,
          status: 'COOLING_HOLD',
          coolingActive: true,
          coolingWindowHours: Number(rpcResult.cooling_window_hours || coolingHours),
          payoutAvailableAt: rpcResult.payout_available_at,
          whatsappCoolingNoticeStatus: waCoolingStatus,
          message: `Release code verified. Giving the code releases the money; payout enters a ${rpcResult.cooling_window_hours}-hour cooling hold until ${rpcResult.payout_available_at}.`,
        },
        { status: 202 }
      );
    }

    // Transaction is now safely locked in 'RELEASING' state!
    // Vendor payout amount is computed strictly in the database: total_amount - protection_fee
    const vendorPayoutAmountNaira = Number(rpcResult.vendor_payout_amount) || (Number(rpcResult.total_amount) - Number(rpcResult.protection_fee));
    const protectionFeeNaira = Number(rpcResult.protection_fee) || 500;

    // 5. Execution: Sandbox vs Live Split Transfers
    if (serverPaymentsMode === 'sandbox') {
      // In sandbox mode: Complete atomic transitions sequentially (RELEASING -> VENDOR_PAID -> RELEASED)
      await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'VENDOR_PAID',
        p_transfer_id: `sandbox_vendor_transfer_${transactionId}`,
        p_idempotency_key: `${transactionId}_PAYOUT_VENDOR`,
      });

      const { data: sandboxFinalStep } = await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'RELEASED',
        p_transfer_id: `sandbox_fee_transfer_${transactionId}`,
        p_idempotency_key: `${transactionId}_FEE_REVENUE`,
      });

      if (rpcResult.vendor_id || txMeta?.vendor_id) {
        await recordCompletedOrderAndEvaluateTier({
          vendorId: rpcResult.vendor_id || txMeta?.vendor_id,
          transactionId,
          preReleaseSalesCount,
          alreadyIncrementedInDb: Boolean(sandboxFinalStep?.vendor_sales_incremented),
          supabaseClient: supabase,
        }).catch(() => {});
      }

      const { data: finalTx } = await supabase.from('transactions').select(SAFE_TRANSACTION_PUBLIC_COLUMNS).eq('id', transactionId).single();
      return NextResponse.json({ success: true, transaction: finalTx });
    }

    // LIVE PRODUCTION MULTI-LEG SETTLEMENT:
    // Destination account resolved strictly from vendors table via service role
    const vendorAnchorAccountId = rpcResult.vendor_anchor_account_id;
    if (!vendorAnchorAccountId) {
      sendSystemAlert({
        type: 'PAYOUT_FAILURE',
        severity: 'CRITICAL',
        title: 'Vendor Deposit Account Missing During Live Release',
        transactionId,
        vendorHandle: rpcResult.vendor_handle,
        details: { message: 'Vendor has no linked anchor_deposit_account_id in vendors table.' },
      }).catch(() => {});

      return NextResponse.json(
        {
          success: false,
          error: 'Vendor does not have a verified Anchor payout deposit account linked. Escrow remains held in custody.',
        },
        { status: 422 }
      );
    }

    const leg1IdempotencyKey = `relyvora_${transactionId}_leg1_vendor`;
    const leg2IdempotencyKey = `relyvora_${transactionId}_leg2_fee`;

    // LEG 1: Vendor Share BookTransfer
    let leg1TransferId: string;
    try {
      const vendorTransfer = await executeAnchorBookTransfer({
        sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
        destinationAccountId: vendorAnchorAccountId,
        amount: Math.round(vendorPayoutAmountNaira * 100), // Kobo: vendor share = total_amount - protection_fee
        reason: `Relyvora Escrow Payout: ${rpcResult.vendor_handle} (${transactionId.slice(0, 8)})`,
        reference: leg1IdempotencyKey,
      });

      leg1TransferId = vendorTransfer.transferId;

      // Update state to VENDOR_PAID
      await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'VENDOR_PAID',
        p_transfer_id: leg1TransferId,
        p_idempotency_key: leg1IdempotencyKey,
      });
    } catch (leg1Error: any) {
      console.error('CRITICAL: Leg 1 Vendor Payout Failed:', leg1Error);
      sendSystemAlert({
        type: 'PAYOUT_FAILURE',
        severity: 'CRITICAL',
        title: 'Anchor Settlement Leg 1 Failure (Vendor Payout)',
        transactionId,
        vendorHandle: rpcResult.vendor_handle,
        details: {
          errorMessage: leg1Error.message,
          amountNaira: vendorPayoutAmountNaira,
          idempotencyKey: leg1IdempotencyKey,
        },
      }).catch(() => {});

      // Stay in RELEASING state; do not proceed to Leg 2
      return NextResponse.json(
        {
          success: false,
          error: 'Code verified successfully, but banking transfer to vendor failed: ' + leg1Error.message,
        },
        { status: 502 }
      );
    }

    // LEG 2: Relyvora Platform Protection Fee BookTransfer
    let leg2TransferId: string;
    try {
      const feeTransfer = await executeAnchorBookTransfer({
        sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
        destinationAccountId: RELYVORA_REVENUE_ACCOUNT_ID,
        amount: Math.round(protectionFeeNaira * 100), // Kobo
        reason: `Relyvora Protection Fee Collection (${transactionId.slice(0, 8)})`,
        reference: leg2IdempotencyKey,
      });

      leg2TransferId = feeTransfer.transferId;

      // Update state to RELEASED
      const { data: liveFinalStep } = await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'RELEASED',
        p_transfer_id: leg2TransferId,
        p_idempotency_key: leg2IdempotencyKey,
      });

      if (rpcResult.vendor_id || txMeta?.vendor_id) {
        await recordCompletedOrderAndEvaluateTier({
          vendorId: rpcResult.vendor_id || txMeta?.vendor_id,
          transactionId,
          preReleaseSalesCount,
          alreadyIncrementedInDb: Boolean(liveFinalStep?.vendor_sales_incremented),
          supabaseClient: supabase,
        }).catch(() => {});
      }
    } catch (leg2Error: any) {
      console.error('WARNING: Leg 2 Fee Collection Failed (Vendor was already paid!):', leg2Error);
      sendSystemAlert({
        type: 'PAYOUT_FAILURE',
        severity: 'CRITICAL',
        title: 'Anchor Settlement Leg 2 Failure (Fee Revenue)',
        transactionId,
        vendorHandle: rpcResult.vendor_handle,
        details: {
          errorMessage: leg2Error.message,
          feeNaira: protectionFeeNaira,
          idempotencyKey: leg2IdempotencyKey,
          leg1VendorTransferId: leg1TransferId,
          note: 'Vendor was successfully paid. Only platform fee collection requires retry.',
        },
      }).catch(() => {});

      // Row is in VENDOR_PAID state. Leg 1 will NOT be resent on retry!
      return NextResponse.json({
        success: true,
        status: 'VENDOR_PAID',
        warning: 'Vendor payout completed. Platform revenue leg pending automated retry.',
      });
    }

    const { data: finalTx } = await supabase.from('transactions').select(SAFE_TRANSACTION_PUBLIC_COLUMNS).eq('id', transactionId).single();
    return NextResponse.json({ success: true, transaction: finalTx });
  } catch (err: any) {
    console.error('Unhandled error in release route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
