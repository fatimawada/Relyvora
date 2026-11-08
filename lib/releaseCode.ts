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
export const CODE_LIFETIME_HOURS = 72; // 72-hour expiration from escrow lock

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
