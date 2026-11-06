import React from 'react';
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  metadataBase: new URL('https://relyvora.com'),
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
  twitter: {
    card: 'summary_large_image',
    title: 'Relyvora | Safe payments for WhatsApp and Instagram sellers in Nigeria',
    description:
      'Pay sellers on WhatsApp and Instagram without the fear. Your money is held until your order arrives and you confirm with a six-digit code.',
  },
};

export default function CorporateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col w-full bg-site text-main">
      <JsonLd type="Organization" />
      <JsonLd type="WebSite" />
      <Header />
      <main id="main-content" className="flex-1 w-full flex flex-col">
        {children}
      </main>
      <Footer />
    </div>
  );
}
