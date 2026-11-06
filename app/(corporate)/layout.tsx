import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Relyvora | Safe payments for WhatsApp and Instagram sellers in Nigeria',
  description:
    'Pay sellers on WhatsApp and Instagram without the fear. Your money is held until your order arrives and you confirm with a six-digit code.',
  openGraph: {
    title: 'Relyvora | Safe payments for WhatsApp and Instagram sellers in Nigeria',
    description:
      'Pay sellers on WhatsApp and Instagram without the fear. Your money is held until your order arrives and you confirm with a six-digit code.',
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
    <div className="min-h-screen w-full font-sans antialiased">
      {children}
    </div>
  );
}
