'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { isExplicitSandboxUiMode } from '@/lib/appUrls';

export function Navbar() {
  const live = !isExplicitSandboxUiMode();

  return (
    <header
      className={`w-full bg-surface/95 backdrop-blur-md border-b border-border sticky ${
        live ? 'top-0' : 'top-7'
      } z-40`}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/" aria-label="Relyvora home">
            <Logo variant="full" height={30} withLink={false} />
          </Link>
        </div>

        <div className="flex items-center">
          <Link
            href="/vendor"
            className="text-xs sm:text-sm font-semibold text-muted hover:text-main transition-colors px-2.5 py-1.5 rounded-lg"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
