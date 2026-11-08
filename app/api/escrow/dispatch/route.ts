import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId } = body;

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    if (existing.status !== 'FUNDS_LOCKED') {
      return NextResponse.json(
        { success: false, error: `Cannot dispatch: order is in status '${existing.status}', expected 'FUNDS_LOCKED'.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: 'DISPATCHED',
        dispatched_at: now,
        updated_at: now,
      })
      .eq('id', transactionId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, transaction: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
