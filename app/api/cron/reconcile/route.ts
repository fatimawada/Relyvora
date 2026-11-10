import { NextRequest, NextResponse } from 'next/server';
import { runDailyReconciliation } from '@/lib/reconciliation';

export async function GET(request: NextRequest) {
  return handleCronReconcile(request);
}

export async function POST(request: NextRequest) {
  return handleCronReconcile(request);
}

async function handleCronReconcile(request: NextRequest) {
  try {
    // 1. Verify Vercel Cron Secret Header
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      if (process.env.NODE_ENV === 'production' || process.env.PAYMENTS_MODE === 'live') {
        console.error('CRITICAL: CRON_SECRET is not configured on the server.');
        return NextResponse.json({ success: false, error: 'Server misconfiguration: CRON_SECRET missing' }, { status: 500 });
      }
    } else {
      const expectedBearer = `Bearer ${cronSecret.trim()}`;
      if (!authHeader || authHeader.trim() !== expectedBearer) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Invalid or missing Cron Secret' },
          { status: 401 }
        );
      }
    }

    // 2. Execute Daily Reconciliation & Integrity Audit
    const report = await runDailyReconciliation(undefined, { sendAlerts: true });

    return NextResponse.json({
      success: true,
      timestamp: report.timestamp,
      isClean: report.isClean,
      auditedTransactions: report.totalTransactionsAudited,
      issuesFound: report.issuesFound,
      criticalCount: report.criticalCount,
      warningCount: report.warningCount,
      fboStatus: report.anchorBalance?.status || 'UNKNOWN',
      report,
    }, { status: 200 });
  } catch (err: any) {
    console.error('Unhandled error executing cron reconciliation:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
