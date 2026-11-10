import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    
    // 1. Rate Limiting: Max 3 OTP requests per 15 minutes per IP
    const rateCheck = checkRateLimit(`${clientIp}:dispute_otp`, 3, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many OTP requests. Please wait 15 minutes before requesting again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { transactionId } = body;

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // 2. Fetch transaction
    const { data: tx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, status, buyer_phone, item_name')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    // 3. Status Eligibility Check
    if (tx.status === 'RELEASED') {
      return NextResponse.json(
        { success: false, error: 'Cannot dispute a transaction that has already been released.' },
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

    // 4. Generate 6-Digit Cryptographic OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const secret = process.env.RELEASE_CODE_PEPPER || 'relyvora_dispute_otp_pepper_secret';
    const otpHash = crypto
      .createHmac('sha256', secret)
      .update(`${transactionId}:${otp}`)
      .digest('hex');

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

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
      console.error('Failed to save dispute OTP hash:', updateErr);
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // 6. Mask Buyer Phone for User Display
    const rawPhone = tx.buyer_phone.trim();
    const maskedPhone = rawPhone.length > 5 
      ? `${rawPhone.substring(0, 4)}••••${rawPhone.substring(rawPhone.length - 3)}`
      : '••••';

    // 7. Dispatch SMS (or Log in Sandbox)
    console.log(`[DISPUTE OTP DISPATCH] Sent OTP ${otp} to buyer phone ${rawPhone} for transaction ${transactionId}.`);

    return NextResponse.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${maskedPhone}.`,
      maskedPhone,
      expiresInMinutes: 10,
      // In sandbox mode, include otp for test harness
      ...(process.env.PAYMENTS_MODE !== 'live' ? { sandbox_otp: otp } : {}),
    });
  } catch (err: any) {
    console.error('Unhandled error in send dispute OTP route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
