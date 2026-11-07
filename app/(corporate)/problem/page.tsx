import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { ArrowRight, CheckCircle2, ShoppingBag, Store } from 'lucide-react';

export const metadata: Metadata = {
  title: 'The Social Commerce Trust Gap | Relyvora',
  description:
    'Why buying and selling on WhatsApp and Instagram feels risky in Africa, three everyday scenarios where trust breaks down, and practical steps to stay safe.',
  alternates: { canonical: '/problem' },
};

export default function ProblemPage() {
  return (
    <article className="max-w-container mx-auto px-6 py-14 sm:py-20 space-y-14">
      <JsonLd
        type="BreadcrumbList"
        data={{
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://relyvora.com' },
            { '@type': 'ListItem', position: 2, name: 'The Problem', item: 'https://relyvora.com/problem' },
          ],
        }}
      />

      <div className="max-w-3xl space-y-4">
        <p className="section-label">The problem</p>
        <h1 className="text-main">Buying in the DMs still runs on trust you cannot check.</h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          People across Nigeria buy and sell every day through WhatsApp and Instagram chats. Without a safe way to hold the
          payment between agreement and delivery, one side always has to go first—and hope the other follows through.
        </p>
      </div>

      <section className="max-w-3xl space-y-5 text-main text-base sm:text-[17px] leading-relaxed">
        <h2 className="text-2xl sm:text-3xl font-semibold text-main">Someone always takes the risk first</h2>
        <p className="text-muted">
          Most social media orders happen in private chats. A buyer sees an item on a page or status, agrees on a price in
          the DMs, and then hits the same question: who moves first?
        </p>
        <p className="text-muted">
          If the buyer transfers before delivery, the buyer takes the full risk. If the seller sends a rider on{' '}
          <span className="nowrap">pay-on-delivery</span>, the seller takes the full risk. Either way, honest buyers and
          honest sellers pay the price for the few who do not keep their word.
        </p>
      </section>

      <section className="space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="section-label">Everyday scenarios</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-main">
            Three everyday scenarios where trust breaks down
          </h2>
          <p className="text-muted text-base">
            These are the common situations buyers and sellers run into when trading in WhatsApp and Instagram chats.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 card-perspective">
          <div className="p-7 rounded-card border border-border bg-surface card-lift space-y-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-semibold text-sm">
              01
            </div>
            <h3 className="text-lg font-semibold text-main">
              <span className="nowrap">Pay-on-delivery</span> <span className="nowrap">no-shows</span>
            </h3>
            <p className="text-muted text-sm leading-relaxed">
              A seller packs an order and pays a dispatch rider to take it across town. At the door, the buyer does not
              pick up their phone or says they changed their mind. The seller loses the delivery fee on both trips while
              their stock sits on the back of a bike.
            </p>
          </div>

          <div className="p-7 rounded-card border border-border bg-surface card-lift space-y-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-semibold text-sm">
              02
            </div>
            <h3 className="text-lg font-semibold text-main">Fake transfer alerts</h3>
            <p className="text-muted text-sm leading-relaxed">
              A buyer sends a screenshot of a bank transfer receipt or a fake credit SMS and asks the seller to hand the
              package to the waiting rider right away. By the time the seller checks their bank balance properly, the order
              is gone and no money ever arrived.
            </p>
          </div>

          <div className="p-7 rounded-card border border-border bg-surface card-lift space-y-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-semibold text-sm">
              03
            </div>
            <h3 className="text-lg font-semibold text-main">Paying and hoping</h3>
            <p className="text-muted text-sm leading-relaxed">
              A buyer transfers money to a seller’s personal account for shoes, hair, or a gadget they saw online. Delivery
              day passes with excuses, then silence, or a blocked account—or a package arrives that looks nothing like what
              was shown in the chat.
            </p>
          </div>
        </div>
      </section>

      <section className="p-8 sm:p-10 rounded-3xl border border-border bg-surface space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="section-label">Practical tips</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-main">
            Ways to stay safer when buying or selling in chats
          </h2>
          <p className="text-muted text-sm sm:text-base">
            Whether you use Relyvora or trade directly, these habits help avoid common losses:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[15px]">
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-semibold text-main text-base">
              <ShoppingBag className="w-4 h-4 text-accent" aria-hidden="true" />
              <span>For buyers</span>
            </div>
            <ul className="space-y-3 text-muted">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-1" aria-hidden="true" />
                <span>Avoid sending money straight to a stranger’s personal bank account without payment protection.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-1" aria-hidden="true" />
                <span>Confirm the exact item, size, colour, and delivery fee in the chat before you pay.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-1" aria-hidden="true" />
                <span>
                  Check your order at the door before sharing your <span className="nowrap">six-digit</span> release code.
                </span>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 font-semibold text-main text-base">
              <Store className="w-4 h-4 text-accent" aria-hidden="true" />
              <span>For sellers</span>
            </div>
            <ul className="space-y-3 text-muted">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-1" aria-hidden="true" />
                <span>Never hand over an order based on a transfer screenshot or SMS alert alone.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-1" aria-hidden="true" />
                <span>
                  Use riders who understand they must confirm the <span className="nowrap">six-digit</span> code before
                  handing over the package.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-1" aria-hidden="true" />
                <span>Keep clear photos of the packed item and waybill before the rider leaves.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="pt-6 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-main text-lg">See how Relyvora works</h2>
          <p className="text-muted text-sm">
            Four steps from link to delivery, with a <span className="nowrap">six-digit</span> code at the door.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-2 px-5 h-11 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-opacity hover:opacity-90"
          >
            <span>How it works</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <Link
            href="/trust-and-safety"
            className="inline-flex items-center gap-2 px-5 h-11 rounded-btn border border-border bg-surface text-main hover:border-accent hover:text-accent font-semibold text-sm transition-colors"
          >
            <span>Trust &amp; Safety</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </article>
  );
}
