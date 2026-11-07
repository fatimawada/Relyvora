'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'relyvora-theme';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

/**
 * 40px circular theme toggle.
 * The theme class is set before first paint by the inline script in app/layout.tsx,
 * so this component reads the current state after mount without flash or hydration mismatch.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
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
  }, []);

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
      className={`w-10 h-10 shrink-0 rounded-full border border-border bg-surface text-main hover:border-accent hover:text-accent transition-colors duration-200 inline-flex items-center justify-center ${className}`}
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
