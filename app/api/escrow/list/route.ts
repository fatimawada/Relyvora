import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vendorHandle = searchParams.get('vendorHandle');

    const supabase = getServiceSupabase();

    let query = supabase
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
        failed_code_attempts
      `)
      .order('created_at', { ascending: false });

    if (vendorHandle) {
      query = query.eq('vendor_handle', vendorHandle.trim());
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Failed to query transactions via service role:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, transactions: data || [] });
  } catch (err: any) {
    console.error('Unhandled error in get-transactions list:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
