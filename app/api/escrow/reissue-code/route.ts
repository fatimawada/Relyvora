import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import {
  generateCryptographicReleaseCode,
  computeReleaseCodeHmac,
  calculateDeliveryWindowCodeExpiration,
  verifyReleaseCodeHmac,
} from '@/lib/releaseCode';
import {
  getDeliveryAndLifecycleConfig,
  updateTransactionStrict,
} from '@/lib/orderLifecycle';
import { sendSystemAlert } from '@/lib/alerts';
import { isLiveMode } from '@/lib/paymentsMode';
import { getClientIp, checkSharedRateLimit } from '@/lib/rateLimit';
import {
  sendBuyerOtpSms,
  sendReleaseCodeSmsOrWhatsapp,
  maskPhoneNumber,
} from '@/lib/smsDelivery';
import { recordLedgerEntry } from '@/lib/ledger';
import { resolveOrderActor } from '@/lib/orderAuth';
import { evaluateLivePaymentGateServer } from '@/lib/launchGates';
import { computeBuyerPhoneBindingHash } from '@/lib/buyerSession';

/**
 * Release Code Reissue & Recovery Endpoint
 *
 * Authorized ONLY for:
 * 1. Verified Buyer holding a valid signed HttpOnly Buyer Session cookie (with step-up OTP confirmation), OR
 * 2. Authenticated AAL2 Admin Supabase session.
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

    const supabase = getServiceSupabase();
    const isLive = isLiveMode();

    const { data: tx, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (fetchErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Reissue Code Transaction Lookup Failed (Fail Closed)',
        transactionId,
        details: { error: fetchErr.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: `Transaction lookup failed: ${fetchErr.message}` }, { status: 500 });
    }

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    // Strict Authorization: AAL2 Admin session OR verified BUYER session
    let isAdminRequest = false;
    let actorRole: 'ADMIN' | 'BUYER' | null = null;
    const resolvedAdminEmail = adminEmail;

    const actor = await resolveOrderActor(request, tx, supabase);
    if (!actor.authenticated) {
      return NextResponse.json(
        { success: false, code: actor.code, error: actor.error || 'Buyer or admin authentication required.' },
        { status: actor.statusCode || 401 }
      );
    }
    if (actor.role === 'ADMIN') {
      actorRole = 'ADMIN';
      isAdminRequest = true;
    } else if (actor.role === 'BUYER') {
      actorRole = 'BUYER';
    } else {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Forbidden: Vendors cannot reissue or view buyer release codes.' },
        { status: 403 }
      );
    }

    const liveGate = await evaluateLivePaymentGateServer({
      vendorId: tx.vendor_id,
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

    if (tx.status !== 'FUNDS_LOCKED' && tx.status !== 'DISPATCHED') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot reissue code for transaction in status '${tx.status}'. Must be FUNDS_LOCKED or DISPATCHED.`,
        },
        { status: 400 }
      );
    }

    if (!isAdminRequest) {
      if (!tx.buyer_phone) {
        return NextResponse.json(
          {
            success: false,
            error: 'No verified buyer phone number is linked to this order. Please contact Relyvora support.',
          },
          { status: 400 }
        );
      }
      const phoneHash = computeBuyerPhoneBindingHash(tx.buyer_phone);

      // PATH A: BUYER STEP 1 (Send OTP)
      if (action === 'send_otp') {
        const [ipRate, txRate, phRate] = await Promise.all([
          checkSharedRateLimit(`${clientIp}:reissue_otp`, 5, 15 * 60 * 1000, supabase),
          checkSharedRateLimit(`tx:${tx.id}:reissue_otp`, 3, 15 * 60 * 1000, supabase),
          checkSharedRateLimit(`ph:${phoneHash}:reissue_otp`, 5, 15 * 60 * 1000, supabase),
        ]);
        if (!ipRate.allowed || !txRate.allowed || !phRate.allowed) {
          return NextResponse.json(
            {
              success: false,
              error: 'Too many resend attempts. Please wait 15 minutes before requesting another verification code.',
            },
            { status: 429 }
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

        const maskedPhone = maskPhoneNumber(tx.buyer_phone);
        const otpSms = await sendBuyerOtpSms({
          transactionId: tx.id,
          buyerPhone: tx.buyer_phone,
          otp: otpCode,
          purpose: 'reissue_code',
        });

        if (!otpSms.success) {
          return NextResponse.json(
            { success: false, error: otpSms.error || 'Failed to deliver reissue OTP via WhatsApp.' },
            { status: 502 }
          );
        }

        const { error: auditSendErr } = await supabase
          .from('admin_audit_log')
          .insert({
            admin_email: `buyer:${maskedPhone}`,
            action: 'BUYER_REISSUE_OTP_SENT',
            target_type: 'transaction',
            target_id: tx.id,
            ip_address: clientIp,
            metadata: { buyer_phone_masked: maskedPhone },
          });
        if (auditSendErr) {
          return NextResponse.json({ success: false, error: `Audit log failed: ${auditSendErr.message}` }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: `A 6-digit one-time verification code was sent to ${maskedPhone}.`,
          buyer_phone_masked: maskedPhone,
          expiresInMinutes: 10,
          ...(isLive ? {} : { sandbox_otp: otpCode }),
        });
      }

      // PATH B: BUYER STEP 2 (Verify OTP & Reissue)
      if (action !== 'verify_and_reissue' && !otp) {
        return NextResponse.json(
          { success: false, error: 'action (send_otp | verify_and_reissue) and OTP are required.' },
          { status: 400 }
        );
      }

      const [ipVerifyRate, txVerifyRate, phVerifyRate] = await Promise.all([
        checkSharedRateLimit(`${clientIp}:reissue_verify`, 8, 15 * 60 * 1000, supabase),
        checkSharedRateLimit(`tx:${tx.id}:reissue_verify`, 3, 60 * 60 * 1000, supabase),
        checkSharedRateLimit(`ph:${phoneHash}:reissue_verify`, 5, 60 * 60 * 1000, supabase),
      ]);
      if (!ipVerifyRate.allowed || !txVerifyRate.allowed || !phVerifyRate.allowed) {
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
            error: 'No active verification code found. Click "Send it again" to request a one-time code.',
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

      const attempts = Number(tx.dispute_otp_attempts || 0);
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
    }

    const actorLabel = isAdminRequest
      ? resolvedAdminEmail
      : `buyer:${maskPhoneNumber(tx.buyer_phone)}`;
    const auditAction = isAdminRequest ? 'REISSUE_RELEASE_CODE' : 'BUYER_REISSUE_RELEASE_CODE';

    const cfg = await getDeliveryAndLifecycleConfig(supabase);
    const deliveryType = tx.delivery_type === 'interstate' ? 'interstate' : 'same_city';
    const expiryCalc = calculateDeliveryWindowCodeExpiration(deliveryType, cfg.delivery);

    const newCode = generateCryptographicReleaseCode();
    const newHmac = computeReleaseCodeHmac(tx.id, newCode);
    const expiresAt = expiryCalc.codeExpiresAt;
    const now = new Date().toISOString();
    const wasExpired = Boolean(tx.code_expires_at && new Date(tx.code_expires_at).getTime() < Date.now());

    const upd = await updateTransactionStrict(
      tx.id,
      {
        release_code_hash: newHmac,
        code_expires_at: expiresAt,
        delivery_deadline_at: expiryCalc.deliveryDeadlineAt,
        failed_code_attempts: 0,
        code_locked: false,
        dispute_otp_hash: null,
        dispute_otp_expires_at: null,
        dispute_otp_attempts: 0,
        updated_at: now,
      },
      supabase
    );

    if (!upd.success) {
      return NextResponse.json({ success: false, error: upd.error || 'Failed to reissue code' }, { status: 500 });
    }

    const maskedPhone = maskPhoneNumber(tx.buyer_phone);

    await sendReleaseCodeSmsOrWhatsapp({
      transactionId: tx.id,
      vendorId: tx.vendor_id,
      buyerPhone: tx.buyer_phone,
      releaseCode: newCode,
      itemName: tx.item_name || 'Escrow Order',
      totalAmount: Number(tx.total_amount) || 0,
      vendorHandle: tx.vendor_handle || '',
    });

    const { error: auditErr } = await supabase
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
          previous_code_was_expired: wasExpired,
          new_code_expires_at: expiresAt,
        },
      });
    if (auditErr) {
      return NextResponse.json({ success: false, error: `Audit log insert failed: ${auditErr.message}` }, { status: 500 });
    }

    await recordLedgerEntry(
      {
        transactionId: tx.id,
        entryType: 'RELEASE_CODE_REISSUED',
        amount: 0,
        currency: 'NGN',
        fromAccount: 'Release Code Registry',
        toAccount: maskedPhone,
        idempotencyKey: `ledger_${tx.id}_REISSUE_${Date.now()}`,
        metadata: { actor: actorLabel, previous_hash_invalidated: Boolean(tx.release_code_hash), wasExpired },
      },
      supabase
    );

    sendSystemAlert({
      type: 'SECURITY_LOCKOUT',
      severity: 'WARNING',
      title: 'Release Code Safely Reissued',
      transactionId: tx.id,
      details: {
        actor: actorLabel,
        reason,
        maskedPhone,
        wasExpired,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `A new release code was sent to ${maskedPhone}. Your previous code no longer works.`,
      transactionId: tx.id,
      code_expires_at: expiresAt,
      previous_code_expired: wasExpired,
      buyer_phone_masked: maskedPhone,
      ...(isLive ? {} : { sandbox_release_code: newCode }),
    });
  } catch (err: any) {
    console.error('Unhandled error in reissue-code:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
