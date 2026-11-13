import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import {
  generateCryptographicReleaseCode,
  computeReleaseCodeHmac,
  verifyReleaseCodeHmac,
  calculateCodeExpiration,
} from '@/lib/releaseCode';
import { sendSystemAlert } from '@/lib/alerts';
import { isLiveMode } from '@/lib/paymentsMode';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';
import {
  sendBuyerOtpSms,
  sendReleaseCodeSmsOrWhatsapp,
  maskPhoneNumber,
} from '@/lib/smsDelivery';
import { recordLedgerEntry } from '@/lib/ledger';

/**
 * Release Code Reissue & Recovery Endpoint
 *
 * Supports two authorized paths:
 * 1. Buyer Self-Service Phone OTP ("Resend code" on /order/[id]):
 *    - action: 'send_otp' -> Sends a 6-digit one-time verification code to the buyer's verified WhatsApp number (rate-limited, audit-logged).
 *    - action: 'verify_and_reissue' -> Verifies OTP, generates a NEW 6-digit release code (old HMAC is immediately invalidated),
 *      delivers the new plaintext code once on WhatsApp, and logs to admin_audit_log.
 * 2. Admin Recovery (Authorization: Bearer <ADMIN_API_KEY>):
 *    - Immediately reissues a new release code, delivers out-of-band, and logs to admin_audit_log.
 *
 * Security: In live mode, plaintext release codes and OTPs are NEVER returned in HTTP responses or written to logs.
 */
export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const body = await request.json();
    const {
      transactionId,
      action,
      otp,
      adminEmail = 'support@relyvora.com',
      reason = 'Buyer code recovery request',
    } = body || {};

    if (!transactionId || typeof transactionId !== 'string') {
      return NextResponse.json({ success: false, error: 'transactionId is required' }, { status: 400 });
    }

    const authHeader = request.headers.get('authorization');
    const adminSecret = process.env.ADMIN_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isAdminRequest = Boolean(adminSecret && authHeader === `Bearer ${adminSecret}`);

    const supabase = getServiceSupabase();
    const isLive = isLiveMode();

    // Fetch transaction state and delivery contacts
    const { data: tx, error: fetchErr } = await supabase
      .from('transactions')
      .select(
        'id, status, item_name, total_amount, vendor_handle, buyer_phone, release_code_hash, dispute_otp_hash, dispute_otp_expires_at, dispute_otp_attempts'
      )
      .eq('id', transactionId)
      .single();

    if (fetchErr || !tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    if (tx.status !== 'FUNDS_LOCKED' && tx.status !== 'DISPATCHED') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot reissue code for transaction in status '${tx.status}'. Must be FUNDS_LOCKED or DISPATCHED.`,
        },
        { status: 400 }
      );
    }

    // =========================================================================
    // PATH A: BUYER PHONE OTP STEP 1 (Send One-Time Code to Buyer's Phone)
    // =========================================================================
    if (!isAdminRequest && action === 'send_otp') {
      const ipRate = checkRateLimit(`${clientIp}:reissue_otp`, 3, 15 * 60 * 1000);
      const txRate = checkRateLimit(`tx:${tx.id}:reissue_otp`, 3, 15 * 60 * 1000);
      if (!ipRate.allowed || !txRate.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Too many resend attempts. Please wait 15 minutes before requesting another verification code.',
          },
          { status: 429 }
        );
      }

      const targetPhone = tx.buyer_phone?.trim() || (isLive ? null : '+2348000001234');
      if (!targetPhone) {
        return NextResponse.json(
          {
            success: false,
            error: 'No verified buyer phone number is linked to this order. Please contact Relyvora support.',
          },
          { status: 400 }
        );
      }

      const otpCode = generateCryptographicReleaseCode();
      const otpHash = computeReleaseCodeHmac(`reissue:${tx.id}`, otpCode);
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: otpUpdateErr } = await supabase
        .from('transactions')
        .update({
          dispute_otp_hash: otpHash,
          dispute_otp_expires_at: otpExpiresAt,
          dispute_otp_attempts: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tx.id);

      if (otpUpdateErr) {
        return NextResponse.json({ success: false, error: otpUpdateErr.message }, { status: 500 });
      }

      const maskedPhone = maskPhoneNumber(targetPhone);
      await sendBuyerOtpSms({
        transactionId: tx.id,
        buyerPhone: targetPhone,
        otp: otpCode,
        purpose: 'reissue_code',
      });

      await supabase
        .from('admin_audit_log')
        .insert({
          admin_email: `buyer:${maskedPhone}`,
          action: 'BUYER_REISSUE_OTP_SENT',
          target_type: 'transaction',
          target_id: tx.id,
          ip_address: clientIp,
          metadata: { buyer_phone_masked: maskedPhone },
        })
        .then(() => {}, () => {});

      return NextResponse.json({
        success: true,
        message: `A 6-digit one-time verification code was sent to ${maskedPhone}.`,
        buyer_phone_masked: maskedPhone,
        expiresInMinutes: 10,
        ...(isLive ? {} : { sandbox_otp: otpCode }),
      });
    }

    // =========================================================================
    // PATH B: BUYER PHONE OTP STEP 2 OR ADMIN AUTHORIZATION
    // =========================================================================
    let actorLabel = adminEmail;
    let auditAction = 'REISSUE_RELEASE_CODE';

    if (!isAdminRequest) {
      if (action !== 'verify_and_reissue' && !otp) {
        return NextResponse.json(
          { success: false, error: 'Phone OTP verification or admin authorization is required.' },
          { status: 401 }
        );
      }

      const ipVerifyRate = checkRateLimit(`${clientIp}:reissue_verify`, 5, 15 * 60 * 1000);
      const txVerifyRate = checkRateLimit(`tx:${tx.id}:reissue_verify`, 3, 60 * 60 * 1000);
      if (!ipVerifyRate.allowed || !txVerifyRate.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Maximum code reissue limit reached for now. Please try again later.',
          },
          { status: 429 }
        );
      }

      const cleanOtp = typeof otp === 'string' ? otp.trim() : '';
      if (!/^\d{6}$/.test(cleanOtp)) {
        return NextResponse.json(
          { success: false, error: 'A valid 6-digit verification code sent to your phone is required.' },
          { status: 400 }
        );
      }

      if (!tx.dispute_otp_hash || !tx.dispute_otp_expires_at) {
        return NextResponse.json(
          {
            success: false,
            error: 'No active verification code found. Click "Resend code" to request a one-time code.',
            requiresOtpRequest: true,
          },
          { status: 400 }
        );
      }

      if (new Date(tx.dispute_otp_expires_at).getTime() < Date.now()) {
        return NextResponse.json(
          {
            success: false,
            error: 'Verification code expired. Please request a new one-time code.',
            requiresOtpRequest: true,
          },
          { status: 400 }
        );
      }

      const attempts = tx.dispute_otp_attempts || 0;
      if (attempts >= 3) {
        await supabase
          .from('transactions')
          .update({ dispute_otp_hash: null, dispute_otp_expires_at: null })
          .eq('id', tx.id);

        return NextResponse.json(
          {
            success: false,
            error: 'Maximum OTP attempts exceeded (3/3). Please request a new one-time code.',
            requiresOtpRequest: true,
          },
          { status: 403 }
        );
      }

      const isValidOtp = verifyReleaseCodeHmac(`reissue:${tx.id}`, cleanOtp, tx.dispute_otp_hash);
      if (!isValidOtp) {
        const nextAttempts = attempts + 1;
        await supabase
          .from('transactions')
          .update({ dispute_otp_attempts: nextAttempts })
          .eq('id', tx.id);

        const remaining = 3 - nextAttempts;
        return NextResponse.json(
          {
            success: false,
            error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Please request a new code.'}`,
            attemptsRemaining: remaining,
          },
          { status: 400 }
        );
      }

      actorLabel = `buyer:${maskPhoneNumber(tx.buyer_phone)}`;
      auditAction = 'BUYER_REISSUE_RELEASE_CODE';
    }

    // Issue NEW cryptographic release code & overwrite HMAC (invalidates any previous code immediately)
    const newCode = generateCryptographicReleaseCode();
    const newHmac = computeReleaseCodeHmac(tx.id, newCode);
    const expiresAt = calculateCodeExpiration(72);
    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('transactions')
      .update({
        release_code_hash: newHmac,
        code_expires_at: expiresAt,
        failed_code_attempts: 0,
        code_locked: false,
        dispute_otp_hash: null,
        dispute_otp_expires_at: null,
        dispute_otp_attempts: 0,
        updated_at: now,
      })
      .eq('id', tx.id);

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    const maskedPhone = maskPhoneNumber(tx.buyer_phone);

    // Send NEW code once to verified buyer WhatsApp number
    await sendReleaseCodeSmsOrWhatsapp({
      transactionId: tx.id,
      buyerPhone: tx.buyer_phone,
      releaseCode: newCode,
      itemName: tx.item_name || 'Escrow Order',
      totalAmount: Number(tx.total_amount) || 0,
      vendorHandle: tx.vendor_handle || '',
    }).catch(() => {});

    // Immutable audit log
    await supabase
      .from('admin_audit_log')
      .insert({
        admin_email: actorLabel,
        action: auditAction,
        target_type: 'transaction',
        target_id: tx.id,
        ip_address: clientIp,
        metadata: {
          reason,
          buyer_phone_masked: maskedPhone,
          previous_hash_invalidated: Boolean(tx.release_code_hash),
        },
      })
      .then(() => {}, () => {});

    // Ledger event
    await recordLedgerEntry(
      {
        transactionId: tx.id,
        entryType: 'RELEASE_CODE_REISSUED',
        amount: 0,
        currency: 'NGN',
        fromAccount: 'Release Code Registry',
        toAccount: maskedPhone,
        idempotencyKey: `ledger_${tx.id}_REISSUE_${Date.now()}`,
        metadata: { actor: actorLabel, previous_hash_invalidated: Boolean(tx.release_code_hash) },
      },
      supabase
    ).catch(() => {});

    sendSystemAlert({
      type: 'SECURITY_LOCKOUT',
      severity: 'WARNING',
      title: 'Release Code Safely Reissued',
      transactionId: tx.id,
      details: {
        actor: actorLabel,
        reason,
        buyerPhone: tx.buyer_phone,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `A new release code was sent to ${maskedPhone}. Your previous code no longer works.`,
      transactionId: tx.id,
      buyer_phone_masked: maskedPhone,
      ...(isLive ? {} : { sandbox_release_code: newCode }),
    });
  } catch (err: any) {
    console.error('Unhandled error in reissue-code:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
