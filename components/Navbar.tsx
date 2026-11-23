'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { FlagIcon } from '@/components/flags/FlagIcon';
import { isExplicitSandboxUiMode } from '@/lib/appUrls';

export function Navbar() {
  const live = !isExplicitSandboxUiMode();

  return (
    <header
      className={`w-full bg-surface/95 backdrop-blur-md border-b border-border sticky ${
        live ? 'top-0' : 'top-[33px] sm:top-[37px]'
      } z-40`}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Relyvora home">
            <Logo variant="full" height={30} withLink={false} />
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-sans px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 font-semibold">
            <FlagIcon country="NG" size={15} />
            <span>Nigeria</span>
          </span>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {!live && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Sandbox Mode</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
