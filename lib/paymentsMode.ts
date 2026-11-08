/**
 * Single source of truth for payment execution mode.
 * Governed by the PAYMENTS_MODE environment variable.
 */

export type PaymentsMode = 'sandbox' | 'live';

export function getPaymentsMode(): PaymentsMode {
  // Check public environment variable for client/server, or server-side flag
  const mode = (
    process.env.NEXT_PUBLIC_PAYMENTS_MODE ||
    process.env.PAYMENTS_MODE ||
    'sandbox'
  ).toLowerCase().trim();

  return mode === 'live' ? 'live' : 'sandbox';
}

export function isLiveMode(): boolean {
  return getPaymentsMode() === 'live';
}

export function isSandboxMode(): boolean {
  return getPaymentsMode() === 'sandbox';
}
