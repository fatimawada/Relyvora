import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Relyvora Foundation — Expanding Access to Opportunity in the Digital Economy',
  description: 'An economic empowerment initiative by Relyvora Technologies equipping women and youth across Africa with digital entrepreneurship skills, financial literacy, and zero-trust escrow protection infrastructure.',
  openGraph: {
    title: 'Relyvora Foundation — Digital Trade & Financial Inclusion for Women & Youth',
    description: 'Bridging the trust deficit in African social commerce with capacity building and zero-fee escrow infrastructure.',
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
    title: 'Relyvora Foundation — Empowering African Digital Entrepreneurs',
    description: 'Equipping women and youth with digital commerce skills, financial literacy, and zero-fee escrow protection.',
    images: ['/relyvora-logo.png'],
  },
};

export default function FoundationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#090E1A] text-slate-100 min-h-screen flex flex-col font-sans selection:bg-emerald-500 selection:text-white antialiased">
      {children}
    </div>
  );
}
