'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { FlagIcon } from '@/components/flags/FlagIcon';
import { isLiveMode } from '@/lib/paymentsMode';
import { Store, ArrowUpRight } from 'lucide-react';

export function Navbar() {
  const corporateUrl = process.env.NODE_ENV === 'production' 
    ? 'https://relyvora.com' 
    : '/';

  const live = isLiveMode();

  return (
    <header className="w-full bg-site/95 backdrop-blur-md border-b border-border sticky top-[33px] sm:top-[37px] z-40 transition-colors">
      <div className="max-w-5xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Relyvora home">
            <Logo variant="full" height={30} withLink={false} />
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-sans px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 font-semibold">
            <FlagIcon country="NG" size={15} />
            <span>Nigeria</span>
          </span>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <a
            href={corporateUrl}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-main transition-colors"
          >
            <span>Corporate Site</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>

          {/* Vendor verification is manual during invite-only launch; "Verify your account" link will go here once self-serve KYC ships */}

          <Link
            href="/vendor"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-pill bg-accent hover:opacity-90 text-[#071229] shadow-xs transition-colors"
          >
            <Store className="w-3.5 h-3.5" />
            <span>Vendor Portal</span>
          </Link>
          
          {!live && (
            <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface text-muted border border-border">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span>Simulated Escrow</span>
            </div>
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
