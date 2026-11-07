import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Percent, ShoppingBag, Store } from 'lucide-react';
import { FlagIcon } from '@/components/flags/FlagIcon';
import { HeroStage } from '@/components/hero/HeroStage';
import { PhoneCodeMock } from '@/components/how-it-works/PhoneCodeMock';
import { LegacyHashRedirect } from '@/components/layout/LegacyHashRedirect';
import { LAUNCH_STATUS, calculateFee } from '@/lib/feeConfig';

export const metadata: Metadata = {
  title: 'Relyvora | Safe payments for WhatsApp and Instagram commerce',
  description:
    'Pay sellers on WhatsApp and Instagram without the fear. Your money is held until your order arrives and you confirm with a six\u2011digit code. Payments powered by Anchor.',
  alternates: { canonical: '/' },
};

const SIX_DIGIT = <span className="nowrap">six-digit</span>;

const STEPS = [
  {
    title: 'Seller creates a link',
    body: 'The seller enters the item and agreed price, then shares the payment link in the chat.',
  },
  {
    title: 'Buyer pays',
    body: 'The buyer pays through Relyvora. The money is held with our banking partner, not sent to the seller yet.',
  },
  {
    title: 'Seller sends the order',
    body: 'With the payment held, the seller sends the order to the buyer.',
  },
  {
    title: 'Buyer confirms',
    body: (
      <>
        The buyer checks the order and confirms with their {SIX_DIGIT} code. The money is released to the seller.
      </>
    ),
  },
];

const PROBLEMS = [
  {
    title: <span className="nowrap">Pay-on-delivery</span>,
    rest: ' no-shows. The seller pays a rider, and the buyer does not pick up at the door.',
  },
  {
    title: 'Fake transfer alerts.',
    rest: ' A screenshot that looks like payment, but the money never arrives.',
  },
  {
    title: 'Paying and hoping.',
    rest: ' The buyer transfers first, then the seller goes quiet.',
  },
];

const MARKETS = [
  { code: 'NG' as const, name: 'Nigeria', currency: 'Naira (NGN)', live: true },
  { code: 'GH' as const, name: 'Ghana', currency: 'Cedi (GHS)', live: false },
  { code: 'KE' as const, name: 'Kenya', currency: 'Shilling (KES)', live: false },
  { code: 'ZA' as const, name: 'South Africa', currency: 'Rand (ZAR)', live: false },
];

export default function HomePage() {
  const example = calculateFee(45000);
  const nigeriaStatus = LAUNCH_STATUS === 'launching' ? 'Starting here' : 'Live';

  return (
    <div className="w-full">
      <LegacyHashRedirect />

      {/* ------------------------------------------------------------- */}
      {/* HERO (page background)                                         */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6 pt-10 pb-14 sm:pt-14 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border bg-surface text-[13px] font-semibold text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
              <span>Africa-first payment protection</span>
            </div>

            <h1 className="text-main">
              Trade with{' '}
              <br />
              <span className="text-accent">confidence.</span>
            </h1>

            <p className="text-muted text-base sm:text-lg max-w-xl leading-relaxed">
              Pay sellers on WhatsApp and Instagram without the fear. Your money is held until your order arrives and you
              confirm with a {SIX_DIGIT} code.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4">
              <Link
                href="/how-it-works"
                className="px-6 h-12 rounded-btn font-semibold text-sm bg-main text-site dark:bg-accent dark:text-[#071229] hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
              >
                <span>I&apos;m buying</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <a
                href="https://ng.relyvora.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 h-12 rounded-btn font-semibold text-sm border border-border bg-surface text-main hover:border-accent hover:text-accent transition-colors inline-flex items-center justify-center gap-2"
              >
                <span>I&apos;m selling</span>
                <ArrowUpRight className="w-4 h-4 opacity-70" aria-hidden="true" />
                <span className="sr-only">(opens ng.relyvora.com in a new tab)</span>
              </a>
            </div>

            <p className="pt-1 flex items-center gap-2 text-sm text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-muted/60" aria-hidden="true" />
              Payments powered by Anchor
            </p>
          </div>

          <div className="lg:col-span-5">
            <HeroStage />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* THE PROBLEM BAND (surface)                                     */}
      {/* ------------------------------------------------------------- */}
      <section className="bg-surface border-y border-border">
        <div className="max-w-container mx-auto px-6 py-14 sm:py-16 space-y-8">
          <div className="max-w-2xl space-y-3">
            <p className="section-label">The problem</p>
            <h2 className="text-main">Buying in the DMs still runs on trust you cannot check.</h2>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PROBLEMS.map((item, i) => (
              <li key={i} className="p-5 rounded-card border border-border bg-site text-[15px] leading-relaxed text-muted">
                <span className="font-semibold text-main">{item.title}</span>
                {item.rest}
              </li>
            ))}
          </ul>
          <Link href="/problem" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
            <span>Read more about the problem</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* VALUE CARDS (page background)                                  */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6 py-14 sm:py-20 space-y-10">
        <div className="max-w-2xl space-y-3">
          <h2 className="text-main">Safe for the buyer. Fair for the seller.</h2>
          <p className="text-muted text-base sm:text-lg">
            Relyvora works through a secure link you share in your WhatsApp or Instagram chat.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 card-perspective">
          <div className="p-7 card-lift space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-main text-xl">Safe for buyers</h3>
            <p className="text-muted text-[15px] leading-relaxed">
              Pay without wondering if the seller will deliver. Your money is held with our banking partner until your order
              arrives and you confirm with your code.
            </p>
          </div>

          <div className="p-7 card-lift space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
              <Store className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-main text-xl">Fair for sellers</h3>
            <p className="text-muted text-[15px] leading-relaxed">
              Ship knowing the buyer has already paid. No more sending out an order and getting a <span className="nowrap">no-show</span> at the door.
            </p>
          </div>

          <div className="p-7 card-lift space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
              <Percent className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-main text-xl">Clear pricing</h3>
            <p className="text-muted text-[15px] leading-relaxed">A flat 3%, paid by the buyer and shown before they pay.</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* HOW IT WORKS: four steps + phone mock (surface)                */}
      {/* ------------------------------------------------------------- */}
      <section className="bg-surface border-y border-border">
        <div className="max-w-container mx-auto px-6 py-14 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-7 space-y-8">
              <div className="max-w-2xl space-y-3">
                <p className="section-label">How it works</p>
                <h2 className="text-main">Four steps, from chat to delivery.</h2>
              </div>

              <ol className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="p-5 rounded-2xl bg-site border border-border space-y-2">
                    <div className="text-[13px] font-semibold text-accent">Step {i + 1}</div>
                    <h3 className="text-base font-semibold text-main">{s.title}</h3>
                    <p className="text-sm text-muted leading-relaxed">{s.body}</p>
                  </li>
                ))}
              </ol>

              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
              >
                <span>See the full walkthrough</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="lg:col-span-5 flex justify-center">
              <PhoneCodeMock />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* PRICING (page background)                                      */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6 py-14 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 space-y-4">
            <p className="section-label">Pricing</p>
            <h2 className="text-main">Flat 3%, paid by the buyer.</h2>
            <p className="text-muted text-base sm:text-lg">A flat 3% fee, paid by the buyer at checkout.</p>
            <div className="pt-2">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-5 h-11 rounded-btn text-sm font-semibold border border-border bg-surface hover:border-accent text-main hover:text-accent transition-colors"
              >
                <span>Open the fee calculator</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 p-6 rounded-card bg-surface border border-border space-y-4">
            <div className="flex items-center justify-between text-xs text-muted font-medium">
              <span>Example</span>
              <span className="text-accent font-semibold">3%</span>
            </div>
            <div className="space-y-2.5 pt-2 border-t border-border text-sm">
              <div className="flex justify-between text-muted">
                <span>Item price</span>
                <span className="font-semibold text-main">{example.formattedItemPrice}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Relyvora fee (3%)</span>
                <span className="font-semibold text-accent">{example.formattedFeeAmount}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border font-semibold text-main text-base">
                <span>Buyer pays</span>
                <span>{example.formattedTotalAmount}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* MARKETS (surface)                                              */}
      {/* ------------------------------------------------------------- */}
      <section className="bg-surface border-y border-border">
        <div className="max-w-container mx-auto px-6 py-14 sm:py-20 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-3">
              <p className="section-label">Markets</p>
              <h2 className="text-main">Built for African commerce.</h2>
            </div>
            <Link href="/markets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              <span>View markets</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MARKETS.map((m) => (
              <li key={m.code} className="p-5 rounded-2xl bg-site border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <FlagIcon country={m.code} size={26} />
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      m.live ? 'bg-accent/10 text-accent' : 'bg-border text-muted'
                    }`}
                  >
                    {m.live ? nigeriaStatus : 'Coming soon'}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-main">{m.name}</div>
                  <div className="text-sm text-muted">{m.currency}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* FAQ TEASER (page background)                                   */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6 py-14 sm:py-20 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-3">
            <p className="section-label">Questions</p>
            <h2 className="text-main">Frequently asked questions.</h2>
          </div>
          <Link href="/faq" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <span>See all questions</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">How does Relyvora protect buyers?</h3>
            <p className="text-muted text-sm leading-relaxed">
              When you pay through a Relyvora link, your money is held with our banking partner. The seller is not paid until
              your order arrives and you confirm with your {SIX_DIGIT} code.
            </p>
          </div>
          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">How does Relyvora protect sellers?</h3>
            <p className="text-muted text-sm leading-relaxed">
              You send the order only after the buyer has paid and the money is held, so you are not left with a{' '}
              <span className="nowrap">no-show</span> at the door.
            </p>
          </div>
          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Who pays the 3% fee?</h3>
            <p className="text-muted text-sm leading-relaxed">
              The buyer pays the 3% fee at checkout. It is shown on the payment screen before they pay.
            </p>
          </div>
          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h3 className="font-semibold text-main text-base">Where is the money held?</h3>
            <p className="text-muted text-sm leading-relaxed">
              Payments are powered by our regulated Banking<span className="nowrap">-as-a-</span>Service partner, Anchor
              Technologies Limited, in partnership with <span className="nowrap">CBN-licensed</span> financial institutions.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* FINAL CTA (surface, centred)                                   */}
      {/* ------------------------------------------------------------- */}
      <section className="bg-surface border-t border-border">
        <div className="max-w-container mx-auto px-6 py-16 sm:py-20 text-center space-y-5">
          <p className="section-label">Get started</p>
          <h2 className="text-main max-w-xl mx-auto">Ready to trade without the fear?</h2>
          <p className="text-muted text-base sm:text-lg max-w-lg mx-auto">
            Send your next payment link, or pay your next seller, through Relyvora.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://ng.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 h-12 rounded-btn font-semibold text-sm bg-main text-site dark:bg-accent dark:text-[#071229] hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
            >
              <span>Go to Relyvora NG</span>
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <Link
              href="/how-it-works"
              className="px-6 h-12 rounded-btn font-semibold text-sm border border-border bg-site text-main hover:border-accent hover:text-accent transition-colors inline-flex items-center justify-center"
            >
              Learn how it works
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
