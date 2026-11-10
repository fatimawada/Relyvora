import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { recordLedgerEntry } from '@/lib/ledger';
import { sendSystemAlert } from '@/lib/alerts';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);

    // 1. Rate Limiting: Max 5 dispute verification submissions per 15 minutes
    const rateCheck = checkRateLimit(`${clientIp}:dispute_verify`, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many dispute attempts. Please wait 15 minutes before submitting again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { transactionId, disputeReason, otp } = body;

    if (!transactionId || !disputeReason || typeof disputeReason !== 'string' || !disputeReason.trim()) {
      return NextResponse.json(
        { success: false, error: 'transactionId and disputeReason are required.' },
        { status: 400 }
      );
    }

    if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
      return NextResponse.json(
        { success: false, error: 'A valid 6-digit verification code (OTP) sent to the buyer phone is required.' },
        { status: 400 }
      );
    }

    const cleanReason = disputeReason.trim();
    const cleanOtp = otp.trim();

    const supabase = getServiceSupabase();

    // 2. Fetch existing transaction
    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    // 3. Status Eligibility
    if (existing.status === 'RELEASED') {
      return NextResponse.json(
        { success: false, error: 'Cannot dispute a transaction that has already been released.' },
        { status: 400 }
      );
    }

    if (existing.status === 'DISPUTED') {
      return NextResponse.json(
        { success: false, error: 'Transaction is already flagged in dispute.' },
        { status: 400 }
      );
    }

    if (existing.status !== 'FUNDS_LOCKED' && existing.status !== 'DISPATCHED') {
      return NextResponse.json(
        { success: false, error: `Cannot dispute transaction in status '${existing.status}'.` },
        { status: 400 }
      );
    }

    // 4. Cryptographic Buyer OTP Verification (Prevents unauthorized escrow freezing by link strangers)
    if (!existing.dispute_otp_hash || !existing.dispute_otp_expires_at) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No active verification code found. Please request a new OTP sent to your phone before raising a dispute.',
          requiresOtpRequest: true,
        },
        { status: 400 }
      );
    }

    // Check expiration
    if (new Date(existing.dispute_otp_expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'The verification code has expired. Please request a new code.',
          requiresOtpRequest: true,
        },
        { status: 400 }
      );
    }

    // Check attempt lockout
    const attempts = existing.dispute_otp_attempts || 0;
    if (attempts >= 3) {
      // Clear OTP hash to force re-request
      await supabase
        .from('transactions')
        .update({ dispute_otp_hash: null, dispute_otp_expires_at: null })
        .eq('id', transactionId);

      return NextResponse.json(
        { 
          success: false, 
          error: 'Maximum verification attempts exceeded (3/3). Please request a new verification code.',
          requiresOtpRequest: true,
        },
        { status: 403 }
      );
    }

    // Compute expected HMAC-SHA256
    const secret = process.env.RELEASE_CODE_PEPPER || 'relyvora_dispute_otp_pepper_secret';
    const computedHash = crypto
      .createHmac('sha256', secret)
      .update(`${transactionId}:${cleanOtp}`)
      .digest('hex');

    const expectedBuf = Buffer.from(existing.dispute_otp_hash, 'hex');
    const computedBuf = Buffer.from(computedHash, 'hex');

    const isValidOtp = 
      expectedBuf.length === computedBuf.length && 
      crypto.timingSafeEqual(expectedBuf, computedBuf);

    if (!isValidOtp) {
      const nextAttempts = attempts + 1;
      await supabase
        .from('transactions')
        .update({ dispute_otp_attempts: nextAttempts })
        .eq('id', transactionId);

      const remaining = 3 - nextAttempts;
      return NextResponse.json(
        { 
          success: false, 
          error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Lockout triggered. Please request a new code.'}`,
          attemptsRemaining: remaining,
        },
        { status: 400 }
      );
    }

    // 5. Verification Succeeded: Transition to DISPUTED and Clear OTP Secrets
    const now = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: 'DISPUTED',
        dispute_reason: cleanReason,
        disputed_at: now,
        dispute_otp_hash: null,
        dispute_otp_expires_at: null,
        dispute_otp_attempts: 0,
        updated_at: now,
      })
      .eq('id', transactionId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // 6. Record Dispute Freeze in Immutable Audit Ledger
    await recordLedgerEntry({
      transactionId,
      entryType: 'DISPUTE_FREEZE',
      amount: Number(existing.total_amount) || 0,
      currency: 'NGN',
      fromAccount: 'Relyvora Escrow Vault',
      toAccount: 'Dispute Arbitration Vault',
      idempotencyKey: `ledger_${transactionId}_DISPUTE_FREEZE`,
      metadata: { reason: cleanReason, disputedAt: now, verifiedBuyerPhone: existing.buyer_phone },
    });

    // 7. Send Immediate High-Priority Resend Alert
    sendSystemAlert({
      type: 'NEW_DISPUTE',
      severity: 'WARNING',
      title: 'New Escrow Dispute Flagged (Buyer Phone Verified via OTP)',
      transactionId,
      vendorHandle: existing.vendor_handle,
      details: {
        itemName: existing.item_name,
        amount: existing.total_amount,
        disputeReason: cleanReason,
        buyerPhone: existing.buyer_phone,
      },
    }).catch(() => {});

    return NextResponse.json({ 
      success: true, 
      transaction: updated,
      message: 'Buyer phone verified successfully. Escrow funds have been safely frozen under dispute arbitration.' 
    });
  } catch (err: any) {
    console.error('Unhandled error raising verified dispute:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
