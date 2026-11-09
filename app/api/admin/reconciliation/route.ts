import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { runDailyReconciliation } from '@/lib/reconciliation';
import { getClientIp } from '@/lib/rateLimit';

export async function GET(request: NextRequest) {
  try {
    // Phase G2.5 Security: Verify Supabase Auth session & server-only ADMIN_EMAIL_ALLOWLIST
    const auth = await verifyAdminSession(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.statusCode }
      );
    }

    const report = await runDailyReconciliation(undefined, { sendAlerts: false });

    return NextResponse.json({
      success: true,
      report,
      auditedBy: auth.user?.email,
    });
  } catch (err: any) {
    console.error('Reconciliation GET error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Phase G2.5 Security: Verify Supabase Auth session & server-only ADMIN_EMAIL_ALLOWLIST
    const auth = await verifyAdminSession(request);
    if (!auth.authorized || !auth.user?.email) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.statusCode }
      );
    }

    const report = await runDailyReconciliation(undefined, { sendAlerts: true });
    const clientIp = getClientIp(request);
    const supabase = getServiceSupabase();

    // Log reconciliation run in public.admin_audit_log
    await supabase.from('admin_audit_log').insert({
      admin_email: auth.user.email,
      action: 'DAILY_RECONCILIATION_RUN',
      target_type: 'reconciliation_report',
      target_id: report.timestamp,
      ip_address: clientIp,
      metadata: {
        totalAudited: report.totalTransactionsAudited,
        issuesFound: report.issuesFound,
        criticalCount: report.criticalCount,
        isClean: report.isClean,
      },
    });

    return NextResponse.json({
      success: true,
      report,
      message: `Reconciliation audit completed. ${report.issuesFound} issues identified (${report.criticalCount} critical).`,
      auditedBy: auth.user.email,
    });
  } catch (err: any) {
    console.error('Reconciliation POST error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
