import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import {
  applyWhatsappVerificationRedaction,
  selectTransactionsListWithWhatsapp,
} from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vendorHandle = searchParams.get('vendorHandle');

    const supabase = getServiceSupabase();

    const { data, error } = await selectTransactionsListWithWhatsapp<any>(
      supabase,
      vendorHandle,
      `
        id,
        created_at,
        updated_at,
        item_name,
        item_price,
        delivery_fee,
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
        failed_code_attempts
      `
    );

    if (error) {
      console.warn('Failed to query transactions via service role:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const safeTransactions = (data || []).map((row) =>
      applyWhatsappVerificationRedaction(row)
    );

    return NextResponse.json({ success: true, transactions: safeTransactions });
  } catch (err: any) {
    console.error('Unhandled error in get-transactions list:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
