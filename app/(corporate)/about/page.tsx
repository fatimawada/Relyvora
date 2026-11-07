import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Relyvora | Founder & Mission',
  description:
    'Relyvora builds payment protection for WhatsApp and Instagram commerce in Africa, founded by Fatima Binta Wada.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <div className="max-w-container mx-auto px-6 pt-16 pb-16 sm:pt-20 sm:pb-20 space-y-12 text-left">
      <div className="max-w-3xl space-y-4">
        <p className="section-label">About</p>
        <h1 className="page-h1 text-main">Payment protection built for social commerce.</h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          Everyday buying and selling across Africa happens in WhatsApp and Instagram chats. Relyvora gives buyers and
          sellers a safe way to pay and get paid without guessing who can be trusted.
        </p>
      </div>

      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-main text-site dark:bg-accent dark:text-[#071229] flex items-center justify-center font-bold text-lg font-heading">
              FBW
            </div>
            <div>
              <h2 className="text-2xl font-bold text-main">Fatima Binta Wada</h2>
              <p className="text-sm text-accent font-medium">Founder &amp; CEO, Relyvora Technologies Limited</p>
            </div>
          </div>
          <div className="text-xs font-medium text-muted">Abuja, Nigeria</div>
        </div>

        <div className="space-y-4 text-muted text-base sm:text-[17px] leading-relaxed max-w-3xl">
          <p>
            <strong className="text-main">Fatima Binta Wada</strong> is the Founder &amp; CEO of Relyvora Technologies
            Limited. Seeing firsthand how buyers lose money to unfulfilled orders and how honest sellers lose money to{' '}
            <span className="nowrap">pay-on-delivery</span> <span className="nowrap">no-shows</span>, she built Relyvora
            to give both sides a fair way to trade.
          </p>
          <p>
            With Relyvora, the buyer pays through a secure link, the money is held with our banking partner until the
            order arrives, and the buyer confirms with a <span className="nowrap">six-digit</span> code to release the
            payment to the seller.
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border text-sm text-muted">
          <li className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span>Payments powered by Anchor</span>
          </li>
          <li className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span>
              Ends <span className="nowrap">pay-on-delivery</span> <span className="nowrap">no-shows</span>
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span>
              <span className="nowrap">Six-digit</span> confirmation code at delivery
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span>Flat 3% buyer fee, shown before payment</span>
          </li>
        </ul>
      </div>

      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-main">See where Relyvora is launching</h2>
          <p className="text-muted text-sm">
            Starting in Nigeria, with Ghana, Kenya, and South Africa coming soon.
          </p>
        </div>
        <Link
          href="/markets"
          className="inline-flex items-center gap-2 px-6 h-12 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-opacity hover:opacity-90 shrink-0"
        >
          <span>View markets</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
