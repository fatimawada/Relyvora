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
  calculateDeliveryWindowCodeExpiration,
} from '@/lib/releaseCode';
import { getDeliveryAndLifecycleConfig } from '@/lib/orderLifecycle';
import { attachBuyerSessionCookie, mintBuyerSessionToken } from '@/lib/buyerSession';
import { SAFE_TRANSACTION_PUBLIC_COLUMNS } from '@/lib/transactionSelect';

export async function POST(request: NextRequest) {
  try {
    // Gate 1: Block simulated payments on live/production deployments strictly
    if (isLiveMode() || process.env.VERCEL_ENV === 'production') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Simulated payment confirmation is disabled in live/production mode. Payments must be deposited via Virtual NUBAN.',
        },
        { status: 403 }
      );
    }

    const liveGate = await evaluateLivePaymentGateServer({ requireVendorKyc: false });
    if (!liveGate.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: liveGate.code || 'LAUNCH_NOT_LIVE',
          error: liveGate.error || 'Payment confirmation gated.',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { transactionId, paymentMethod = 'SANDBOX_VIRTUAL_NUBAN' } = body || {};

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // 1. Distributed IP + Transaction Rate Limiting (Fail Closed)
    const clientIp = getClientIp(request);
    const [ipRateCheck, txRateCheck] = await Promise.all([
      checkSharedRateLimit(`${clientIp}:confirm_payment`, 15, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`tx:${transactionId}:confirm_payment`, 10, 15 * 60 * 1000, supabase),
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

    // 3. Generate cryptographic release code & delivery window deadlines (never stored plaintext in DB)
    const cfg = await getDeliveryAndLifecycleConfig(supabase);
    const deliveryType = existing.delivery_type === 'interstate' ? 'interstate' : 'same_city';
    const rawCode = generateCryptographicReleaseCode();
    const hmacHash = computeReleaseCodeHmac(transactionId, rawCode);
    const expiryInfo = calculateDeliveryWindowCodeExpiration(deliveryType, cfg.delivery);
    const now = new Date().toISOString();
    const dispatchDeadlineAt = new Date(
      Date.now() + cfg.delivery.dispatch_deadline_days * 24 * 3600 * 1000
    ).toISOString();
    const sandboxBuyerPhone = existing.buyer_phone || '+2348000000000';

    // 4. Atomically update status to FUNDS_LOCKED with sandbox virtual deposit ref & expiry
    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: 'FUNDS_LOCKED',
        release_code_hash: hmacHash,
        code_expires_at: expiryInfo.codeExpiresAt,
        delivery_deadline_at: expiryInfo.deliveryDeadlineAt,
        dispatch_deadline_at: dispatchDeadlineAt,
        amount_paid: Number(existing.total_amount) || 0,
        anchor_deposit_id: `sandbox_deposit_${Date.now()}`,
        buyer_phone: sandboxBuyerPhone,
        buyer_phone_verified: existing.whatsapp_blocked ? Boolean(existing.buyer_phone_verified) : true,
        buyer_phone_verified_at: existing.buyer_phone_verified_at || now,
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
      toAccount: existing.virtual_account_number || 'Relyvora Escrow Vault',
      idempotencyKey: `ledger_${transactionId}_DEPOSIT_LOCKED`,
      metadata: {
        paymentMethod,
        mode: 'sandbox',
        virtualAccountNumber: existing.virtual_account_number || null,
      },
    });

    const response = NextResponse.json({
      success: true,
      transaction: updated,
      sandbox_release_code: rawCode,
      code_notice: 'Test code: in live mode this is sent by WhatsApp.',
    });

    // Attach signed HttpOnly buyer session cookie in sandbox so buyer opens /order/[id] seamlessly
    if (!existing.whatsapp_blocked && process.env.BUYER_SESSION_SECRET?.trim()) {
      try {
        const session = mintBuyerSessionToken({
          txId: transactionId,
          buyerPhone: sandboxBuyerPhone,
        });
        attachBuyerSessionCookie(response, request, session.token);
      } catch {
        // Ignore if BUYER_SESSION_SECRET is missing in isolated unit tests
      }
    }

    return response;
  } catch (err: any) {
    console.error('Error confirming escrow payment:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
