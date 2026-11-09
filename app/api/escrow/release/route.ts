import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { isSandboxMode, getServerPaymentsMode } from '@/lib/paymentsMode';
import { computeReleaseCodeHmac, MAX_CODE_ATTEMPTS } from '@/lib/releaseCode';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';
import { sendSystemAlert } from '@/lib/alerts';
import { 
  executeAnchorBookTransfer, 
  RELYVORA_FBO_ACCOUNT_ID, 
  RELYVORA_REVENUE_ACCOUNT_ID,
  AnchorApiError 
} from '@/lib/anchor';

export async function POST(request: NextRequest) {
  try {
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

    // 2. Compute HMAC-SHA256 keyed by server-side RELEASE_CODE_PEPPER
    const hmacHash = computeReleaseCodeHmac(transactionId, cleanCode);

    // 3. Atomic Database Verification & Row Lock (SELECT ... FOR UPDATE)
    // Runs inside rpc_verify_and_prepare_release Postgres function.
    // Verifies: status (FUNDS_LOCKED/DISPATCHED), no dispute, deposit funded, not expired,
    // constant-time HMAC comparison, atomic attempt incrementing, and transitions to RELEASING.
    const { data: rpcResult, error: rpcError } = await supabase.rpc('rpc_verify_and_prepare_release', {
      p_transaction_id: transactionId,
      p_hmac_hash: hmacHash,
      p_max_attempts: MAX_CODE_ATTEMPTS,
    });

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

    // Transaction is now safely locked in 'RELEASING' state!
    const itemPriceNaira = Number(rpcResult.item_price) || 0;
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

      await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'RELEASED',
        p_transfer_id: `sandbox_fee_transfer_${transactionId}`,
        p_idempotency_key: `${transactionId}_FEE_REVENUE`,
      });

      const { data: finalTx } = await supabase.from('transactions').select('*').eq('id', transactionId).single();
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
        amount: Math.round(itemPriceNaira * 100), // Kobo
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
          amountNaira: itemPriceNaira,
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
      await supabase.rpc('rpc_finalize_release_step', {
        p_transaction_id: transactionId,
        p_step: 'RELEASED',
        p_transfer_id: leg2TransferId,
        p_idempotency_key: leg2IdempotencyKey,
      });
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

    const { data: finalTx } = await supabase.from('transactions').select('*').eq('id', transactionId).single();
    return NextResponse.json({ success: true, transaction: finalTx });
  } catch (err: any) {
    console.error('Unhandled error in release route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
