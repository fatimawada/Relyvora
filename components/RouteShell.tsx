'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DemoBanner } from '@/components/DemoBanner';
import { Navbar } from '@/components/Navbar';
import { ProductFooter } from '@/components/ProductFooter';
import { CorporateHeader } from '@/components/corporate/CorporateHeader';
import { CorporateFooter } from '@/components/corporate/CorporateFooter';

interface RouteShellProps {
  children: React.ReactNode;
}

export function RouteShell({ children }: RouteShellProps) {
  const pathname = usePathname() || '/';

  // Check if current route is part of the Nigerian transaction application
  const isProductRoute = 
    pathname.startsWith('/vendor') || 
    pathname.startsWith('/pay') || 
    pathname.startsWith('/order') || 
    pathname.startsWith('/ng');

  if (isProductRoute) {
    return (
      <div className="bg-slate-50 text-slate-900 min-h-screen flex flex-col font-sans">
        {/* Sandbox compliance banner for transaction flows */}
        <DemoBanner />

        {/* Product Application Navigation */}
        <Navbar />

        {/* Transaction Content */}
        <main className="flex-1 w-full flex flex-col">
          {children}
        </main>

        {/* Product Application Footer */}
        <ProductFooter />
      </div>
    );
  }

  // Corporate Site (relyvora.com):
  // Distinct visual identity: warm ivory background, deep ink typography, editorial header & footer, no demo banner
  return (
    <div className="bg-[#FAF8F5] text-[#090E1A] min-h-screen flex flex-col font-sans selection:bg-[#047857] selection:text-white">
      {/* Corporate Editorial Navigation */}
      <CorporateHeader />

      {/* Corporate Content */}
      <main className="flex-1 w-full">
        {children}
      </main>

      {/* Corporate Editorial Footer */}
      <CorporateFooter />
    </div>
  );
}
