import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { isLiveMode } from '@/lib/paymentsMode';
import { evaluateLivePaymentGateServer } from '@/lib/launchGates';
import { isCheckoutEnabledServer } from '@/lib/safetyLimits';
import { recordLedgerEntry } from '@/lib/ledger';
import { getClientIp, checkSharedRateLimit } from '@/lib/rateLimit';
import { 
  generateCryptographicReleaseCode, 
  computeReleaseCodeHmac, 
  calculateCodeExpiration 
} from '@/lib/releaseCode';
import { SAFE_TRANSACTION_PUBLIC_COLUMNS } from '@/lib/transactionSelect';

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production' || isLiveMode()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Simulated payment confirmation is disabled in live/production mode. Payments must be deposited via Providus Virtual NUBAN.',
        },
        { status: 403 }
      );
    }

    const liveGate = await evaluateLivePaymentGateServer({ requireVendorKyc: false });
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

    const body = await request.json();
    const { transactionId, paymentMethod = 'SIMULATED' } = body || {};

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // 1. Distributed IP + Transaction Rate Limiting (Fail Closed)
    const clientIp = getClientIp(request);
    const [ipRateCheck, txRateCheck] = await Promise.all([
      checkSharedRateLimit(`${clientIp}:confirm_payment`, 10, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`tx:${transactionId}:confirm_payment`, 5, 15 * 60 * 1000, supabase),
    ]);
    if (!ipRateCheck.allowed || !txRateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait before attempting again.' },
        { status: 429 }
      );
    }

    const checkoutEnabled = await isCheckoutEnabledServer();
    if (!checkoutEnabled) {
      return NextResponse.json(
        { success: false, error: 'Checkout is temporarily disabled for maintenance.' },
        { status: 503 }
      );
    }

    if (isLiveMode()) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Simulated payment confirmation is disabled in live mode. Payments must be deposited via Providus Virtual NUBAN.' 
        },
        { status: 403 }
      );
    }

    // 2. Fetch current transaction
    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ success: false, error: `Transaction lookup failed: ${fetchErr.message}` }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    if (existing.status !== 'AWAITING_PAYMENT') {
      return NextResponse.json(
        { success: false, error: `Invalid state transition: transaction is currently in status '${existing.status}'.` },
        { status: 400 }
      );
    }

    // 3. Generate cryptographic release code and HMAC-SHA256 (keyed by server-side RELEASE_CODE_PEPPER)
    const rawCode = generateCryptographicReleaseCode();
    const hmacHash = computeReleaseCodeHmac(transactionId, rawCode);
    const codeExpiresAt = calculateCodeExpiration(72);
    const now = new Date().toISOString();

    const authToken = crypto.randomBytes(24).toString('hex');

    // 4. Atomically update status to FUNDS_LOCKED with Anchor deposit reference & expiry
    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: 'FUNDS_LOCKED',
        release_code_hash: hmacHash,
        code_expires_at: codeExpiresAt,
        amount_paid: Number(existing.total_amount) || 0,
        anchor_deposit_id: `sandbox_deposit_${Date.now()}`,
        failed_code_attempts: 0,
        code_locked: false,
        payment_method: paymentMethod,
        paid_at: now,
        updated_at: now,
      })
      .eq('id', transactionId)
      .select(SAFE_TRANSACTION_PUBLIC_COLUMNS)
      .single();

    if (updateErr) {
      console.error('Failed to update transaction to FUNDS_LOCKED:', updateErr);
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // 5. Record deposit in immutable transaction ledger
    await recordLedgerEntry({
      transactionId: transactionId,
      entryType: 'DEPOSIT_LOCKED',
      amount: Number(existing.total_amount) || 0,
      currency: 'NGN',
      fromAccount: `Buyer (${paymentMethod})`,
      toAccount: 'Relyvora Escrow Vault',
      idempotencyKey: `ledger_${transactionId}_DEPOSIT_LOCKED`,
      metadata: { paymentMethod, mode: 'sandbox' },
    });

    return NextResponse.json({ 
      success: true, 
      transaction: updated,
      sandbox_release_code: rawCode,
      buyer_auth_token: authToken,
    });
  } catch (err: any) {
    console.error('Unhandled error in confirm-payment:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
