'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from './Logo';
import { Store, Globe, ArrowUpRight } from 'lucide-react';

export function Navbar() {
  const corporateUrl = process.env.NODE_ENV === 'production' 
    ? 'https://relyvora.com' 
    : '/';

  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-[33px] sm:top-[37px] z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo size="md" withLink={true} />
          <span className="hidden sm:inline-block text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
            Nigeria 🇳🇬
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={corporateUrl}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <span>Corporate Site</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>

          <Link
            href="/vendor"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
          >
            <Store className="w-3.5 h-3.5" />
            <span>Vendor Portal</span>
          </Link>
          
          <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Simulated Escrow</span>
          </div>
        </div>
      </div>
    </header>
  );
}
