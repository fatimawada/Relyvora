import React from 'react';
import { DemoBanner } from '@/components/DemoBanner';
import { Navbar } from '@/components/Navbar';
import { NgLightThemeGuard } from '@/components/NgLightThemeGuard';
import { ProductFooter } from '@/components/ProductFooter';

export const metadata = {
  title: 'Relyvora Nigeria — Safe Payments for Social Commerce',
  description: 'Safe payments for WhatsApp and Instagram orders in Nigeria. Funds are held safely until your order arrives and you confirm with a six-digit release code.',
};

const NG_LIGHT_THEME_VARS = {
  '--bg': '#F4F6F9',
  '--surface': '#FFFFFF',
  '--text': '#0A1B3D',
  '--muted': '#5A6880',
  '--accent': '#0B6E55',
  '--accent-contrast': '#FFFFFF',
  '--border': '#E2E7EF',
  '--logo-1': '#0A1B3D',
  '--logo-2': '#0B6E55',
  '--logo-3': '#0FA36B',
  '--background': '#F4F6F9',
  '--foreground': '#0A1B3D',
  colorScheme: 'light',
} as React.CSSProperties;

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={NG_LIGHT_THEME_VARS}
      className="bg-site text-main min-h-screen flex flex-col font-sans selection:bg-accent selection:text-white"
    >
      <NgLightThemeGuard />

      {/* Sandbox banner (only renders in explicit sandbox/demo environments) */}
      <DemoBanner />

      {/* Clean NG App Header */}
      <Navbar />

      {/* Product Content */}
      <main id="main-content" className="flex-1 w-full flex flex-col">
        {children}
      </main>

      {/* Standard Product Footer */}
      <ProductFooter />
    </div>
  );
}
