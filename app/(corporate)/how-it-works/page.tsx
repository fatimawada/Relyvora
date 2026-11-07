import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { HowItWorksInteractive } from '@/components/how-it-works/HowItWorksInteractive';

export const metadata: Metadata = {
  title: 'How It Works | Relyvora Social Commerce Escrow',
  description:
    'A step\u2011by\u2011step guide to safe buying and selling on WhatsApp and Instagram with Relyvora and our six\u2011digit doorstep release code.',
  alternates: { canonical: '/how-it-works' },
};

export default function HowItWorksPage() {
  return (
    <div className="max-w-container mx-auto px-6 py-14 sm:py-20 space-y-14">
      <div className="max-w-3xl space-y-4">
        <p className="section-label">How it works</p>
        <h1 className="text-main">Four steps, from chat to delivery.</h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          Relyvora works through a secure link you share in your WhatsApp or Instagram chat. Your money is held until your
          order arrives and you confirm with a <span className="nowrap">six-digit</span> code.
        </p>
      </div>

      <HowItWorksInteractive />

      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <p className="section-label">Pricing</p>
          <h2 className="text-2xl font-semibold text-main">Want to see how the 3% fee works?</h2>
          <p className="text-muted text-sm max-w-lg">
            Try the fee calculator with your order amount to see what the buyer pays before checkout.
          </p>
        </div>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 px-6 h-12 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-opacity hover:opacity-90 shrink-0"
        >
          <span>Open the fee calculator</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
