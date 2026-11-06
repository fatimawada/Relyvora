import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { HowItWorksInteractive } from '@/components/how-it-works/HowItWorksInteractive';

export const metadata: Metadata = {
  title: 'How It Works | Relyvora Social Commerce Escrow',
  description:
    'A step-by-step guide to safe buying and selling on WhatsApp and Instagram with Relyvora and our six-digit doorstep release code.',
};

export default function HowItWorksPage() {
  return (
    <div className="max-w-container mx-auto px-6 py-16 sm:py-20 space-y-16">
      {/* Page Header */}
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-xs font-semibold text-accent">
          <span>Protocol Walkthrough</span>
        </div>
        <h1 className="text-main leading-tight">
          How Relyvora escrow works.
        </h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          Four straightforward steps bridging sellers, buyers, and delivery couriers. No complicated mobile app downloads required—everything works through simple, secure web links.
        </p>
      </div>

      {/* Interactive Tabbed Walkthrough + CSS Phone Mock */}
      <HowItWorksInteractive />

      {/* Trust & Next Steps */}
      <div className="p-8 sm:p-12 rounded-3xl border border-border bg-surface flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Banking Custody</span>
          </div>
          <h3 className="text-xl font-semibold text-main">
            Want to see how fees work?
          </h3>
          <p className="text-muted text-sm max-w-lg">
            Read our transparent 3% buyer protection fee breakdown and use our live interactive fee calculator.
          </p>
        </div>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 px-6 h-12 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-all shrink-0"
        >
          <span>View pricing calculator</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
