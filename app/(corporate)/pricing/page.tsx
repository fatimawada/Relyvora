import React from 'react';
import type { Metadata } from 'next';
import { CheckCircle2, Percent } from 'lucide-react';
import { PricingCalculator } from '@/components/pricing/PricingCalculator';

export const metadata: Metadata = {
  title: 'Pricing | Flat 3% Buyer Fee — Relyvora',
  description:
    'Relyvora charges a flat 3% fee, paid by the buyer and shown before they pay. No subscriptions or account opening fees.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return (
    <div className="max-w-container mx-auto px-6 py-14 sm:py-20 space-y-14">
      <div className="max-w-3xl space-y-4">
        <p className="section-label">Pricing</p>
        <h1 className="text-main">Flat 3%, paid by the buyer.</h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          A flat 3% fee, paid by the buyer at checkout and shown before they pay. No account opening fees and no monthly
          subscriptions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-6 space-y-6">
          <div className="p-8 rounded-3xl border border-border bg-surface space-y-6">
            <div className="inline-flex items-center gap-2 section-label">
              <Percent className="w-4 h-4" aria-hidden="true" />
              <span>Buyer fee</span>
            </div>

            <div className="space-y-2">
              <div className="text-4xl sm:text-5xl font-bold text-main tracking-tight font-heading">3%</div>
              <p className="text-muted text-sm">A flat 3%, paid by the buyer and shown before they pay.</p>
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

          <div className="p-6 rounded-2xl border border-border bg-surface space-y-2 text-xs text-muted leading-relaxed">
            <div className="font-semibold text-main text-sm">Shown before you pay</div>
            <p>
              The 3% fee is added to the order total and displayed on the payment screen so the buyer sees the full amount
              before paying.
            </p>
          </div>
        </div>

        <div className="lg:col-span-6">
          <PricingCalculator />
        </div>
      </div>

      <section className="space-y-6 pt-8 border-t border-border">
        <div className="space-y-2">
          <p className="section-label">Questions</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-main">Pricing questions</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Who pays the 3% fee?</h3>
            <p className="text-muted text-sm leading-relaxed">
              The buyer pays the 3% fee at checkout. It is shown on the payment screen before they pay.
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Are there any other charges?</h3>
            <p className="text-muted text-sm leading-relaxed">
              No. There are no registration fees or monthly charges.
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Are fees refunded if an order is cancelled?</h3>
            <p className="text-muted text-sm leading-relaxed">
              [TODO: Policy pending confirmation from Relyvora team — Cancellation fee refund policy]
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Does the 3% apply to delivery fees?</h3>
            <p className="text-muted text-sm leading-relaxed">
              [TODO: Policy pending confirmation from Relyvora team — Whether 3% applies to item price only or item plus courier delivery]
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
