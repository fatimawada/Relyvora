import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Percent, CheckCircle2, ShieldCheck, HelpCircle } from 'lucide-react';
import { PricingCalculator } from '@/components/pricing/PricingCalculator';

export const metadata: Metadata = {
  title: 'Pricing | Simple 3% Protection Fee — Relyvora',
  description:
    'Relyvora charges a flat 3% transaction protection fee paid by the buyer. No subscriptions, no hidden maintenance charges.',
};

export default function PricingPage() {
  return (
    <div className="max-w-container mx-auto px-6 py-16 sm:py-20 space-y-16">
      {/* Header */}
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-xs font-semibold text-accent">
          <span>Fee Structure</span>
        </div>
        <h1 className="text-main leading-tight">
          Simple, transparent pricing.
        </h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          A flat 3% transaction protection fee, paid by the buyer at checkout. No account opening fees, no monthly maintenance charges, and no hidden surprises.
        </p>
      </div>

      {/* Main Pricing Grid: Value proposition on left, interactive calculator on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Column: What you get */}
        <div className="lg:col-span-6 space-y-8">
          <div className="p-8 rounded-3xl border border-border bg-surface space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
              <Percent className="w-4 h-4" />
              <span>Flat 3% Buyer Protection</span>
            </div>

            <div className="space-y-2">
              <div className="text-4xl sm:text-5xl font-black text-main tracking-tight font-heading">
                3%
              </div>
              <p className="text-muted text-sm">
                Paid by the buyer and calculated transparently before initiating payment.
              </p>
            </div>

            <div className="pt-4 border-t border-border space-y-3.5 text-sm text-muted">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Funds held in Anchor-powered regulated banking custody.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Six-digit doorstep release code provided to buyer.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Neutral dispute mediation if goods fail physical inspection.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Zero monthly software fees or recurring platform commitments.</span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-border bg-site space-y-2 text-xs text-muted leading-relaxed">
            <div className="font-semibold text-main text-sm">Clear Billing Principles</div>
            <p>
              The protection fee is calculated and displayed on the payment checkout screen before authorization so the buyer knows the exact total before paying.
            </p>
          </div>
        </div>

        {/* Right Column: Interactive Calculator */}
        <div className="lg:col-span-6">
          <PricingCalculator />
        </div>
      </div>

      {/* Pricing FAQs */}
      <section className="space-y-6 pt-8 border-t border-border">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-semibold text-main">
            Pricing questions &amp; answers
          </h2>
          <p className="text-muted text-sm">
            Everything you need to know about how fees are calculated and collected.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h4 className="font-semibold text-main text-base">Who pays the 3% protection fee?</h4>
            <p className="text-muted text-sm leading-relaxed">
              The buyer pays the fee as part of their checkout total. It is clearly broken down on the payment screen before payment is authorized.
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h4 className="font-semibold text-main text-base">Are there any hidden deductions?</h4>
            <p className="text-muted text-sm leading-relaxed">
              No. What you see is what you pay. There are no registration fees, platform maintenance charges, or monthly minimums.
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h4 className="font-semibold text-main text-base">Are fees refunded if an order is cancelled?</h4>
            <p className="text-muted text-sm leading-relaxed">
              [TODO: Policy pending confirmation from Relyvora team — Cancellation fee refund policy]
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h4 className="font-semibold text-main text-base">Does the fee cover delivery costs?</h4>
            <p className="text-muted text-sm leading-relaxed">
              [TODO: Policy pending confirmation from Relyvora team — Whether 3% applies to item price only or item plus courier delivery]
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
