import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runDailyReconciliation } from '@/lib/reconciliation';
import {
  expireUnpaidOrders,
  flagOverdueDispatchesAndSendReminders,
  retryStuckSettlementLegs,
} from '@/lib/orderLifecycle';
import { runRetentionCleanup } from '@/lib/retentionCleanup';
import { sendSystemAlert } from '@/lib/alerts';

export async function GET(request: NextRequest) {
  return handleCronReconcile(request);
}

export async function POST(request: NextRequest) {
  return handleCronReconcile(request);
}

async function handleCronReconcile(request: NextRequest) {
  try {
    // 1. Strict Fail-Closed Bearer Secret Authentication (NEVER skipped in any environment)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET?.trim();

    if (!cronSecret) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'CRON_SECRET Missing on Server (Fail Closed)',
        details: { env: process.env.NODE_ENV || 'unknown' },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: 'Server misconfiguration: CRON_SECRET missing' },
        { status: 500 }
      );
    }

    const expectedBearer = `Bearer ${cronSecret}`;
    const providedBuf = Buffer.from((authHeader || '').trim(), 'utf8');
    const expectedBuf = Buffer.from(expectedBearer, 'utf8');
    if (
      providedBuf.length === 0 ||
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid or missing Cron Secret' },
        { status: 401 }
      );
    }

    // 2. Run automated order lifecycle & retention jobs
    const expired = await expireUnpaidOrders();
    const reminders = await flagOverdueDispatchesAndSendReminders();
    const stuckRetry = await retryStuckSettlementLegs();

    // 3. Execute Daily Reconciliation & Integrity Audit
    const report = await runDailyReconciliation(undefined, { sendAlerts: true });
    const retention = await runRetentionCleanup();

    return NextResponse.json({
      success: true,
      timestamp: report.timestamp,
      isClean: report.isClean,
      auditedTransactions: report.totalTransactionsAudited,
      issuesFound: report.issuesFound,
      criticalCount: report.criticalCount,
      warningCount: report.warningCount,
      fboStatus: report.anchorBalance?.status || 'UNKNOWN',
      lifecycle: {
        expired,
        reminders,
        stuckRetry,
        retention,
      },
      report,
    }, { status: 200 });
  } catch (err: any) {
    console.error('Unhandled error executing cron reconciliation:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
