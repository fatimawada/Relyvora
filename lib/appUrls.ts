/**
 * Host & URL helpers so that staging.relyvora.com serves the Nigeria product app
 * directly and keeps all internal links on staging.relyvora.com instead of
 * linking out to ng.relyvora.com.
 */

export function isStagingHostOrEnv(hostname?: string): boolean {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().toLowerCase();
  if (configured.includes('staging.relyvora.com')) {
    return true;
  }
  const activeHost = (
    hostname ??
    (typeof window !== 'undefined' ? window.location.hostname : '')
  )
    .trim()
    .toLowerCase();
  return activeHost.startsWith('staging.');
}

export function isNigeriaProductHost(hostname?: string): boolean {
  const activeHost = (
    hostname ??
    (typeof window !== 'undefined' ? window.location.hostname : '')
  )
    .trim()
    .toLowerCase();
  return activeHost.startsWith('ng.') || activeHost.startsWith('staging.');
}

/**
 * Returns the href for "Go to Relyvora NG" / "Nigeria app" / "I'm selling" links:
 * - On staging.relyvora.com (or when NEXT_PUBLIC_APP_URL targets staging.relyvora.com)
 *   and on ng.relyvora.com: returns '/' so navigation stays on the current host.
 * - On localhost / development: returns '/ng'.
 * - On production corporate / foundation domains (relyvora.com, foundation.relyvora.com):
 *   returns 'https://ng.relyvora.com'.
 */
export function getNigeriaAppHref(hostname?: string): string {
  if (isStagingHostOrEnv(hostname) || isNigeriaProductHost(hostname)) {
    return '/';
  }
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().toLowerCase();
  const activeHost = (
    hostname ??
    (typeof window !== 'undefined' ? window.location.hostname : '')
  )
    .trim()
    .toLowerCase();
  if (
    process.env.NODE_ENV !== 'production' ||
    configured.includes('localhost') ||
    activeHost === 'localhost' ||
    activeHost === '127.0.0.1'
  ) {
    return '/ng';
  }
  return 'https://ng.relyvora.com';
}
