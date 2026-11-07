import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Building2, KeyRound, Scale } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Trust & Safety | Relyvora Transaction Protection',
  description:
    'How Relyvora protects buyers and sellers with banking partner custody powered by Anchor, a six\u2011digit release code, and a clear dispute policy.',
  alternates: { canonical: '/trust-and-safety' },
};

export default function TrustAndSafetyPage() {
  return (
    <div className="max-w-container mx-auto px-6 pt-16 pb-16 sm:pt-20 sm:pb-20 space-y-12 text-left">
      <div className="max-w-3xl space-y-4">
        <p className="section-label">Trust &amp; Safety</p>
        <h1 className="page-h1 text-main">How your payment stays protected.</h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          Relyvora holds the buyer’s payment until the order arrives and is confirmed with a{' '}
          <span className="nowrap">six-digit</span> code, backed by a written dispute policy.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 card-perspective">
        <div className="p-7 rounded-card border border-border bg-surface card-lift space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <Building2 className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-main">Held with our banking partner</h2>
          <p className="text-muted text-sm leading-relaxed">
            Payments are powered by our regulated Banking<span className="nowrap">-as-a-</span>Service partner, Anchor
            Technologies Limited, in partnership with <span className="nowrap">CBN-licensed</span> financial
            institutions.
          </p>
        </div>

        <div className="p-7 rounded-card border border-border bg-surface card-lift space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <KeyRound className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-main">
            <span className="nowrap">Six-digit</span> release code
          </h2>
          <p className="text-muted text-sm leading-relaxed">
            The seller is not paid until the buyer checks the order at delivery and confirms with their secret{' '}
            <span className="nowrap">six-digit</span> code.
          </p>
        </div>

        <div className="p-7 rounded-card border border-border bg-surface card-lift space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <Scale className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-main">Written dispute policy</h2>
          <p className="text-muted text-sm leading-relaxed">
            If an order arrives damaged or does not match what was agreed in the chat, the payment stays on hold while
            our support team reviews the evidence under our dispute policy.
          </p>
        </div>
      </div>

      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface space-y-3">
        <p className="section-label">Banking partner disclosure</p>
        <p className="text-sm sm:text-base text-main leading-relaxed">
          Relyvora Technologies Limited is a transaction protection technology platform. Payments are powered by our
          regulated Banking<span className="nowrap">-as-a-</span>Service partner, Anchor Technologies Limited, in
          partnership with <span className="nowrap">CBN-licensed</span> financial institutions.
        </p>
      </div>

      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-main">Read our Dispute Policy</h2>
          <p className="text-muted text-sm max-w-lg">
            See how we handle wrong items, damaged goods, unreachable buyers, and delivery disputes.
          </p>
        </div>
        <Link
          href="/disputes"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 h-12 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-opacity hover:opacity-90 shrink-0"
        >
          <span>Open Dispute Policy</span>
          <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </Link>
      </div>
    </div>
  );
}
