import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import { generateCryptographicReleaseCode } from '@/lib/releaseCode';
import { sendSystemAlert } from '@/lib/alerts';
import {
  claimWhatsappWebhookEvent,
  isPhoneOnDoNotContact,
  maskWhatsappNumber,
  selectTransactionWithWhatsapp,
  sendOtpWhatsappTemplate,
} from '@/lib/whatsapp';
import {
  attachBuyerOtpChallengeCookie,
  attachBuyerSessionCookie,
  BUYER_OTP_CHALLENGE_TTL_SECONDS,
  clearBuyerOtpChallengeCookie,
  clearBuyerSessionCookie,
  computeBuyerPhoneBindingHash,
  MAX_BUYER_OTP_CHALLENGE_ATTEMPTS,
  mintBuyerOtpChallengeToken,
  mintBuyerSessionToken,
  verifyBuyerOtpChallengeCookie,
} from '@/lib/buyerSession';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const transactionId = typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
    const action = typeof body?.action === 'string' ? body.action.trim() : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';

    if (!transactionId || !['request_code', 'verify_code'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid transactionId or action (request_code | verify_code).' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const { data: tx, error: txErr } = await selectTransactionWithWhatsapp<any>(
      supabase,
      transactionId,
      'id, vendor_id, vendor_handle, buyer_phone, status'
    );
    if (txErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Buyer Session Transaction Query Failed (Fail Closed)',
        transactionId,
        details: { error: txErr.message || String(txErr) },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: 'Transaction lookup failed.' }, { status: 500 });
    }

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Escrow order not found.' }, { status: 404 });
    }

    if (tx.buyer_phone_verified !== true || !tx.buyer_phone) {
      return NextResponse.json(
        {
          success: false,
          code: 'BUYER_WHATSAPP_NOT_VERIFIED',
          error: 'Buyer WhatsApp number must be verified before creating a buyer session.',
        },
        { status: 403 }
      );
    }

    if (tx.whatsapp_blocked === true) {
      return NextResponse.json(
        {
          success: false,
          code: 'WHATSAPP_BLOCKED',
          error: 'WhatsApp delivery is blocked for this order.',
        },
        { status: 403 }
      );
    }

    const dnc = await isPhoneOnDoNotContact(tx.buyer_phone, supabase);
    if (dnc.blocked) {
      return NextResponse.json(
        {
          success: false,
          code: 'BUYER_WHATSAPP_OPTED_OUT',
          error: 'This WhatsApp number is on the do-not-contact list.',
        },
        { status: 403 }
      );
    }

    const clientIp = getClientIp(request);
    const phoneHash = computeBuyerPhoneBindingHash(tx.buyer_phone);
    const maskedPhone = maskWhatsappNumber(tx.buyer_phone);

    if (action === 'request_code') {
      const cooldownRl = await checkSharedRateLimit(
        `buyer_sess_cd:${tx.id}`,
        1,
        45 * 1000,
        supabase
      );
      if (!cooldownRl.allowed) {
        return NextResponse.json(
          {
            success: false,
            code: 'COOLDOWN_ACTIVE',
            error: 'Please wait 45 seconds before requesting another WhatsApp sign-in code.',
          },
          { status: 429 }
        );
      }

      const [ipRl, txRl, phoneRl] = await Promise.all([
        checkSharedRateLimit(`buyer_sess_req_ip:${clientIp}`, 12, 60 * 60 * 1000, supabase),
        checkSharedRateLimit(`buyer_sess_req_tx:${tx.id}`, 6, 60 * 60 * 1000, supabase),
        checkSharedRateLimit(`buyer_sess_req_ph:${phoneHash}`, 10, 60 * 60 * 1000, supabase),
      ]);

      if (!ipRl.allowed || !txRl.allowed || !phoneRl.allowed) {
        return NextResponse.json(
          {
            success: false,
            code: 'RATE_LIMITED',
            error: 'Too many WhatsApp sign-in code requests. Please try again later.',
          },
          { status: 429 }
        );
      }

      const otp = generateCryptographicReleaseCode();
      const challenge = mintBuyerOtpChallengeToken({
        txId: tx.id,
        buyerPhone: tx.buyer_phone,
        otp,
      });

      const sendRes = await sendOtpWhatsappTemplate(
        {
          transactionId: tx.id,
          buyerPhone: tx.buyer_phone,
          otp,
          purpose: 'buyer_session',
        },
        supabase
      );

      const isSandbox = process.env.PAYMENTS_MODE !== 'live' && process.env.VERCEL_ENV !== 'production';
      if (!sendRes.success && !isSandbox) {
        return NextResponse.json(
          {
            success: false,
            error: sendRes.error || 'Failed to deliver WhatsApp sign-in code.',
          },
          { status: 502 }
        );
      }

      const response = NextResponse.json({
        success: true,
        otpSent: true,
        whatsappSent: sendRes.success,
        maskedPhone: sendRes.maskedPhone || maskedPhone,
        expiresAt: challenge.expiresAt,
        message: sendRes.success
          ? `A 6-digit WhatsApp code was sent to ${sendRes.maskedPhone || maskedPhone}.`
          : 'Test mode: WhatsApp messages send only to WHATSAPP_ALLOWED_RECIPIENTS. Use the test sign-in code below.',
        ...(isSandbox ? { sandbox_otp: otp } : {}),
      });
      attachBuyerOtpChallengeCookie(response, request, challenge.token);
      return response;
    }

    // action === 'verify_code'
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_OTP_FORMAT', error: 'Enter the 6-digit code sent to your WhatsApp.' },
        { status: 400 }
      );
    }

    const [ipVerRl, txVerRl] = await Promise.all([
      checkSharedRateLimit(`buyer_sess_ver_ip:${clientIp}`, 20, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`buyer_sess_ver_tx:${tx.id}`, 12, 15 * 60 * 1000, supabase),
    ]);

    if (!ipVerRl.allowed || !txVerRl.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          error: 'Too many sign-in verification attempts. Please wait and request a new code.',
        },
        { status: 429 }
      );
    }

    const challengeCheck = verifyBuyerOtpChallengeCookie(request, {
      txId: tx.id,
      buyerPhone: tx.buyer_phone,
      submittedOtp: code,
    });

    if (!challengeCheck.claims) {
      const status =
        challengeCheck.code === 'CHALLENGE_ORDER_MISMATCH' ||
        challengeCheck.code === 'CHALLENGE_PHONE_MISMATCH'
          ? 403
          : 401;
      return NextResponse.json(
        { success: false, code: challengeCheck.code, error: challengeCheck.error },
        { status }
      );
    }

    const nonceAttemptRl = await checkSharedRateLimit(
      `buyer_sess_nonce:${tx.id}:${challengeCheck.claims.nonce}`,
      MAX_BUYER_OTP_CHALLENGE_ATTEMPTS,
      BUYER_OTP_CHALLENGE_TTL_SECONDS * 1000,
      supabase
    );
    if (!nonceAttemptRl.allowed) {
      const lockedResp = NextResponse.json(
        {
          success: false,
          code: 'OTP_MAX_ATTEMPTS_EXCEEDED',
          error: 'Maximum sign-in code attempts exceeded. Request a new WhatsApp code.',
        },
        { status: 429 }
      );
      clearBuyerOtpChallengeCookie(lockedResp, request);
      return lockedResp;
    }

    if (!challengeCheck.valid) {
      return NextResponse.json(
        {
          success: false,
          code: challengeCheck.code,
          error: challengeCheck.error || 'Incorrect 6-digit WhatsApp sign-in code.',
        },
        { status: 401 }
      );
    }

    const claimed = await claimWhatsappWebhookEvent(
      `buyer_session_used:${tx.id}:${challengeCheck.claims.nonce}`,
      'BUYER_SESSION_OTP_CONSUMED',
      supabase
    );
    if (!claimed) {
      const replayResp = NextResponse.json(
        {
          success: false,
          code: 'OTP_ALREADY_USED',
          error: 'This WhatsApp sign-in code has already been used. Please request a fresh code.',
        },
        { status: 401 }
      );
      clearBuyerOtpChallengeCookie(replayResp, request);
      return replayResp;
    }

    const session = mintBuyerSessionToken({
      txId: tx.id,
      buyerPhone: tx.buyer_phone,
    });

    const okResp = NextResponse.json({
      success: true,
      authenticated: true,
      role: 'BUYER',
      transactionId: tx.id,
      maskedPhone,
      expiresAt: session.expiresAt,
    });
    attachBuyerSessionCookie(okResp, request, session.token);
    clearBuyerOtpChallengeCookie(okResp, request);
    return okResp;
  } catch (err: any) {
    console.error('[BUYER-SESSION] Error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Buyer session request failed.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  clearBuyerSessionCookie(response, request);
  clearBuyerOtpChallengeCookie(response, request);
  return response;
}
