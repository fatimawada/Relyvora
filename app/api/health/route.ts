import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getServerPaymentsMode } from '@/lib/paymentsMode';
import { getHotSettings, isCheckoutEnabledServer, isPayoutsEnabledServer } from '@/lib/safetyLimits';

export async function GET() {
  const checkedAt = new Date().toISOString();
  const paymentsMode = getServerPaymentsMode();
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

  let checkoutEnabled = true;
  let payoutsEnabled = true;
  let allowlistMode = false;

  try {
    const hot = await getHotSettings();
    settingsLoaded = Object.keys(hot).length > 0;
    checkoutEnabled = await isCheckoutEnabledServer();
    payoutsEnabled = await isPayoutsEnabledServer();
    allowlistMode = Boolean(hot.vendor_allowlist_mode === true || hot.vendor_allowlist_mode === 'true');
  } catch {
    // Non-fatal
  }

  const healthy = dbHealthy;
  return NextResponse.json(
    {
      ok: healthy,
      status: healthy ? 'healthy' : 'degraded',
      timestamp: checkedAt,
      paymentsMode,
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
