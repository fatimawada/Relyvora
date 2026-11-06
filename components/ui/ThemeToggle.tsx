'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('relyvora-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('relyvora-theme', 'light');
    }
  };

  if (!mounted) {
    return (
      <div
        className={`w-10 h-10 rounded-full border border-border flex items-center justify-center opacity-0 ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`w-10 h-10 rounded-full border border-border bg-surface text-main hover:border-accent hover:text-accent transition-all duration-200 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      {theme === 'light' ? (
        <Moon className="w-4 h-4 text-main transition-transform" />
      ) : (
        <Sun className="w-4 h-4 text-accent transition-transform" />
      )}
    </button>
  );
}
