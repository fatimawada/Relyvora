import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getServerPaymentsMode } from '@/lib/paymentsMode';
import { evaluateLivePaymentGateServer } from '@/lib/launchGates';
import { computeReleaseCodeHmac, MAX_CODE_ATTEMPTS } from '@/lib/releaseCode';
import { getClientIp, checkSharedRateLimit } from '@/lib/rateLimit';
import { sendSystemAlert } from '@/lib/alerts';
import { resolveOrderActor } from '@/lib/orderAuth';
import { SAFE_TRANSACTION_PUBLIC_COLUMNS } from '@/lib/transactionSelect';
import {
  getCoolingWindowConfigServer,
  getRiskEngineConfigServer,
  isPayoutsEnabledServer,
} from '@/lib/safetyLimits';
import { checkVendorPayoutSafetyGate } from '@/lib/payoutSafety';
import { recordCompletedOrderAndEvaluateTier } from '@/lib/vendorTiers';
import { sendCoolingWindowWhatsappNotice } from '@/lib/whatsapp';
import {
  executeAnchorBookTransfer,
  RELYVORA_FBO_ACCOUNT_ID,
  RELYVORA_REVENUE_ACCOUNT_ID,
} from '@/lib/anchor';

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

    const body = await request.json();
    const { transactionId, releaseCode, sandboxSkipCoolingHold } = body || {};

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
    const serverPaymentsMode = getServerPaymentsMode();

    // 1. Fetch transaction & strictly authenticate actor (owning VENDOR, verified BUYER, or AAL2 ADMIN)
    const { data: txMeta, error: txMetaErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (txMetaErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Release Transaction Query Failed (Fail Closed)',
        transactionId,
        details: { error: txMetaErr.message },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: `Transaction lookup failed: ${txMetaErr.message}` },
        { status: 500 }
      );
    }

    if (!txMeta) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    const actor = await resolveOrderActor(request, txMeta, supabase);
    if (!actor.authenticated) {
      return NextResponse.json(
        {
          success: false,
          code: actor.code || 'AUTH_REQUIRED',
          error: actor.error || 'Authentication required to release escrow funds.',
        },
        { status: actor.statusCode || 401 }
      );
    }

    const liveGate = await evaluateLivePaymentGateServer({
      vendorId: txMeta.vendor_id,
      supabaseClient: supabase,
    });
    if (!liveGate.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: liveGate.code || 'PAYMENTS_NOT_LIVE',
          error: liveGate.error || 'Payments open soon.',
        },
        { status: 403 }
      );
    }

    // 2. Distributed Dual Rate Limiting (IP + Transaction ID — blocks X-Forwarded-For spoofing)
    const clientIp = getClientIp(request);
    const [ipRl, txRl] = await Promise.all([
      checkSharedRateLimit(`${clientIp}:escrow_release`, 12, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`tx:${transactionId}:escrow_release`, 10, 15 * 60 * 1000, supabase),
    ]);
    if (!ipRl.allowed || !txRl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many verification attempts. Please wait 15 minutes.' },
        { status: 429 }
      );
    }

    // 3. Risk Hold, Self-Dealing Block & Payout Safety Gates
    if (txMeta.order_blocked) {
      return NextResponse.json(
        {
          success: false,
          code: 'ORDER_BLOCKED',
          error:
            txMeta.order_block_reason ||
            'Transaction is blocked due to high-risk/self-dealing detection. Payout refused.',
        },
        { status: 423 }
      );
    }

    if (txMeta.review_hold) {
      return NextResponse.json(
        {
          success: false,
          code: 'RISK_REVIEW_HOLD',
          error:
            txMeta.review_hold_reason ||
            'Transaction is on risk review hold. Admin clearance is required before payout.',
        },
        { status: 423 }
      );
    }

    let coolingHours = 0;
    let preReleaseSalesCount: number | undefined;
    if (txMeta.vendor_id) {
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

      const { data: vendorRow, error: vendorErr } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', txMeta.vendor_id)
        .single();

      if (vendorErr || !vendorRow) {
        await sendSystemAlert({
          type: 'SYSTEM_FAILURE',
          severity: 'CRITICAL',
          title: 'Release Vendor Record Query Failed (Fail Closed)',
          transactionId,
          details: { vendorId: txMeta.vendor_id, error: vendorErr?.message || 'Not found' },
        }).catch(() => {});
        return NextResponse.json(
          { success: false, error: `Vendor record lookup failed: ${vendorErr?.message || 'not found'}` },
          { status: 500 }
        );
      }

      if (typeof vendorRow.successful_sales_count === 'number') {
        preReleaseSalesCount = vendorRow.successful_sales_count;
      } else if (typeof vendorRow.completed_orders_count === 'number') {
        preReleaseSalesCount = vendorRow.completed_orders_count;
      }

      const tierRaw = String(vendorRow.tier || 'NEW').toUpperCase();
      const vendorTier =
        tierRaw === 'TRUSTED' || tierRaw === 'ESTABLISHED' ? tierRaw : 'NEW';
      const coolingCfg = await getCoolingWindowConfigServer();
      const riskCfg = await getRiskEngineConfigServer();
      const tierCoolingHours = Math.max(0, Number(coolingCfg.hours_by_tier[vendorTier] ?? 0));
      const isAtOrAboveReviewThreshold =
        Number(txMeta.total_amount || 0) >= Number(riskCfg.amount_review_threshold_ngn || 500000);
      const highValueCoolingHours = isAtOrAboveReviewThreshold
        ? Math.max(0, Number(coolingCfg.high_value_cooling_hours ?? coolingCfg.hours_by_tier.NEW ?? 2))
        : 0;
      coolingHours = Math.max(tierCoolingHours, highValueCoolingHours);
    }

    const effectiveCoolingHours =
      sandboxSkipCoolingHold === true &&
      serverPaymentsMode === 'sandbox' &&
      process.env.VERCEL_ENV !== 'production'
        ? 0
        : coolingHours;

    // 4. Compute HMAC-SHA256 keyed by server-side RELEASE_CODE_PEPPER
    const hmacHash = computeReleaseCodeHmac(transactionId, cleanCode);

    // 5. Atomic Database Verification & Row Lock (strictly via RPC — fail closed on missing/errored RPC)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('rpc_verify_and_prepare_release', {
      p_transaction_id: transactionId,
      p_hmac_hash: hmacHash,
      p_max_attempts: MAX_CODE_ATTEMPTS,
      p_cooling_hours: effectiveCoolingHours,
    });

    if (rpcError || !rpcResult) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'RPC rpc_verify_and_prepare_release Failed (Fail Closed)',
        transactionId,
        details: { error: rpcError?.message || 'Empty RPC response' },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: rpcError?.message || 'Escrow release RPC failed.' },
        { status: 500 }
      );
    }

    // 6. Handle Lockout or Incorrect Code
    if (!rpcResult.success) {
      if (rpcResult.is_locked) {
        sendSystemAlert({
          type: 'SECURITY_LOCKOUT',
          severity: 'CRITICAL',
          title: 'Brute-Force Lockout Activated (5 Failed Attempts)',
          transactionId,
          details: {
            clientIp,
            actorRole: actor.role,
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

    // 7. Handle Active Cooling Window (HTTP 202, do NOT payout yet, notify buyer via WhatsApp)
    if (rpcResult.cooling_active) {
      const coolingCfg = await getCoolingWindowConfigServer();
      let waCoolingStatus = 'not_sent';
      if (coolingCfg.notify_buyer_on_code_use && txMeta.buyer_phone) {
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
    const vendorPayoutAmountNaira =
      Number(rpcResult.vendor_payout_amount) || (Number(rpcResult.total_amount) - Number(rpcResult.protection_fee));
    const protectionFeeNaira = Number(rpcResult.protection_fee) || 500;

    // 8. Execution: Sandbox vs Live Split Transfers
    if (serverPaymentsMode === 'sandbox') {
      let vendorTransferId = `sandbox_vendor_transfer_${transactionId}`;
      let feeTransferId = `sandbox_fee_transfer_${transactionId}`;
      let anchorSandboxAttempted = false;

      if (
        txMeta.anchor_deposit_id &&
        !String(txMeta.anchor_deposit_id).startsWith('sandbox_deposit_') &&
        rpcResult.vendor_anchor_account_id &&
        process.env.ANCHOR_SECRET_KEY?.trim()
      ) {
        try {
          anchorSandboxAttempted = true;
          const vTr = await executeAnchorBookTransfer({
            sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
            destinationAccountId: rpcResult.vendor_anchor_account_id,
            amount: Math.round(vendorPayoutAmountNaira * 100),
            reason: `Relyvora Sandbox Payout (${transactionId.slice(0, 8)})`,
            reference: `rv_sbx_${transactionId}_leg1`,
          });
          vendorTransferId = vTr.transferId;
          const fTr = await executeAnchorBookTransfer({
            sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
            destinationAccountId: RELYVORA_REVENUE_ACCOUNT_ID,
            amount: Math.round(protectionFeeNaira * 100),
            reason: `Relyvora Sandbox Protection Fee (${transactionId.slice(0, 8)})`,
            reference: `rv_sbx_${transactionId}_leg2`,
          });
          feeTransferId = fTr.transferId;
        } catch (sbxAnchorErr: any) {
          console.warn(
            '[SANDBOX RELEASE] Anchor Sandbox BookTransfer fell back to ledger sandbox transfer IDs:',
            sbxAnchorErr?.message || sbxAnchorErr
          );
        }
      }

      const { error: step1Err } = await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'VENDOR_PAID',
        p_transfer_id: vendorTransferId,
        p_idempotency_key: `${transactionId}_PAYOUT_VENDOR`,
      });
      if (step1Err) {
        await sendSystemAlert({
          type: 'SYSTEM_FAILURE',
          severity: 'CRITICAL',
          title: 'RPC rpc_finalize_release_step (VENDOR_PAID) Failed',
          transactionId,
          details: { error: step1Err.message },
        }).catch(() => {});
        return NextResponse.json({ success: false, error: step1Err.message }, { status: 500 });
      }

      const { data: sandboxFinalStep, error: step2Err } = await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'RELEASED',
        p_transfer_id: feeTransferId,
        p_idempotency_key: `${transactionId}_FEE_REVENUE`,
      });
      if (step2Err) {
        await sendSystemAlert({
          type: 'SYSTEM_FAILURE',
          severity: 'CRITICAL',
          title: 'RPC rpc_finalize_release_step (RELEASED) Failed',
          transactionId,
          details: { error: step2Err.message },
        }).catch(() => {});
        return NextResponse.json({ success: false, error: step2Err.message }, { status: 500 });
      }

      if (rpcResult.vendor_id || txMeta.vendor_id) {
        await recordCompletedOrderAndEvaluateTier({
          vendorId: rpcResult.vendor_id || txMeta.vendor_id,
          transactionId,
          preReleaseSalesCount,
          alreadyIncrementedInDb: Boolean(sandboxFinalStep?.vendor_sales_incremented),
          supabaseClient: supabase,
        });
      }

      const { data: finalTx, error: finalErr } = await supabase
        .from('transactions')
        .select(
          `${SAFE_TRANSACTION_PUBLIC_COLUMNS}, vendor_paid_at, anchor_vendor_transfer_id, anchor_fee_transfer_id, anchor_transfer_id, anchor_revenue_transfer_id`
        )
        .eq('id', transactionId)
        .single();
      if (finalErr || !finalTx) {
        return NextResponse.json(
          { success: false, error: finalErr?.message || 'Failed loading released transaction.' },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        transaction: finalTx,
        payoutTransfer: {
          mode: 'sandbox',
          label: 'Test — Vendor Payout Transfer',
          transferId: finalTx.anchor_vendor_transfer_id || vendorTransferId,
          amountNaira: vendorPayoutAmountNaira,
          destinationAccountId: rpcResult.vendor_anchor_account_id || null,
          anchorSandboxAttempted,
        },
        feeTransfer: {
          mode: 'sandbox',
          label: 'Test — Platform Fee Transfer',
          transferId: finalTx.anchor_fee_transfer_id || feeTransferId,
          amountNaira: protectionFeeNaira,
          destinationAccountId: RELYVORA_REVENUE_ACCOUNT_ID,
          anchorSandboxAttempted,
        },
      });
    }

    // LIVE PRODUCTION MULTI-LEG SETTLEMENT
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
        amount: Math.round(vendorPayoutAmountNaira * 100),
        reason: `Relyvora Escrow Payout: ${rpcResult.vendor_handle} (${transactionId.slice(0, 8)})`,
        reference: leg1IdempotencyKey,
      });

      leg1TransferId = vendorTransfer.transferId;

      const { error: leg1RpcErr } = await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'VENDOR_PAID',
        p_transfer_id: leg1TransferId,
        p_idempotency_key: leg1IdempotencyKey,
      });
      if (leg1RpcErr) {
        throw new Error(`rpc_finalize_release_step VENDOR_PAID failed: ${leg1RpcErr.message}`);
      }
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
        amount: Math.round(protectionFeeNaira * 100),
        reason: `Relyvora Protection Fee Collection (${transactionId.slice(0, 8)})`,
        reference: leg2IdempotencyKey,
      });

      leg2TransferId = feeTransfer.transferId;

      const { data: liveFinalStep, error: leg2RpcErr } = await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'RELEASED',
        p_transfer_id: leg2TransferId,
        p_idempotency_key: leg2IdempotencyKey,
      });
      if (leg2RpcErr) {
        throw new Error(`rpc_finalize_release_step RELEASED failed: ${leg2RpcErr.message}`);
      }

      if (rpcResult.vendor_id || txMeta.vendor_id) {
        await recordCompletedOrderAndEvaluateTier({
          vendorId: rpcResult.vendor_id || txMeta.vendor_id,
          transactionId,
          preReleaseSalesCount,
          alreadyIncrementedInDb: Boolean(liveFinalStep?.vendor_sales_incremented),
          supabaseClient: supabase,
        });
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

      return NextResponse.json({
        success: true,
        status: 'VENDOR_PAID',
        warning: 'Vendor payout completed. Platform revenue leg pending automated retry.',
      });
    }

    const { data: finalTx, error: finalErr } = await supabase
      .from('transactions')
      .select(SAFE_TRANSACTION_PUBLIC_COLUMNS)
      .eq('id', transactionId)
      .single();
    if (finalErr || !finalTx) {
      return NextResponse.json(
        { success: false, error: finalErr?.message || 'Failed loading released transaction.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, transaction: finalTx });
  } catch (err: any) {
    console.error('Unhandled error in release route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
