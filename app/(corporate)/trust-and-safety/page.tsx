import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { 
  ShieldCheck, 
  KeyRound, 
  Building2, 
  Scale, 
  CheckCircle2, 
  ArrowRight, 
  ArrowUpRight 
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Trust & Safety | Relyvora Transaction Protection',
  description:
    'Our transaction safety architecture, Banking-as-a-Service custody powered by Anchor, and dispute resolution framework.',
};

export default function TrustAndSafetyPage() {
  return (
    <div className="max-w-container mx-auto px-6 py-16 sm:py-20 space-y-16">
      {/* Header */}
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-xs font-semibold text-accent">
          <span>Security Architecture</span>
        </div>
        <h1 className="text-main leading-tight">
          Trust &amp; safety framework.
        </h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          How we combine regulated banking custody, physical verification codes, and neutral dispute resolution to keep social commerce honest and safe.
        </p>
      </div>

      {/* 3 Core Trust Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 card-perspective">
        {/* Pillar 1: Regulated Banking Custody */}
        <div className="p-8 rounded-card border border-border bg-surface card-lift space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-semibold text-main">
            Regulated banking custody
          </h3>
          <p className="text-muted text-sm leading-relaxed">
            Buyer funds are not held in personal accounts or informal wallets. Payments are received into dedicated virtual accounts powered by our Banking-as-a-Service partner, Anchor Technologies Limited, in partnership with CBN-licensed financial institutions.
          </p>
        </div>

        {/* Pillar 2: Doorstep 6-Digit Code */}
        <div className="p-8 rounded-card border border-border bg-surface card-lift space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-semibold text-main">
            Six-digit release code
          </h3>
          <p className="text-muted text-sm leading-relaxed">
            The buyer holds the final authority over payment. Payouts cannot be claimed by sellers without physical verification. The buyer provides the secret code only after opening and inspecting the package.
          </p>
        </div>

        {/* Pillar 3: Binding Dispute Policy */}
        <div className="p-8 rounded-card border border-border bg-surface card-lift space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <Scale className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-semibold text-main">
            Neutral arbitration
          </h3>
          <p className="text-muted text-sm leading-relaxed">
            If an item arrives damaged, defective, or significantly different from what was agreed in writing, funds remain frozen in escrow while our support team reviews evidence from both parties.
          </p>
        </div>
      </div>

      {/* Regulatory Disclosure Banner (Exact Required Text) */}
      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" />
          <span>Statutory &amp; Banking Disclosure</span>
        </div>
        <p className="text-sm sm:text-base text-main leading-relaxed">
          Relyvora Technologies Limited is a transaction protection technology platform. Payment collections, virtual accounts and payouts are powered by our regulated Banking-as-a-Service partner, Anchor Technologies Limited, in partnership with CBN-licensed financial institutions.
        </p>
      </div>

      {/* Dispute Policy Link Card */}
      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-site flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-xl font-semibold text-main">
            Read our Dispute &amp; Refund Policy
          </h3>
          <p className="text-muted text-sm max-w-lg">
            Review the 8 binding arbitration scenarios governing package rejection, damaged goods, courier delays, and merchant refunds.
          </p>
        </div>
        <Link
          href="/disputes"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 h-12 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-all shrink-0"
        >
          <span>Open Dispute Policy</span>
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
