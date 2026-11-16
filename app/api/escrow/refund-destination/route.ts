import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import { computeReleaseCodeHmac, generateCryptographicReleaseCode } from '@/lib/releaseCode';
import { isLiveMode } from '@/lib/paymentsMode';
import { sendOtpWhatsappTemplate } from '@/lib/whatsapp';
import { maskPhoneNumber } from '@/lib/smsDelivery';
import { verifyAndSaveBuyerRefundAccount } from '@/lib/refundDestination';

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
        'id, status, buyer_phone, vendor_handle, dispute_otp_hash, dispute_otp_expires_at, dispute_otp_attempts'
      )
      .eq('id', transactionId)
      .single();

    if (txErr || !tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    if (action === 'send_otp') {
      const rl = await checkSharedRateLimit(`${clientIp}:${tx.id}:refund_otp`, 3, 15 * 60 * 1000, supabase);
      if (!rl.allowed) {
        return NextResponse.json(
          { success: false, error: 'Too many OTP requests. Please wait 15 minutes.' },
          { status: 429 }
        );
      }

      const targetPhone = tx.buyer_phone?.trim() || (isLive ? null : '+2348000001234');
      if (!targetPhone) {
        return NextResponse.json(
          { success: false, error: 'No buyer phone number linked to this transaction.' },
          { status: 400 }
        );
      }

      const otpCode = generateCryptographicReleaseCode();
      const otpHash = computeReleaseCodeHmac(`refund_dest:${tx.id}`, otpCode);
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await supabase
        .from('transactions')
        .update({
          dispute_otp_hash: otpHash,
          dispute_otp_expires_at: otpExpiresAt,
          dispute_otp_attempts: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tx.id);

      const maskedPhone = maskPhoneNumber(targetPhone);
      await sendOtpWhatsappTemplate(
        {
          transactionId: tx.id,
          buyerPhone: targetPhone,
          otp: otpCode,
          purpose: 'refund_account',
        },
        supabase
      );

      return NextResponse.json({
        success: true,
        buyer_phone_masked: maskedPhone,
        expiresInMinutes: 10,
        ...(!isLive ? { sandbox_otp: otpCode } : {}),
      });
    }

    if (action === 'verify_and_save') {
      const rl = await checkSharedRateLimit(`${clientIp}:${tx.id}:refund_verify`, 5, 15 * 60 * 1000, supabase);
      if (!rl.allowed) {
        return NextResponse.json({ success: false, error: 'Too many verification attempts.' }, { status: 429 });
      }

      if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
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

      const computedHash = computeReleaseCodeHmac(`refund_dest:${tx.id}`, otp.trim());
      const expBuf = Buffer.from(tx.dispute_otp_hash, 'hex');
      const cmpBuf = Buffer.from(computedHash, 'hex');
      const isValidOtp = expBuf.length === cmpBuf.length && crypto.timingSafeEqual(expBuf, cmpBuf);

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

      await supabase
        .from('transactions')
        .update({
          dispute_otp_hash: null,
          dispute_otp_expires_at: null,
          dispute_otp_attempts: 0,
        })
        .eq('id', tx.id);

      await supabase
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
        })
        .then(() => {}, () => {});

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
