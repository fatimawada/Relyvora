/**
 * Shared Postgres-Backed Sliding-Window Rate Limiter
 * Provides fail-closed DDoS, brute-force, and OTP/code guessing defense across serverless instances.
 */

import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { sendSystemAlert } from '@/lib/alerts';
import { logError } from '@/lib/logger';

export interface TrustedIpInspection {
  ip: string | null;
  source: 'x-vercel-forwarded-for' | 'request.ip' | 'missing';
  hasVercelForwardedFor: boolean;
  hasNextIp: boolean;
}

/**
 * Extract trusted client IP exclusively from Vercel's platform-set header
 * (`x-vercel-forwarded-for`) or NextRequest `ip`. Client-spoofable proxy
 * forwarding headers are strictly ignored and never read.
 */
export function inspectTrustedClientIp(request: NextRequest | { headers: Headers }): TrustedIpInspection {
  const vercelForwarded = request.headers.get('x-vercel-forwarded-for');
  const nextIp = (request as { ip?: unknown }).ip;

  if (vercelForwarded && vercelForwarded.trim()) {
    const first = vercelForwarded.split(',')[0].trim();
    if (first) {
      return {
        ip: first,
        source: 'x-vercel-forwarded-for',
        hasVercelForwardedFor: true,
        hasNextIp: typeof nextIp === 'string' && Boolean(nextIp.trim()),
      };
    }
  }

  if (typeof nextIp === 'string' && nextIp.trim()) {
    return {
      ip: nextIp.trim(),
      source: 'request.ip',
      hasVercelForwardedFor: false,
      hasNextIp: true,
    };
  }

  return {
    ip: null,
    source: 'missing',
    hasVercelForwardedFor: false,
    hasNextIp: false,
  };
}

export function getTrustedClientIp(request: NextRequest | { headers: Headers }): string | null {
  return inspectTrustedClientIp(request).ip;
}

export function getClientIp(request: NextRequest | { headers: Headers }): string {
  return getTrustedClientIp(request) || 'unverified-ip';
}

const lastMissingIpAlertByContext = new Map<string, number>();

/**
 * Logs and triggers an operational alert if the trusted platform IP header
 * (`x-vercel-forwarded-for` / `request.ip`) is missing in production.
 */
export async function checkAndAlertMissingTrustedIpInProduction(
  request: NextRequest | { headers: Headers },
  contextLabel: string,
  options?: { cooldownMs?: number }
): Promise<{
  isProduction: boolean;
  trustedIpPresent: boolean;
  ipSource: TrustedIpInspection['source'];
  alerted: boolean;
}> {
  const isProduction =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const inspection = inspectTrustedClientIp(request);

  if (!isProduction || inspection.ip) {
    return {
      isProduction,
      trustedIpPresent: Boolean(inspection.ip),
      ipSource: inspection.source,
      alerted: false,
    };
  }

  const details = {
    route: contextLabel,
    vercelEnv: process.env.VERCEL_ENV || null,
    nodeEnv: process.env.NODE_ENV || null,
    hasVercelForwardedFor: inspection.hasVercelForwardedFor,
    hasNextIp: inspection.hasNextIp,
    reason: 'Expected Vercel platform header x-vercel-forwarded-for is missing in production.',
  };

  logError('TRUSTED_IP_HEADER_MISSING_IN_PRODUCTION', details);

  const cooldownMs = options?.cooldownMs ?? 60_000;
  const now = Date.now();
  const prevAlert = lastMissingIpAlertByContext.get(contextLabel) || 0;
  let alerted = false;
  if (cooldownMs <= 0 || now - prevAlert >= cooldownMs) {
    lastMissingIpAlertByContext.set(contextLabel, now);
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Trusted Client IP Header Missing in Production',
      details,
    }).catch(() => {});
    alerted = true;
  }

  return {
    isProduction,
    trustedIpPresent: false,
    ipSource: inspection.source,
    alerted,
  };
}

/**
 * Shared Supabase-backed sliding-window rate limiter across serverless instances.
 * Strictly fails closed with an operational alert if the RPC or Postgres table is missing/unreachable.
 */
export async function checkSharedRateLimit(
  key: string,
  limit: number = 10,
  windowMs: number = 15 * 60 * 1000,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ allowed: boolean; remaining: number; resetAt: number; source: 'shared_db' }> {
  const supabase = supabaseClient || getServiceSupabase();
  const { data, error } = await supabase.rpc('rpc_check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error || !data || typeof data.allowed !== 'boolean') {
    const errMsg = error?.message || 'rpc_check_rate_limit returned invalid or missing response';
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Shared Rate Limiter Unavailable (Fail Closed)',
      details: { keyPrefix: key.slice(0, 32), error: errMsg },
    }).catch(() => {});
    throw new Error(`Shared rate-limit backend error: ${errMsg}`);
  }

  return {
    allowed: data.allowed,
    remaining: Number(data.remaining ?? 0),
    resetAt: data.reset_at ? new Date(data.reset_at).getTime() : Date.now() + windowMs,
    source: 'shared_db',
  };
}
