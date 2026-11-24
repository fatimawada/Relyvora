'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'relyvora-theme';

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

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

/**
 * 40px circular theme toggle.
 * The theme class is set before first paint by the inline script in app/layout.tsx,
 * so this component reads the current state after mount without flash or hydration mismatch.
 * Always hidden on Nigeria product hosts (ng.relyvora.com / staging.relyvora.com) and app routes.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const pathname = usePathname() || '';
  const [theme, setTheme] = useState<Theme | null>(null);
  const [hidden, setHidden] = useState<boolean>(() => isLightOnlySurface(pathname, ''));

  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname || '' : '';
    if (isLightOnlySurface(pathname, host)) {
      setHidden(true);
      applyTheme('light');
      return;
    }
    setHidden(false);
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const next: Theme = e.matches ? 'dark' : 'light';
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener('change', onSystemChange);

    const onSync = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener('relyvora-theme-change', onSync);

    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('relyvora-theme-change', onSync);
    };
  }, [pathname]);

  if (hidden || isLightOnlySurface(pathname, '')) {
    return null;
  }

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
    setTheme(next);
    window.dispatchEvent(new CustomEvent<Theme>('relyvora-theme-change', { detail: next }));
  };

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`w-10 h-10 shrink-0 rounded-full border border-border bg-surface text-main hover:border-accent hover:text-accent focus:outline-none focus:ring-0 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 transition-colors duration-200 inline-flex items-center justify-center ${className}`}
      aria-label="Toggle theme"
      aria-pressed={theme ? isDark : undefined}
      title={theme ? `Toggle theme (currently ${theme})` : 'Toggle theme'}
    >
      <span className={theme ? 'opacity-100' : 'opacity-0'} aria-hidden="true">
        {isDark ? <Moon className="w-[18px] h-[18px]" /> : <Sun className="w-[18px] h-[18px]" />}
      </span>
    </button>
  );
}
