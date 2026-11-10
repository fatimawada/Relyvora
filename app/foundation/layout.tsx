import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Relyvora Foundation — Digital Selling Skills & Safer Payments',
  description: 'A planned initiative of Relyvora Technologies to combine practical digital selling skills with safer payments for women and young entrepreneurs in Africa.',
  openGraph: {
    title: 'Relyvora Foundation — Digital Selling Skills & Safer Payments',
    description: 'A planned initiative of Relyvora Technologies combining digital selling skills and safer payments for women and young entrepreneurs.',
    url: 'https://foundation.relyvora.com',
    siteName: 'Relyvora Foundation',
    images: [
      {
        url: '/relyvora-logo.png',
        width: 800,
        height: 600,
        alt: 'Relyvora Foundation Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Relyvora Foundation — Digital Selling Skills & Safer Payments',
    description: 'A planned initiative of Relyvora Technologies to support women and young entrepreneurs.',
    images: ['/relyvora-logo.png'],
  },
};

export default function FoundationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-site text-main min-h-screen flex flex-col font-sans selection:bg-accent selection:text-white antialiased transition-colors">
      {children}
    </div>
  );
}
