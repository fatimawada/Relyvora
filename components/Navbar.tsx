'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { FlagIcon } from '@/components/flags/FlagIcon';
import { Store, ArrowUpRight, ShieldCheck } from 'lucide-react';

export function Navbar() {
  const corporateUrl = process.env.NODE_ENV === 'production' 
    ? 'https://relyvora.com' 
    : '/';

  return (
    <header className="w-full bg-site/95 backdrop-blur-md border-b border-border sticky top-[33px] sm:top-[37px] z-40 transition-colors">
      <div className="max-w-5xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Relyvora home">
            <Logo variant="full" height={30} withLink={false} />
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 font-semibold">
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

          <Link
            href="/vendor/onboarding"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-pill text-main hover:bg-surface border border-transparent hover:border-border transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            <span>KYC Verification</span>
          </Link>

          <Link
            href="/vendor"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-pill bg-accent hover:opacity-90 text-[#071229] shadow-xs transition-colors"
          >
            <Store className="w-3.5 h-3.5" />
            <span>Vendor Portal</span>
          </Link>
          
          <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface text-muted border border-border">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span>Simulated Escrow</span>
          </div>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
