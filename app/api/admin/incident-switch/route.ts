import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getClientIp } from '@/lib/rateLimit';
import { clearSafetySettingsCache } from '@/lib/safetyLimits';
import { logAndAlertAdminAction } from '@/lib/adminSafety';
import { sendSystemAlert } from '@/lib/alerts';

const ALLOWED_INCIDENT_SWITCHES = new Set([
  'checkout_enabled',
  'payouts_enabled',
  'vendor_allowlist_mode',
]);

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
    const settingKey = String(body?.settingKey ?? body?.key ?? '').trim();
    const rawEnabled = body?.enabled !== undefined ? body.enabled : body?.value;
    const reason = String(body?.reason || 'Admin emergency incident switch toggle').trim();

    if (!ALLOWED_INCIDENT_SWITCHES.has(settingKey)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported switch "${settingKey}". Allowed: checkout_enabled, payouts_enabled, vendor_allowlist_mode.`,
        },
        { status: 400 }
      );
    }

    if (typeof rawEnabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'enabled must be a boolean (true or false).' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await supabase
      .from('system_settings')
      .upsert(
        {
          key: settingKey,
          value: rawEnabled,
          updated_by: auth.user.email,
          updated_at: nowIso,
        },
        { onConflict: 'key' }
      );

    if (upsertErr) {
      return NextResponse.json(
        { success: false, error: `Failed updating ${settingKey}: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    clearSafetySettingsCache();

    const clientIp = getClientIp(request);
    const alertTitle = `Incident Switch Changed: ${settingKey} = ${rawEnabled ? 'ENABLED' : 'DISABLED'}`;

    sendSystemAlert({
      type: 'INCIDENT_SWITCH',
      severity: 'CRITICAL',
      title: alertTitle,
      details: {
        settingKey,
        enabled: rawEnabled,
        adminEmail: auth.user.email,
        reason,
        ipAddress: clientIp,
      },
    }).catch(() => {});

    await logAndAlertAdminAction({
      adminEmail: auth.user.email,
      action: `INCIDENT_SWITCH_${settingKey.toUpperCase()}`,
      targetType: 'system_settings',
      targetId: settingKey,
      ipAddress: clientIp,
      alertTitle,
      severity: 'CRITICAL',
      metadata: {
        settingKey,
        enabled: rawEnabled,
        reason,
      },
      supabaseClient: supabase,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      settingKey,
      enabled: rawEnabled,
      updatedAt: nowIso,
      message: `${settingKey} updated to ${rawEnabled ? 'true' : 'false'}.`,
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/incident-switch:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
