import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Building2, KeyRound, Scale, Mail, ArrowRight } from 'lucide-react';

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
        {/* Banking Partner */}
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

        {/* Release Card */}
        <div className="p-7 rounded-card border border-border bg-surface card-lift space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <KeyRound className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-main">
            <span className="nowrap">Six-digit</span> release code
          </h2>
          <p className="text-muted text-sm leading-relaxed">
            The seller is paid when the buyer checks the order and confirms with their six-digit code. If there is a
            dispute, the money stays frozen while Relyvora Support reviews it. In some cases set out in the dispute
            policy, Relyvora can refund or release without the code.
          </p>
        </div>

        {/* Written Policy Summary */}
        <div className="p-7 rounded-card border border-border bg-surface card-lift space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
            <Scale className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-main">Written dispute policy</h2>
          <p className="text-muted text-sm leading-relaxed">
            Every transaction is protected by clear rules for damaged items, lost packages, doorstep rejections, and
            unresponsive sellers.
          </p>
        </div>
      </div>

      {/* Dispute Section */}
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
              Full refund to the buyer after the item is confirmed returned to the seller.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-site border border-border space-y-1.5">
            <div className="font-semibold text-main">Lost in transit</div>
            <p className="text-muted text-xs leading-relaxed">
              Full refund to the buyer if the package never arrives at the agreed destination.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-site border border-border space-y-1.5">
            <div className="font-semibold text-main">Buyer unreachable or refuses delivery</div>
            <p className="text-muted text-xs leading-relaxed">
              Buyer is refunded less the delivery fee, and the delivery fee is paid to the seller.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-site border border-border space-y-1.5">
            <div className="font-semibold text-main">Seller does not deliver</div>
            <p className="text-muted text-xs leading-relaxed">
              Seller has 6 hours to provide valid dispatch proof, otherwise a full refund is issued.
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

      {/* In-page Banking Partner Disclosure (stands in for footer disclosure on this page) */}
      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface space-y-3">
        <p className="section-label">Banking partner disclosure</p>
        <p className="text-sm sm:text-base text-main leading-relaxed">
          Relyvora Technologies Limited is a transaction protection technology platform. Payments are powered by our
          regulated Banking<span className="nowrap">-as-a-</span>Service partner, Anchor Technologies Limited, in
          partnership with <span className="nowrap">CBN-licensed</span> financial institutions.
        </p>
      </div>

      {/* Still stuck / Contact section */}
      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-main">Still stuck? Email support@relyvora.com</h2>
          <p className="text-muted text-sm max-w-lg leading-relaxed">
            Need help with an active transaction or delivery code? Contact our dedicated support team directly.
          </p>
        </div>
        <a
          href="mailto:support@relyvora.com"
          className="inline-flex items-center gap-2 px-6 h-12 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-opacity hover:opacity-90 shrink-0"
        >
          <Mail className="w-4 h-4" aria-hidden="true" />
          <span>Email support@relyvora.com</span>
        </a>
      </div>
    </div>
  );
}
