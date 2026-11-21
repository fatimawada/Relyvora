import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import {
  checkPaymentsModeConsistency,
  getServerPaymentsMode,
} from '@/lib/paymentsMode';
import { getHotSettings, isCheckoutEnabledServer, isPayoutsEnabledServer } from '@/lib/safetyLimits';
import { checkAndAlertMissingTrustedIpInProduction } from '@/lib/rateLimit';
import { logError } from '@/lib/logger';
import { sendSystemAlert } from '@/lib/alerts';
import { getWhatsappRecipientFilterStatus } from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  const checkedAt = new Date().toISOString();
  const paymentsMode = getServerPaymentsMode();
  const modeConsistency = checkPaymentsModeConsistency(process.env);

  if (!modeConsistency.ok) {
    logError('HEALTH_PAYMENTS_MODE_MISMATCH', {
      error: modeConsistency.error,
      rawServerMode: modeConsistency.rawServerMode,
      rawPublicMode: modeConsistency.rawPublicMode,
    });
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Health Check Failed: PAYMENTS_MODE vs NEXT_PUBLIC_PAYMENTS_MODE Mismatch',
      details: {
        error: modeConsistency.error,
        rawServerMode: modeConsistency.rawServerMode,
        rawPublicMode: modeConsistency.rawPublicMode,
      },
    }).catch(() => {});
  }

  const trustedIpStatus = await checkAndAlertMissingTrustedIpInProduction(
    request,
    'GET /api/health'
  );

  const waFilterStatus = getWhatsappRecipientFilterStatus();
  if (process.env.VERCEL_ENV === 'production' && waFilterStatus.state === 'set_ignored_in_production') {
    logError('HEALTH_WHATSAPP_ALLOWLIST_SET_IN_PRODUCTION', {
      state: waFilterStatus.state,
      configuredCount: waFilterStatus.configuredCount,
    });
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'WARNING',
      title: 'WHATSAPP_ALLOWED_RECIPIENTS Configured in Production (Ignored)',
      details: {
        state: waFilterStatus.state,
        configuredCount: waFilterStatus.configuredCount,
        note: 'Production must never enforce a staging recipient allowlist; remove WHATSAPP_ALLOWED_RECIPIENTS from Production.',
      },
    }).catch(() => {});
  }

  let dbHealthy = false;
  let dbError: string | null = null;
  let settingsLoaded = false;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('system_settings')
      .select('key')
      .limit(1);
    dbHealthy = !error && Array.isArray(data);
    if (error) dbError = error.message;
  } catch (err: any) {
    dbError = err?.message || 'Database health probe failed';
  }

  let checkoutEnabled = false;
  let payoutsEnabled = false;
  let allowlistMode = false;

  try {
    const hot = await getHotSettings();
    settingsLoaded = Object.keys(hot).length > 0;
    checkoutEnabled = await isCheckoutEnabledServer();
    payoutsEnabled = await isPayoutsEnabledServer();
    allowlistMode = Boolean(hot.vendor_allowlist_mode === true || hot.vendor_allowlist_mode === 'true');
  } catch (err: any) {
    settingsLoaded = false;
    if (!dbError) dbError = err?.message || 'system_settings failed health verification';
  }

  const healthy = dbHealthy && settingsLoaded && modeConsistency.ok;
  return NextResponse.json(
    {
      ok: healthy,
      status: healthy ? 'healthy' : 'degraded',
      timestamp: checkedAt,
      paymentsMode,
      modeConsistency: {
        ok: modeConsistency.ok,
        serverMode: modeConsistency.serverMode,
        publicMode: modeConsistency.publicMode,
        error: modeConsistency.error,
      },
      trustedIpHeader: {
        present: trustedIpStatus.trustedIpPresent,
        source: trustedIpStatus.ipSource,
        alertedMissingInProd: trustedIpStatus.alerted,
      },
      whatsappRecipientFilter: {
        environment: waFilterStatus.environment,
        state: waFilterStatus.state,
        enforced: waFilterStatus.enforced,
      },
      launchStatus: process.env.LAUNCH_STATUS || 'unknown',
      database: {
        connected: dbHealthy,
        settingsLoaded,
        error: dbError,
      },
      switches: {
        checkout_enabled: checkoutEnabled,
        payouts_enabled: payoutsEnabled,
        vendor_allowlist_mode: allowlistMode,
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
