/**
 * Shared CommonJS-free ES module validating PAYMENTS_MODE vs NEXT_PUBLIC_PAYMENTS_MODE.
 * Imported directly by both next.config.mjs (at build time) and lib/paymentsMode.ts (at runtime).
 */

const VALID_MODES = new Set(['sandbox', 'live']);

/**
 * Inspects PAYMENTS_MODE and NEXT_PUBLIC_PAYMENTS_MODE for mismatches or invalid values.
 * @param {Record<string, string | undefined>} [env]
 */
export function checkPaymentsModeConsistency(env = process.env) {
  const rawServer = env.PAYMENTS_MODE !== undefined ? String(env.PAYMENTS_MODE).trim() : null;
  const rawPublic =
    env.NEXT_PUBLIC_PAYMENTS_MODE !== undefined ? String(env.NEXT_PUBLIC_PAYMENTS_MODE).trim() : null;

  const normServer = rawServer ? rawServer.toLowerCase() : null;
  const normPublic = rawPublic ? rawPublic.toLowerCase() : null;

  if (normServer && !VALID_MODES.has(normServer)) {
    return {
      ok: false,
      serverMode: 'sandbox',
      publicMode: normPublic === 'live' ? 'live' : 'sandbox',
      rawServerMode: rawServer,
      rawPublicMode: rawPublic,
      error: `Invalid PAYMENTS_MODE="${rawServer}". Expected "sandbox" or "live".`,
    };
  }

  if (normPublic && !VALID_MODES.has(normPublic)) {
    return {
      ok: false,
      serverMode: normServer === 'live' ? 'live' : 'sandbox',
      publicMode: 'sandbox',
      rawServerMode: rawServer,
      rawPublicMode: rawPublic,
      error: `Invalid NEXT_PUBLIC_PAYMENTS_MODE="${rawPublic}". Expected "sandbox" or "live".`,
    };
  }

  const serverMode = normServer === 'live' ? 'live' : 'sandbox';
  const publicMode = normPublic === 'live' ? 'live' : 'sandbox';

  if (serverMode !== publicMode) {
    return {
      ok: false,
      serverMode,
      publicMode,
      rawServerMode: rawServer,
      rawPublicMode: rawPublic,
      error: `Mode mismatch: PAYMENTS_MODE resolved to "${serverMode}" (${rawServer ?? 'unset'}) while NEXT_PUBLIC_PAYMENTS_MODE resolved to "${publicMode}" (${rawPublic ?? 'unset'}). Both must match.`,
    };
  }

  return {
    ok: true,
    serverMode,
    publicMode,
    rawServerMode: rawServer,
    rawPublicMode: rawPublic,
    error: null,
  };
}

/**
 * Throws a fatal Error if PAYMENTS_MODE and NEXT_PUBLIC_PAYMENTS_MODE differ or are invalid.
 * @param {Record<string, string | undefined>} [env]
 */
export function assertPaymentsModeConsistency(env = process.env) {
  const result = checkPaymentsModeConsistency(env);
  if (!result.ok) {
    throw new Error(`[Relyvora Payments Mode Guard] ${result.error}`);
  }
  return result;
}
