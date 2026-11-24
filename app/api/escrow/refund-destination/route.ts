import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  computeReleaseCodeHmac,
  generateCryptographicReleaseCode,
  verifyReleaseCodeHmac,
} from '@/lib/releaseCode';
import { isLiveMode } from '@/lib/paymentsMode';
import { sendOtpWhatsappTemplate } from '@/lib/whatsapp';
import { maskPhoneNumber } from '@/lib/smsDelivery';
import { verifyAndSaveBuyerRefundAccount } from '@/lib/refundDestination';
import { resolveOrderActor } from '@/lib/orderAuth';
import { evaluateLivePaymentGateServer } from '@/lib/launchGates';
import { computeBuyerPhoneBindingHash } from '@/lib/buyerSession';
import { sendSystemAlert } from '@/lib/alerts';

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const body = await request.json();
    const { transactionId, action, otp, bankCode, accountNumber, accountNameHint } = body || {};

    if (!transactionId || !action) {
      return NextResponse.json(
        { success: false, error: 'transactionId and action (send_otp | verify_and_save) are required.' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const isLive = isLiveMode();

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select(
        'id, vendor_id, vendor_handle, status, buyer_phone, buyer_phone_verified, whatsapp_blocked, dispute_otp_hash, dispute_otp_expires_at, dispute_otp_attempts'
      )
      .eq('id', transactionId)
      .maybeSingle();

    if (txErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Refund Destination Transaction Lookup Failed (Fail Closed)',
        transactionId,
        details: { error: txErr.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: `Transaction lookup failed: ${txErr.message}` }, { status: 500 });
    }

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    // Strict Buyer Session enforcement (Vendor and anonymous callers cannot modify buyer refund account)
    const actor = await resolveOrderActor(request, tx, supabase);
    if (!actor.authenticated) {
      return NextResponse.json(
        { success: false, code: actor.code, error: actor.error || 'Buyer authentication required.' },
        { status: actor.statusCode || 401 }
      );
    }

    if (actor.role !== 'BUYER') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Forbidden: Only the verified buyer may manage the refund bank account.' },
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

    if (!tx.buyer_phone) {
      return NextResponse.json(
        { success: false, error: 'No verified buyer WhatsApp number linked to this transaction.' },
        { status: 400 }
      );
    }

    const phoneHash = computeBuyerPhoneBindingHash(tx.buyer_phone);

    if (action === 'send_otp') {
      const [ipRl, txRl, phRl] = await Promise.all([
        checkSharedRateLimit(`${clientIp}:refund_otp`, 5, 15 * 60 * 1000, supabase),
        checkSharedRateLimit(`tx:${tx.id}:refund_otp`, 3, 15 * 60 * 1000, supabase),
        checkSharedRateLimit(`ph:${phoneHash}:refund_otp`, 5, 15 * 60 * 1000, supabase),
      ]);
      if (!ipRl.allowed || !txRl.allowed || !phRl.allowed) {
        return NextResponse.json(
          { success: false, error: 'Too many OTP requests. Please wait 15 minutes.' },
          { status: 429 }
        );
      }

      const otpCode = generateCryptographicReleaseCode();
      const otpHash = computeReleaseCodeHmac(`refund_dest:${tx.id}`, otpCode);
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: otpSaveErr } = await supabase
        .from('transactions')
        .update({
          dispute_otp_hash: otpHash,
          dispute_otp_expires_at: otpExpiresAt,
          dispute_otp_attempts: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tx.id);

      if (otpSaveErr) {
        return NextResponse.json({ success: false, error: `Failed storing OTP: ${otpSaveErr.message}` }, { status: 500 });
      }

      const maskedPhone = maskPhoneNumber(tx.buyer_phone);
      const sendRes = await sendOtpWhatsappTemplate(
        {
          transactionId: tx.id,
          buyerPhone: tx.buyer_phone,
          otp: otpCode,
          purpose: 'refund_account',
        },
        supabase
      );

      const isSandbox = !isLive && process.env.VERCEL_ENV !== 'production';
      if (!sendRes.success && !isSandbox) {
        return NextResponse.json(
          { success: false, error: sendRes.error || 'Failed to send refund verification OTP via WhatsApp.' },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        whatsappSent: sendRes.success,
        buyer_phone_masked: maskedPhone,
        expiresInMinutes: 10,
        message: sendRes.success
          ? `Verification OTP sent via WhatsApp to ${maskedPhone}.`
          : 'Test mode: WhatsApp sends only to WHATSAPP_ALLOWED_RECIPIENTS. Test OTP displayed on screen.',
        ...(!isLive ? { sandbox_otp: otpCode } : {}),
      });
    }

    if (action === 'verify_and_save') {
      const [ipRl, txRl, phRl] = await Promise.all([
        checkSharedRateLimit(`${clientIp}:refund_verify`, 8, 15 * 60 * 1000, supabase),
        checkSharedRateLimit(`tx:${tx.id}:refund_verify`, 5, 15 * 60 * 1000, supabase),
        checkSharedRateLimit(`ph:${phoneHash}:refund_verify`, 8, 15 * 60 * 1000, supabase),
      ]);
      if (!ipRl.allowed || !txRl.allowed || !phRl.allowed) {
        return NextResponse.json({ success: false, error: 'Too many verification attempts.' }, { status: 429 });
      }

      if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
        return NextResponse.json({ success: false, error: 'A valid 6-digit OTP is required.' }, { status: 400 });
      }

      if (!tx.dispute_otp_hash || !tx.dispute_otp_expires_at) {
        return NextResponse.json(
          { success: false, error: 'No active OTP found. Please request a verification code first.' },
          { status: 400 }
        );
      }

      if (new Date(tx.dispute_otp_expires_at).getTime() < Date.now()) {
        return NextResponse.json({ success: false, error: 'OTP has expired. Request a new code.' }, { status: 400 });
      }

      const attempts = Number(tx.dispute_otp_attempts || 0);
      if (attempts >= 3) {
        return NextResponse.json(
          { success: false, error: 'Maximum OTP attempts exceeded (3/3). Request a new code.' },
          { status: 403 }
        );
      }

      const isValidOtp = verifyReleaseCodeHmac(`refund_dest:${tx.id}`, otp.trim(), tx.dispute_otp_hash);
      if (!isValidOtp) {
        await supabase
          .from('transactions')
          .update({ dispute_otp_attempts: attempts + 1 })
          .eq('id', tx.id);
        return NextResponse.json({ success: false, error: 'Invalid 6-digit OTP.' }, { status: 400 });
      }

      const saved = await verifyAndSaveBuyerRefundAccount({
        transactionId: tx.id,
        bankCode: String(bankCode || ''),
        accountNumber: String(accountNumber || ''),
        accountNameHint,
        supabaseClient: supabase,
      });

      if (!saved.success || !saved.destination) {
        return NextResponse.json({ success: false, error: saved.error }, { status: 422 });
      }

      const { error: clearErr } = await supabase
        .from('transactions')
        .update({
          dispute_otp_hash: null,
          dispute_otp_expires_at: null,
          dispute_otp_attempts: 0,
        })
        .eq('id', tx.id);
      if (clearErr) {
        return NextResponse.json({ success: false, error: `Failed clearing OTP state: ${clearErr.message}` }, { status: 500 });
      }

      const { error: auditErr } = await supabase
        .from('admin_audit_log')
        .insert({
          admin_email: `buyer:${maskPhoneNumber(tx.buyer_phone)}`,
          action: 'BUYER_REFUND_ACCOUNT_VERIFIED',
          target_type: 'transaction',
          target_id: tx.id,
          ip_address: clientIp,
          metadata: {
            source: 'BUYER_OTP_CONFIRMED',
            maskedAccount: saved.destination.maskedAccount,
            bankCode: saved.destination.bankCode,
          },
        });
      if (auditErr) {
        return NextResponse.json({ success: false, error: `Failed writing audit log: ${auditErr.message}` }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        destination: {
          verified: true,
          source: saved.destination.source,
          maskedAccount: saved.destination.maskedAccount,
          accountName: saved.destination.accountName,
          bankCode: saved.destination.bankCode,
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Unsupported action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Refund destination verification failed.' },
      { status: 500 }
    );
  }
}
