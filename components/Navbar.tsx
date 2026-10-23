import React from 'react';
import Link from 'next/link';
import { Logo } from './Logo';
import { Store, Shield, Sparkles } from 'lucide-react';

export function Navbar() {
  return (
    <header className="w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-[33px] sm:top-[37px] z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
        <Logo size="md" />

        <div className="flex items-center gap-3">
          <Link
            href="/vendor"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            <Store className="w-4 h-4 text-emerald-600" />
            <span>Vendor Portal</span>
          </Link>
          
          <div className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Sandbox Active</span>
          </div>
        </div>
      </div>
    </header>
  );
}
