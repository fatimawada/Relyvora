import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getClientIp } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, adminEmail, reason } = body;

    if (!transactionId || !adminEmail || !reason) {
      return NextResponse.json(
        { success: false, error: 'transactionId, adminEmail, and reason are required' },
        { status: 400 }
      );
    }

    // Verify admin email allowlist
    const rawAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST || process.env.ALERT_EMAIL || 'support@relyvora.com';
    const allowlist = rawAllowlist.split(',').map(e => e.trim().toLowerCase());
    
    if (!allowlist.includes(adminEmail.trim().toLowerCase())) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Admin email is not on the admin allowlist' },
        { status: 403 }
      );
    }

    const clientIp = getClientIp(request);
    const supabase = getServiceSupabase();

    // Call atomic RPC
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('rpc_admin_unlock_transaction', {
      p_transaction_id: transactionId,
      p_admin_email: adminEmail.trim(),
      p_reason: reason.trim(),
      p_ip_address: clientIp,
    });

    if (rpcErr || !rpcResult?.success) {
      return NextResponse.json(
        { success: false, error: rpcErr?.message || rpcResult?.error || 'Failed to unlock transaction' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: rpcResult.message });
  } catch (err: any) {
    console.error('Unhandled error in admin unlock route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
