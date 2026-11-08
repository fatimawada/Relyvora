import crypto from 'crypto';

/**
 * Server-Side Cryptographic Utilities for Relyvora 6-Digit Delivery Release Codes.
 * Never expose raw release codes in database storage or server logs.
 */

const DEFAULT_PEPPER = 'relyvora_secure_escrow_pepper_2026';

function getPepper(): string {
  return process.env.CODE_PEPPER || DEFAULT_PEPPER;
}

/**
 * Generates an unguessable 6-digit numerical delivery release code using
 * a cryptographically secure pseudo-random number generator (CSPRNG).
 */
export function generateCryptographicReleaseCode(): string {
  const code = crypto.randomInt(100000, 1000000);
  return code.toString();
}

/**
 * Generates a random 16-byte cryptographic salt.
 */
export function generateCodeSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Computes a salted, peppered SHA-256 hash of the release code.
 */
export function hashReleaseCode(code: string, salt: string): string {
  const cleanCode = code.trim();
  const pepper = getPepper();
  return crypto
    .createHash('sha256')
    .update(`${cleanCode}:${salt}:${pepper}`)
    .digest('hex');
}

/**
 * Securely verifies a candidate release code against the stored hash in constant time.
 */
export function verifyReleaseCode(
  candidateCode: string,
  salt: string,
  storedHash: string
): boolean {
  if (!candidateCode || !salt || !storedHash) return false;
  
  const cleanCandidate = candidateCode.trim();
  if (cleanCandidate.length !== 6 || !/^\d{6}$/.test(cleanCandidate)) {
    return false;
  }

  const computedHash = hashReleaseCode(cleanCandidate, salt);

  try {
    const computedBuf = Buffer.from(computedHash, 'utf8');
    const storedBuf = Buffer.from(storedHash, 'utf8');

    if (computedBuf.length !== storedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuf, storedBuf);
  } catch {
    return false;
  }
}

/**
 * Strict lockout policy: Lock release verification if 5 or more failed attempts occur.
 */
export const MAX_CODE_ATTEMPTS = 5;
