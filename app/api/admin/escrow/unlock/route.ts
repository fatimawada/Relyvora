import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getClientIp } from '@/lib/rateLimit';
import { verifyAdminSession } from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
  try {
    // Phase G2.5 Security: Verify Supabase Auth session & server-only ADMIN_EMAIL_ALLOWLIST
    const auth = await verifyAdminSession(request);
    if (!auth.authorized || !auth.user?.email) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized admin access' },
        { status: auth.statusCode }
      );
    }

    const body = await request.json();
    const { transactionId, reason } = body;

    if (!transactionId || !reason) {
      return NextResponse.json(
        { success: false, error: 'transactionId and reason are required' },
        { status: 400 }
      );
    }

    const verifiedAdminEmail = auth.user.email;
    const clientIp = getClientIp(request);
    const supabase = getServiceSupabase();

    // Call atomic RPC rpc_admin_unlock_transaction which unlocks and inserts into admin_audit_log
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('rpc_admin_unlock_transaction', {
      p_transaction_id: transactionId,
      p_admin_email: verifiedAdminEmail,
      p_reason: (reason || '').trim(),
      p_ip_address: clientIp,
    });

    if (rpcErr || !rpcResult?.success) {
      return NextResponse.json(
        { success: false, error: rpcErr?.message || rpcResult?.error || 'Failed to unlock transaction' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: rpcResult.message,
      unlockedBy: verifiedAdminEmail
    });
  } catch (err: any) {
    console.error('Unhandled error in admin unlock route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
