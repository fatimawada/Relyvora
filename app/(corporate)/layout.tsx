import React from 'react';
import { CorporateHeader } from '@/components/corporate/CorporateHeader';
import { CorporateFooter } from '@/components/corporate/CorporateFooter';

export const metadata = {
  title: 'Relyvora — The Trust Layer for African Social Commerce',
  description: 'Neutral transaction protocol and escrow infrastructure bridging buyers, merchants, and delivery couriers across African markets.',
};

export default function CorporateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#FAF8F5] text-[#090E1A] min-h-screen flex flex-col font-sans selection:bg-[#047857] selection:text-white">
      {/* Corporate Editorial Header */}
      <CorporateHeader />

      {/* Main Corporate Content */}
      <main className="flex-1 w-full">
        {children}
      </main>

      {/* Corporate Editorial Footer */}
      <CorporateFooter />
    </div>
  );
}
