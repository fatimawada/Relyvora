import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Relyvora — Elite 3D Escrow Protocol & Trust Layer',
  description:
    'Institutional-grade neutral transaction protocol and 3D escrow infrastructure bridging buyers, merchants, and delivery fleets across African social commerce.',
  openGraph: {
    title: 'Relyvora — Elite 3D Escrow Protocol',
    description: 'Neutral transaction protocol and escrow infrastructure for African social commerce.',
    url: 'https://relyvora.com',
    siteName: 'Relyvora',
    type: 'website',
  },
};

export default function CorporateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0A0A0C] text-white min-h-screen w-full font-sans antialiased selection:bg-emerald-500 selection:text-black">
      {children}
    </div>
  );
}
