/**
 * Cryptographic Release Code System - Phase G1.5 Security Hardening
 * 
 * Rules:
 * 1. HMAC-SHA256 keyed by server-side secret (RELEASE_CODE_PEPPER, server env only).
 * 2. Keyed over `${transactionId}:${code}`.
 * 3. Never store or log plaintext release code.
 * 4. Constant-time comparison using crypto.timingSafeEqual.
 * 5. Code expiration enforcement via code_expires_at.
 */

import crypto from 'crypto';

export const MAX_CODE_ATTEMPTS = 5;
export const CODE_LIFETIME_HOURS = 72; // Fallback default
export const DELIVERY_WINDOW_DEFAULTS = {
  same_city_days: 3,
  interstate_days: 7,
  grace_days: 3,
  hard_max_days: 14,
  dispatch_deadline_days: 3,
  reminder_hours_before_expiry: 24,
};

export interface DeliveryWindowConfig {
  same_city_days: number;
  interstate_days: number;
  grace_days: number;
  hard_max_days: number;
  dispatch_deadline_days: number;
  reminder_hours_before_expiry: number;
}

/**
 * Retrieves the server-side release code pepper.
 * Throws in production if missing.
 */
function getReleaseCodePepper(): string {
  const pepper = process.env.RELEASE_CODE_PEPPER;
  if (!pepper) {
    if (process.env.NODE_ENV === 'production' && process.env.PAYMENTS_MODE === 'live') {
      throw new Error('CRITICAL SECURITY CONFIGURATION ERROR: RELEASE_CODE_PEPPER is missing.');
    }
    return 'relyvora_sandbox_pepper_k9823hfasdf0923';
  }
  return pepper.trim();
}

/**
 * Generates a 6-digit release code using CSPRNG.
 */
export function generateCryptographicReleaseCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Computes HMAC-SHA256 over `${transactionId}:${code}` keyed with RELEASE_CODE_PEPPER.
 */
export function computeReleaseCodeHmac(transactionId: string, code: string): string {
  const pepper = getReleaseCodePepper();
  const payload = `${transactionId}:${code.trim()}`;
  return crypto.createHmac('sha256', pepper).update(payload).digest('hex');
}

/**
 * Constant-time comparison of the computed HMAC against the database hash.
 */
export function verifyReleaseCodeHmac(
  transactionId: string, 
  code: string, 
  storedHash: string
): boolean {
  if (!transactionId || !code || !storedHash) return false;
  try {
    const computed = computeReleaseCodeHmac(transactionId, code);
    const computedBuf = Buffer.from(computed, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');

    if (computedBuf.length !== storedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuf, storedBuf);
  } catch {
    return false;
  }
}

/**
 * Checks if a release code has expired.
 */
export function isCodeExpired(codeExpiresAt: string | null | undefined): boolean {
  if (!codeExpiresAt) return false;
  return new Date().getTime() > new Date(codeExpiresAt).getTime();
}

/**
 * Calculates expiration timestamp from now.
 */
export function calculateCodeExpiration(hours: number = CODE_LIFETIME_HOURS): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

/**
 * Computes delivery window code lifetime in hours:
 *   totalDays = min(hard_max_days, chosenWindowDays + grace_days)
 *   Defaults: same_city = 3d + 3d = 6d (144h); interstate = 7d + 3d = 10d (240h); hard max = 14d (336h).
 */
export function calculateDeliveryWindowCodeExpiration(
  deliveryType: 'same_city' | 'interstate' = 'same_city',
  cfg?: Partial<DeliveryWindowConfig>,
  fromIso?: string
): { codeExpiresAt: string; windowDays: number; totalDays: number; deliveryDeadlineAt: string } {
  const merged = { ...DELIVERY_WINDOW_DEFAULTS, ...(cfg || {}) };
  const windowDays =
    deliveryType === 'interstate'
      ? Math.max(1, Number(merged.interstate_days) || 7)
      : Math.max(1, Number(merged.same_city_days) || 3);
  const graceDays = Math.max(0, Number(merged.grace_days) || 3);
  const hardMaxDays = Math.max(1, Number(merged.hard_max_days) || 14);
  const totalDays = Math.min(hardMaxDays, windowDays + graceDays);

  const baseMs = fromIso ? new Date(fromIso).getTime() : Date.now();
  const safeBaseMs = Number.isNaN(baseMs) ? Date.now() : baseMs;

  const deliveryDeadlineAt = new Date(safeBaseMs + windowDays * 24 * 3600 * 1000).toISOString();
  const codeExpiresAt = new Date(safeBaseMs + totalDays * 24 * 3600 * 1000).toISOString();
  return { codeExpiresAt, windowDays, totalDays, deliveryDeadlineAt };
}
