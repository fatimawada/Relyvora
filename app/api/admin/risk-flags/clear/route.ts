import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getClientIp } from '@/lib/rateLimit';
import { clearTransactionRiskHold } from '@/lib/riskEngine';
import { logAndAlertAdminAction } from '@/lib/adminSafety';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdminSession(request);
    if (!auth.authorized || !auth.user?.email) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error || 'Unauthorized admin access',
          code: auth.code,
          aal: auth.aal,
          mfaEnrolled: auth.mfaEnrolled,
          enrollmentUrl: auth.enrollmentUrl || '/admin/security',
        },
        { status: auth.statusCode }
      );
    }

    const body = await request.json();
    const { transactionId, reason, unblock = false } = body || {};

    if (!transactionId || typeof transactionId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'transactionId is required.' },
        { status: 400 }
      );
    }

    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 3) {
      return NextResponse.json(
        { success: false, error: 'A non-empty reason (at least 3 characters) is required to clear a risk hold.' },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request);
    const result = await clearTransactionRiskHold({
      transactionId,
      adminEmail: auth.user.email,
      reason: cleanReason,
      unblock: Boolean(unblock),
      ipAddress: clientIp,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to clear risk review hold.' },
        { status: result.statusCode || 400 }
      );
    }

    await logAndAlertAdminAction({
      adminEmail: auth.user.email,
      action: unblock ? 'ADMIN_CLEAR_RISK_HOLD_AND_UNBLOCK' : 'ADMIN_CLEAR_RISK_HOLD',
      targetType: 'transaction',
      targetId: transactionId,
      ipAddress: clientIp,
      alertTitle: `Admin Cleared Risk Hold on Transaction ${transactionId.slice(0, 8)}`,
      severity: unblock ? 'CRITICAL' : 'WARNING',
      metadata: {
        reason: cleanReason,
        unblock: Boolean(unblock),
        clearedFlagsCount: result.clearedFlagsCount ?? 0,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      transactionId,
      unblocked: Boolean(unblock),
      clearedFlagsCount: result.clearedFlagsCount ?? 0,
      message: unblock
        ? 'Risk hold cleared and transaction unblocked.'
        : 'Risk hold cleared for transaction.',
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/risk-flags/clear:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
