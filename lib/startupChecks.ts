/**
 * Server Startup & Environment Integrity Verification
 *
 * Runs automatically on Next.js server boot (`instrumentation.ts`) and can be
 * invoked by readiness probes or verification tests:
 * 1. Enforces PAYMENTS_MODE === NEXT_PUBLIC_PAYMENTS_MODE.
 * 2. Logs and alerts if production runs without trusted Vercel IP proxy headers.
 * 3. Logs and alerts if WHATSAPP_ALLOWED_RECIPIENTS is left non-empty in production.
 */

import type { NextRequest } from 'next/server';
import { checkPaymentsModeConsistency } from './paymentsModeCheck.mjs';
import { logError, logInfo, logWarn } from './logger';
import { sendSystemAlert } from './alerts';
import { inspectTrustedClientIp } from './rateLimit';

export interface StartupCheckSummary {
  ok: boolean;
  isProduction: boolean;
  modeConsistency: ReturnType<typeof checkPaymentsModeConsistency>;
  trustedIpReady: boolean;
  trustedIpWarning: string | null;
  whatsappAllowlistWarning: string | null;
}

export async function runServerStartupChecks(options?: {
  env?: Record<string, string | undefined>;
  probeRequest?: NextRequest | { headers: Headers };
  sendAlerts?: boolean;
}): Promise<StartupCheckSummary> {
  const env = options?.env || process.env;
  const shouldAlert = options?.sendAlerts !== false;
  const isProduction = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';

  // 1. PAYMENTS_MODE vs NEXT_PUBLIC_PAYMENTS_MODE must never drift
  const modeConsistency = checkPaymentsModeConsistency(env);
  if (!modeConsistency.ok) {
    logError('STARTUP_PAYMENTS_MODE_MISMATCH', {
      error: modeConsistency.error,
      rawServerMode: modeConsistency.rawServerMode,
      rawPublicMode: modeConsistency.rawPublicMode,
    });
    if (shouldAlert) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Startup Check Failed: PAYMENTS_MODE Mismatch',
        details: {
          error: modeConsistency.error,
          rawServerMode: modeConsistency.rawServerMode,
          rawPublicMode: modeConsistency.rawPublicMode,
        },
      }).catch(() => {});
    }
    throw new Error(`[Relyvora Startup Guard] ${modeConsistency.error}`);
  }

  // 2. Trusted IP Header Verification in Production
  let trustedIpReady = true;
  let trustedIpWarning: string | null = null;

  if (options?.probeRequest) {
    const inspection = inspectTrustedClientIp(options.probeRequest);
    if (isProduction && !inspection.ip) {
      trustedIpReady = false;
      trustedIpWarning =
        'Trusted Vercel platform header (x-vercel-forwarded-for / request.ip) missing in production.';
    }
  } else if (isProduction && env.VERCEL !== '1') {
    trustedIpReady = false;
    trustedIpWarning =
      'Production runtime started without VERCEL=1 platform proxy; x-vercel-forwarded-for will not be injected automatically.';
  }

  if (!trustedIpReady && trustedIpWarning) {
    logError('STARTUP_TRUSTED_IP_HEADER_MISSING_IN_PRODUCTION', {
      warning: trustedIpWarning,
      vercel: env.VERCEL || null,
      vercelEnv: env.VERCEL_ENV || null,
      nodeEnv: env.NODE_ENV || null,
    });
    if (shouldAlert) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Startup Check: Trusted Client IP Header Missing in Production',
        details: {
          warning: trustedIpWarning,
          vercel: env.VERCEL || null,
          vercelEnv: env.VERCEL_ENV || null,
          nodeEnv: env.NODE_ENV || null,
        },
      }).catch(() => {});
    }
  }

  // 3. WHATSAPP_ALLOWED_RECIPIENTS must not be configured as a blocking list in Production
  const rawAllowlist = (env.WHATSAPP_ALLOWED_RECIPIENTS || '').trim();
  let whatsappAllowlistWarning: string | null = null;
  if (env.VERCEL_ENV === 'production' && rawAllowlist.length > 0) {
    whatsappAllowlistWarning =
      'WHATSAPP_ALLOWED_RECIPIENTS is set in VERCEL_ENV=production. Production ignores this staging list so buyer traffic is never silently blocked; remove it from Production env.';
    logWarn('STARTUP_WHATSAPP_ALLOWLIST_SET_IN_PRODUCTION', {
      warning: whatsappAllowlistWarning,
      entryCount: rawAllowlist.split(',').filter((x) => Boolean(x.trim())).length,
    });
    if (shouldAlert) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'WARNING',
        title: 'WHATSAPP_ALLOWED_RECIPIENTS Set in Production (Ignored Fail-Open for Buyers)',
        details: {
          warning: whatsappAllowlistWarning,
          vercelEnv: env.VERCEL_ENV || null,
        },
      }).catch(() => {});
    }
  }

  logInfo('SERVER_STARTUP_CHECKS_COMPLETED', {
    paymentsMode: modeConsistency.serverMode,
    trustedIpReady,
    hasWhatsappAllowlistWarning: Boolean(whatsappAllowlistWarning),
  });

  return {
    ok: modeConsistency.ok,
    isProduction,
    modeConsistency,
    trustedIpReady,
    trustedIpWarning,
    whatsappAllowlistWarning,
  };
}
