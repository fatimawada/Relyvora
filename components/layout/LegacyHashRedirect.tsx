'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The previous single-page site used hash anchors (e.g. relyvora.com/#how-it-works).
 * Hashes never reach the server, so they are redirected here on the client to the real routes.
 */
const LEGACY_HASHES: Record<string, string> = {
  '#problem': '/problem',
  '#the-problem': '/problem',
  '#how-it-works': '/how-it-works',
  '#pricing': '/pricing',
  '#markets': '/markets',
  '#faq': '/faq',
  '#trust': '/trust-and-safety',
  '#trust-and-safety': '/trust-and-safety',
  '#founder': '/about',
  '#about': '/about',
};

export function LegacyHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const target = LEGACY_HASHES[window.location.hash.toLowerCase()];
    if (target) router.replace(target);
  }, [router]);

  return null;
}
