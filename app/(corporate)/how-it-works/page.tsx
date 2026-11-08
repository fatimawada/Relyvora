import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { HowItWorksInteractive } from '@/components/how-it-works/HowItWorksInteractive';

export const metadata: Metadata = {
  title: 'How It Works | Relyvora Social Commerce Escrow',
  description:
    'A step\u2011by\u2011step guide to safe buying and selling on WhatsApp and Instagram with Relyvora and our six\u2011digit doorstep release code.',
  alternates: { canonical: '/how-it-works' },
};

export default function HowItWorksPage() {
  return (
    <div className="max-w-container mx-auto px-6 pt-16 pb-16 sm:pt-20 sm:pb-20 space-y-12 text-left">
      <div className="max-w-3xl space-y-4">
        <p className="section-label">How it works</p>
        <h1 className="page-h1 text-main">Four steps, from chat to delivery.</h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          Relyvora works through a secure link you share in your WhatsApp or Instagram chat. Your money is held until your
          order arrives and you confirm with a <span className="nowrap">six-digit</span> code.
        </p>
      </div>

      <HowItWorksInteractive />

      {/* Dispute Section matching Section 3 */}
      <section className="p-8 sm:p-10 rounded-3xl border border-border bg-surface space-y-6">
        <div className="space-y-2">
          <p className="section-label">Disputes &amp; Refunds</p>
          <h2 className="text-2xl font-semibold text-main">What happens if something goes wrong</h2>
          <p className="text-muted text-base leading-relaxed max-w-3xl">
            If an order does not match what was agreed, arrives damaged, or goes wrong in another way, the buyer raises a
            dispute from their transaction page before sharing the code, or emails{' '}
            <a href="mailto:support@relyvora.com" className="text-accent underline font-medium">
              support@relyvora.com
            </a>{' '}
            with the transaction reference. The money stays frozen while Relyvora Support reviews it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="p-5 rounded-2xl bg-site border border-border space-y-1.5">
            <div className="font-semibold text-main">Wrong or damaged item</div>
            <p className="text-muted text-xs leading-relaxed">
              Full refund after the item is returned to the seller.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-site border border-border space-y-1.5">
            <div className="font-semibold text-main">Lost in transit</div>
            <p className="text-muted text-xs leading-relaxed">
              Full refund to the buyer.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-site border border-border space-y-1.5">
            <div className="font-semibold text-main">Buyer unreachable or refuses delivery</div>
            <p className="text-muted text-xs leading-relaxed">
              Refund less the delivery fee, with the delivery fee paid to the seller.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-site border border-border space-y-1.5">
            <div className="font-semibold text-main">Seller does not deliver</div>
            <p className="text-muted text-xs leading-relaxed">
              Seller has 6 hours to provide valid proof, otherwise a full refund is issued.
            </p>
          </div>
        </div>

        <div className="pt-2">
          <Link
            href="/disputes"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <span>Read the full dispute policy</span>
            <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Pricing CTA */}
      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <p className="section-label">Pricing</p>
          <h2 className="text-2xl font-semibold text-main">Want to see how the 3% fee (minimum ₦500) works?</h2>
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
