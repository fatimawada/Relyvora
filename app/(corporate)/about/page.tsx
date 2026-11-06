import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Relyvora | Founder & Mission',
  description:
    'Relyvora is building the transaction protection infrastructure for African social commerce, founded by Fatima Binta Wada.',
};

export default function AboutPage() {
  return (
    <div className="max-w-container mx-auto px-6 py-16 sm:py-20 space-y-16">
      {/* Header */}
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-xs font-semibold text-accent">
          <span>Our Story &amp; Leadership</span>
        </div>
        <h1 className="text-main leading-tight">
          Building the trust layer for African commerce.
        </h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          We believe informal social commerce is the lifeblood of African retail. Our mission is to eliminate fear, failed deliveries, and payment disputes with neutral, accessible escrow rails.
        </p>
      </div>

      {/* Founder Profile Card */}
      <div className="p-8 sm:p-12 rounded-3xl border border-border bg-surface shadow-sm space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-main text-site dark:bg-accent dark:text-[#071229] flex items-center justify-center font-bold text-lg font-heading shadow-xs">
              FBW
            </div>
            <div>
              <h2 className="text-2xl font-bold text-main">Fatima Binta Wada</h2>
              <p className="text-sm text-accent font-medium">Founder &amp; CEO, Relyvora Technologies Limited</p>
            </div>
          </div>
          <div className="text-xs font-mono text-muted">
            Abuja, Nigeria
          </div>
        </div>

        {/* Narrative & Cleaned Bio (Mortality rate sentence removed) */}
        <div className="space-y-4 text-muted text-base sm:text-[17px] leading-relaxed max-w-3xl">
          <p>
            <strong className="text-main">Fatima Binta Wada</strong> is the Founder &amp; CEO of Relyvora Technologies Limited. Driven by firsthand insight into the challenges faced by informal African micro-merchants and online shoppers, she engineered Relyvora as a neutral, accessible transaction layer bridging buyers, social sellers, and dispatch delivery fleets.
          </p>
          <p>
            Under her leadership, Relyvora combines practical digital tools for social media merchants with regulated Banking-as-a-Service infrastructure powered by Anchor, replacing friction and uncertainty with verified doorstep delivery confirmation codes and automated settlement.
          </p>
        </div>

        {/* Core Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border text-sm text-muted">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
            <span>Anchor-Powered Regulated Custody</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
            <span>Eliminating Pay-on-Delivery Risk</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
            <span>6-Digit Doorstep Handshake Protocol</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
            <span>Economic Inclusion for African Social Sellers</span>
          </div>
        </div>
      </div>

      {/* Next Link */}
      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-site flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-xl font-semibold text-main">
            Explore our roadmap across the continent
          </h3>
          <p className="text-muted text-sm">
            See where Relyvora is launching and expanding across West, East, and Southern Africa.
          </p>
        </div>
        <Link
          href="/markets"
          className="inline-flex items-center gap-2 px-6 h-12 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-all shrink-0"
        >
          <span>View markets</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
