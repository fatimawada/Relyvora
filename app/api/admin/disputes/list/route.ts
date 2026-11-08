import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();

    // Fetch transactions in dispute or previously resolved
    const { data: disputes, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .or('status.eq.DISPUTED,dispute_reason.not.is.null,resolved_at.not.is.null')
      .order('disputed_at', { ascending: false });

    if (txErr) {
      console.warn('Failed to fetch disputes from Supabase:', txErr.message);
      return NextResponse.json({ success: false, error: txErr.message }, { status: 500 });
    }

    // Also fetch dispute resolutions audit log
    const { data: resolutions } = await supabase
      .from('dispute_resolutions')
      .select('*')
      .order('created_at', { ascending: false });

    return NextResponse.json({
      success: true,
      disputes: disputes || [],
      resolutions: resolutions || [],
    });
  } catch (err: any) {
    console.error('Unhandled error in disputes/list route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
