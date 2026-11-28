'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function isLightOnlySurface(pathname: string, hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h.startsWith('ng.') || h.startsWith('staging.')) {
    return true;
  }
  return (
    pathname === '/ng' ||
    pathname.startsWith('/ng/') ||
    pathname === '/vendor' ||
    pathname.startsWith('/vendor/') ||
    pathname.startsWith('/pay/') ||
    pathname.startsWith('/order/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/')
  );
}

/**
 * Theme switch button removed across all surfaces.
 * Enforces light mode on all surfaces so no dark-mode toggle is ever shown.
 */
export function ThemeToggle(_props: { className?: string }) {
  const pathname = usePathname() || '';

  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname || '' : '';
    if (isLightOnlySurface(pathname, host) || true) {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }, [pathname]);

  return null;
}
