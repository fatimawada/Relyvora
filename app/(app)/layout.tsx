import React from 'react';
import { DemoBanner } from '@/components/DemoBanner';
import { Navbar } from '@/components/Navbar';
import { ProductFooter } from '@/components/ProductFooter';

export const metadata = {
  title: 'Relyvora Nigeria — Social Commerce Escrow & Buyer Protection',
  description: 'Sell and buy on Instagram, WhatsApp, TikTok, and Facebook with 100% escrow protection. 6-digit release code doorstep settlement.',
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-site text-main min-h-screen flex flex-col font-sans selection:bg-accent selection:text-white transition-colors">
      {/* Sandbox compliance banner for transaction flows */}
      <DemoBanner />

      {/* Standard Product Navigation (Vendor/Buyer Header) */}
      <Navbar />

      {/* Product Transaction Content */}
      <main className="flex-1 w-full flex flex-col">
        {children}
      </main>

      {/* Standard Product Footer */}
      <ProductFooter />
    </div>
  );
}
