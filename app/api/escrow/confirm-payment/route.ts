import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { isLiveMode } from '@/lib/paymentsMode';
import { 
  generateCryptographicReleaseCode, 
  generateCodeSalt, 
  hashReleaseCode 
} from '@/lib/releaseCode';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, paymentMethod = 'SIMULATED' } = body;

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    if (isLiveMode()) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Simulated payment confirmation is disabled in live mode. Payments must be deposited via Virtual NUBAN.' 
        },
        { status: 403 }
      );
    }

    const supabase = getServiceSupabase();

    // 1. Fetch current transaction
    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    if (existing.status !== 'AWAITING_PAYMENT') {
      return NextResponse.json(
        { success: false, error: `Invalid state transition: transaction is currently in status '${existing.status}'.` },
        { status: 400 }
      );
    }

    // 2. Generate cryptographic release code and salted hash
    const rawCode = generateCryptographicReleaseCode();
    const salt = generateCodeSalt();
    const hash = hashReleaseCode(rawCode, salt);
    const now = new Date().toISOString();

    // 3. Atomically update status to FUNDS_LOCKED
    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: 'FUNDS_LOCKED',
        release_code: rawCode, // Retained in sandbox mode for testing UI display
        release_code_hash: hash,
        release_code_salt: salt,
        failed_code_attempts: 0,
        code_locked: false,
        payment_method: paymentMethod,
        paid_at: now,
        updated_at: now,
      })
      .eq('id', transactionId)
      .select()
      .single();

    if (updateErr) {
      console.error('Failed to update transaction to FUNDS_LOCKED:', updateErr);
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, transaction: updated });
  } catch (err: any) {
    console.error('Unhandled error in confirm-payment:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
