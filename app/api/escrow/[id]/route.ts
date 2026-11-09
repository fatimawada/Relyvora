import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { isSandboxMode } from '@/lib/paymentsMode';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, error: 'Transaction ID is required' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Query transaction with service role
    const { data: tx, error } = await supabase
      .from('transactions')
      .select(`
        id,
        created_at,
        updated_at,
        item_name,
        item_price,
        protection_fee,
        total_amount,
        vendor_handle,
        status,
        paid_at,
        dispatched_at,
        released_at,
        disputed_at,
        dispute_reason,
        virtual_account_number,
        virtual_bank_name,
        virtual_account_name,
        code_locked,
        failed_code_attempts,
        code_expires_at
      `)
      .eq('id', id)
      .maybeSingle();

    if (error || !tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    // In live mode, NEVER return the plaintext release code or sensitive cryptographic salts/hashes
    const sanitizedTransaction = {
      id: tx.id,
      created_at: tx.created_at,
      updated_at: tx.updated_at,
      item_name: tx.item_name,
      item_price: tx.item_price,
      protection_fee: tx.protection_fee,
      total_amount: tx.total_amount,
      vendor_handle: tx.vendor_handle,
      status: tx.status,
      paid_at: tx.paid_at,
      dispatched_at: tx.dispatched_at,
      released_at: tx.released_at,
      disputed_at: tx.disputed_at,
      dispute_reason: tx.dispute_reason,
      virtual_account_number: tx.virtual_account_number,
      virtual_bank_name: tx.virtual_bank_name,
      virtual_account_name: tx.virtual_account_name,
      code_locked: Boolean(tx.code_locked),
      failed_code_attempts: tx.failed_code_attempts || 0,
      code_expires_at: tx.code_expires_at,
      // Plaintext code column is dropped in Phase G1.5; codes are delivered out-of-band (SMS/email)
      release_code: null,
    };

    return NextResponse.json({ success: true, transaction: sanitizedTransaction });
  } catch (err: any) {
    console.error('Unhandled error in get-transaction:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
