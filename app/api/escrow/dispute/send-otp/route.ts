import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getClientIp, checkSharedRateLimit } from '@/lib/rateLimit';
import { sendBuyerOtpSms, maskPhoneNumber } from '@/lib/smsDelivery';
import { isLiveMode } from '@/lib/paymentsMode';
import { computeReleaseCodeHmac } from '@/lib/releaseCode';
import { resolveOrderActor } from '@/lib/orderAuth';
import { computeBuyerPhoneBindingHash } from '@/lib/buyerSession';
import { sendSystemAlert } from '@/lib/alerts';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId } = body || {};

    if (!transactionId || typeof transactionId !== 'string') {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // 1. Fetch transaction & enforce strict BUYER session authentication
    const { data: tx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, vendor_id, vendor_handle, status, buyer_phone, buyer_phone_verified, whatsapp_blocked, code_verified_at, item_name')
      .eq('id', transactionId)
      .maybeSingle();

    if (fetchErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Dispute Send-OTP Transaction Query Failed (Fail Closed)',
        transactionId,
        details: { error: fetchErr.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: `Transaction lookup failed: ${fetchErr.message}` }, { status: 500 });
    }

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    const actor = await resolveOrderActor(request, tx, supabase);
    if (!actor.authenticated) {
      return NextResponse.json(
        { success: false, code: actor.code, error: actor.error || 'Buyer authentication required.' },
        { status: actor.statusCode || 401 }
      );
    }

    if (actor.role !== 'BUYER') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Only the verified buyer can request a dispute OTP.' },
        { status: 403 }
      );
    }

    // 2. Distributed Rate Limiting across IP, Transaction, and Verified Phone Hash
    const clientIp = getClientIp(request);
    const phoneHash = computeBuyerPhoneBindingHash(tx.buyer_phone);
    const [ipRl, txRl, phRl] = await Promise.all([
      checkSharedRateLimit(`${clientIp}:dispute_otp`, 5, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`tx:${transactionId}:dispute_otp`, 3, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`ph:${phoneHash}:dispute_otp`, 5, 15 * 60 * 1000, supabase),
    ]);
    if (!ipRl.allowed || !txRl.allowed || !phRl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many OTP requests. Please wait 15 minutes before requesting again.' },
        { status: 429 }
      );
    }

    // 3. Status Eligibility Check (including post-code acceptance lock)
    if (tx.status === 'RELEASED' || tx.status === 'RELEASING' || tx.status === 'VENDOR_PAID' || tx.code_verified_at) {
      return NextResponse.json(
        { success: false, error: 'Cannot dispute a transaction after the release code has been accepted.' },
        { status: 400 }
      );
    }

    if (tx.status === 'DISPUTED' || tx.status === 'RESOLVING' || tx.status === 'REFUNDED') {
      return NextResponse.json(
        { success: false, error: `Transaction is already in '${tx.status}' state.` },
        { status: 400 }
      );
    }

    if (tx.status !== 'FUNDS_LOCKED' && tx.status !== 'DISPATCHED') {
      return NextResponse.json(
        { success: false, error: `Cannot dispute transaction in status '${tx.status}'. Escrow funds must be locked first.` },
        { status: 400 }
      );
    }

    if (!tx.buyer_phone) {
      return NextResponse.json(
        { success: false, error: 'No verified buyer phone number is linked to this escrow order.' },
        { status: 400 }
      );
    }

    // 4. Generate 6-Digit Cryptographic OTP & compute domain-separated HMAC
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = computeReleaseCodeHmac(`dispute:${transactionId}`, otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // 5. Store OTP Hash and Reset Attempt Counter on Transaction
    const { error: updateErr } = await supabase
      .from('transactions')
      .update({
        dispute_otp_hash: otpHash,
        dispute_otp_expires_at: expiresAt,
        dispute_otp_attempts: 0,
      })
      .eq('id', transactionId);

    if (updateErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Dispute OTP Persistence Failed (Fail Closed)',
        transactionId,
        details: { error: updateErr.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // 6. Mask Buyer Phone & dispatch via WhatsApp
    const maskedPhone = maskPhoneNumber(tx.buyer_phone);
    const smsRes = await sendBuyerOtpSms({
      transactionId,
      buyerPhone: tx.buyer_phone,
      otp,
      purpose: 'dispute',
    });

    if (!smsRes.success) {
      return NextResponse.json(
        { success: false, error: smsRes.error || 'Failed to send dispute OTP to buyer WhatsApp.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${maskedPhone}.`,
      maskedPhone,
      expiresInMinutes: 10,
      ...(isLiveMode() ? {} : { sandbox_otp: otp }),
    });
  } catch (err: any) {
    console.error('Unhandled error in send dispute OTP route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
