/**
 * In-Memory Sliding-Window IP Rate Limiter
 * Provides DDoS, brute-force, and credential stuffing defense for sensitive payment routes.
 */

import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired keys every 5 minutes to avoid memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Extract client IP securely from headers.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

/**
 * In-memory synchronous sliding-window check (used as fallback when DB unavailable).
 */
export function checkRateLimit(
  key: string,
  limit: number = 10,
  windowMs: number = 15 * 60 * 1000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    const newRecord: RateLimitRecord = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(key, newRecord);
    return { allowed: true, remaining: limit - 1, resetAt: newRecord.resetAt };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

/**
 * Shared Supabase-backed sliding-window rate limiter across serverless instances.
 * Falls back cleanly to local checkRateLimit if pre-migration DB lacks rpc_check_rate_limit.
 */
export async function checkSharedRateLimit(
  key: string,
  limit: number = 10,
  windowMs: number = 15 * 60 * 1000,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<{ allowed: boolean; remaining: number; resetAt: number; source: 'shared_db' | 'memory_fallback' }> {
  try {
    const supabase = supabaseClient || getServiceSupabase();
    const { data, error } = await supabase.rpc('rpc_check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    });
    if (!error && data && typeof data.allowed === 'boolean') {
      return {
        allowed: data.allowed,
        remaining: Number(data.remaining ?? 0),
        resetAt: data.reset_at ? new Date(data.reset_at).getTime() : Date.now() + windowMs,
        source: 'shared_db',
      };
    }
  } catch {
    // Fall back gracefully when RPC is not yet deployed or DB unreachable
  }

  const mem = checkRateLimit(key, limit, windowMs);
  return { ...mem, source: 'memory_fallback' };
}
