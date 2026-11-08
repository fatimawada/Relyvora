/**
 * Payment Mode Configuration - Phase G1.5 Security Hardening
 * 
 * Strict Architectural Rule:
 * PAYMENTS_MODE comes ONLY from server env (PAYMENTS_MODE), never from a row or client.
 */

export type PaymentsMode = 'sandbox' | 'live';

/**
 * Server-side source of truth for payment execution mode.
 * Strictly checks process.env.PAYMENTS_MODE.
 */
export function getServerPaymentsMode(): PaymentsMode {
  const mode = (process.env.PAYMENTS_MODE || 'sandbox').toLowerCase().trim();
  return mode === 'live' ? 'live' : 'sandbox';
}

/**
 * Standard accessor function used in server route handlers.
 */
export function getPaymentsMode(): PaymentsMode {
  if (typeof window === 'undefined') {
    return getServerPaymentsMode();
  }
  // Client UI badge convenience only
  const clientMode = (process.env.NEXT_PUBLIC_PAYMENTS_MODE || 'sandbox').toLowerCase().trim();
  return clientMode === 'live' ? 'live' : 'sandbox';
}

export function isLiveMode(): boolean {
  return getPaymentsMode() === 'live';
}

export function isSandboxMode(): boolean {
  return getPaymentsMode() === 'sandbox';
}
