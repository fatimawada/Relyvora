import React from 'react';
import type { Metadata } from 'next';
import { CheckCircle2, Percent } from 'lucide-react';
import { PricingCalculator } from '@/components/pricing/PricingCalculator';

export const metadata: Metadata = {
  title: 'Pricing | 3% (minimum ₦500) | Relyvora',
  description:
    'The buyer pays 3% of what they pay into escrow, with a minimum fee of ₦500. The fee is shown before they pay. There are no other Relyvora fees and no subscriptions.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return (
    <div className="max-w-container mx-auto px-6 pt-16 pb-16 sm:pt-20 sm:pb-20 space-y-12 text-left">
      <div className="max-w-3xl space-y-4">
        <p className="section-label">Pricing</p>
        <h1 className="page-h1 text-main">3%, paid by the buyer. Minimum ₦500.</h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          The buyer pays 3% of what they pay into escrow, with a minimum fee of ₦500. The fee is shown before they pay.
          There are no other Relyvora fees and no subscriptions.
        </p>
      </div>

      {/* Grid: on mobile, Shown before you pay goes under calculator; on desktop, columns are top-aligned */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* 1. Buyer fee card: order-1 on mobile, left column on desktop */}
        <div className="order-1 lg:order-1 lg:col-span-6 p-7 sm:p-9 rounded-3xl border border-border bg-surface space-y-6">
          <div className="inline-flex items-center gap-2 section-label">
            <Percent className="w-4 h-4" aria-hidden="true" />
            <span>Buyer fee</span>
          </div>

          <div className="space-y-2">
            <div className="text-3xl sm:text-4xl font-bold text-main tracking-tight font-heading">
              3% <span className="text-xl sm:text-2xl font-normal text-muted">(minimum ₦500)</span>
            </div>
            <p className="text-muted text-sm leading-relaxed">
              Paid by the buyer at checkout and shown before they pay.
            </p>
          </div>

          <ul className="pt-4 border-t border-border space-y-3.5 text-sm text-muted">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
              <span>Money held with our banking partner until delivery is confirmed.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <span className="nowrap">Six-digit</span> release code sent to the buyer.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
              <span>Dispute review if the order does not match what was agreed.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
              <span>No monthly subscriptions or setup charges.</span>
            </li>
          </ul>
        </div>

        {/* 2. Calculator: order-2 on mobile, right column on desktop spanning rows */}
        <div className="order-2 lg:order-3 lg:col-span-6 lg:row-span-2">
          <PricingCalculator />
        </div>

        {/* 3. Shown before you pay card: order-3 on mobile (under calculator), left column row 2 on desktop */}
        <div className="order-3 lg:order-2 lg:col-span-6 p-6 rounded-2xl border border-border bg-surface space-y-2 text-xs text-muted leading-relaxed">
          <div className="font-semibold text-main text-sm">Shown before you pay</div>
          <p>
            The fee is added to the order total and displayed on the payment screen so the buyer sees the full amount
            before paying.
          </p>
        </div>
      </div>

      <section className="space-y-6 pt-8 border-t border-border">
        <div className="space-y-2">
          <p className="section-label">Questions</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-main">Pricing questions</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Who pays the fee?</h3>
            <p className="text-muted text-sm leading-relaxed">
              The buyer pays the 3% fee (minimum ₦500) at checkout. It is shown on the payment screen before they pay.
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Are there any other charges?</h3>
            <p className="text-muted text-sm leading-relaxed">
              Relyvora charges only the 3% fee (minimum ₦500) to the buyer. Delivery is a separate cost agreed between
              buyer and seller.
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Are fees refunded if an order is cancelled?</h3>
            <p className="text-muted text-sm leading-relaxed">
              [TODO: Policy pending confirmation from Relyvora team: Whether the fee is refunded when an order is cancelled or refunded]
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Does the fee apply to delivery?</h3>
            <p className="text-muted text-sm leading-relaxed">
              [TODO: Policy pending confirmation from Relyvora team: Whether the fee base includes courier delivery or item price only]
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
