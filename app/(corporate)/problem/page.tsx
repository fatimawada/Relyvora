import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { 
  AlertTriangle, 
  ArrowRight, 
  ShieldCheck, 
  XCircle, 
  HelpCircle, 
  CheckCircle2, 
  Store, 
  ShoppingBag 
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'The Social Commerce Trust Gap | Relyvora',
  description:
    'Why buying and selling on WhatsApp and Instagram feels risky in Africa, three common fraud scenarios, and practical steps to stay protected.',
};

export default function ProblemPage() {
  return (
    <article className="max-w-container mx-auto px-6 py-16 sm:py-20 space-y-16">
      <JsonLd
        type="BreadcrumbList"
        data={{
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://relyvora.com' },
            { '@type': 'ListItem', position: 2, name: 'The Problem', item: 'https://relyvora.com/problem' },
          ],
        }}
      />
      {/* Header Banner */}
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-xs font-semibold text-accent">
          <span>Editorial • Market Context</span>
        </div>
        <h1 className="text-main leading-tight">
          The trust problem in African social commerce.
        </h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          Millions of Africans buy and sell goods every day through direct messages on WhatsApp and Instagram. Yet the absence of neutral payment protection leaves both sides vulnerable to costly mistakes and bad actors.
        </p>
      </div>

      {/* Narrative Section 1: The Trust Barrier */}
      <section className="max-w-3xl space-y-6 text-main text-base sm:text-[17px] leading-relaxed">
        <h2 className="text-2xl sm:text-3xl font-semibold text-main">
          Why informal trade feels like a gamble
        </h2>
        <p className="text-muted">
          Unlike formal e-commerce platforms with built-in escrow, social commerce takes place in private chat windows. A buyer discovers a product through a photo or reel, negotiates price in WhatsApp or Instagram DMs, and faces a difficult dilemma: who takes the risk first?
        </p>
        <p className="text-muted">
          If the buyer pays before delivery, they assume 100% of the risk. If the seller dispatches on payment-on-delivery, the seller assumes 100% of the risk. Neither arrangement is fair, and this friction prevents honest merchants from growing and cautious buyers from completing transactions.
        </p>
      </section>

      {/* Three Real Scenarios */}
      <section className="space-y-8">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl sm:text-3xl font-semibold text-main">
            Three everyday scenarios where trust breaks down
          </h2>
          <p className="text-muted text-base">
            These are not rare incidents; they represent the daily operational friction experienced by buyers and sellers across Nigeria and broader African markets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 card-perspective">
          {/* Scenario 1: Pay-on-Delivery No-Shows */}
          <div className="p-8 rounded-card border border-border bg-surface card-lift space-y-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-bold">
              01
            </div>
            <h3 className="text-lg font-semibold text-main">
              Pay-on-delivery no-shows
            </h3>
            <p className="text-muted text-sm leading-relaxed">
              A vendor prepares an order, packages the item, and pays a third-party dispatch rider ₦2,500 to deliver it across town. When the courier arrives, the buyer does not answer their phone, has changed their mind, or claims they are no longer in the state. The vendor loses their logistics cost and must pay to have the goods returned.
            </p>
          </div>

          {/* Scenario 2: Fake Bank Transfer Alerts */}
          <div className="p-8 rounded-card border border-border bg-surface card-lift space-y-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              02
            </div>
            <h3 className="text-lg font-semibold text-main">
              Fake bank transfer alerts
            </h3>
            <p className="text-muted text-sm leading-relaxed">
              A buyer sends a convincingly generated screenshot of a bank transfer receipt or a fake SMS alert that mimics a commercial bank credit notification. Pressured by the customer to release the package quickly, the seller hands the goods to a courier before realizing the money never actually settled in their bank account.
            </p>
          </div>

          {/* Scenario 3: Paying and Hoping */}
          <div className="p-8 rounded-card border border-border bg-surface card-lift space-y-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              03
            </div>
            <h3 className="text-lg font-semibold text-main">
              Paying and hoping
            </h3>
            <p className="text-muted text-sm leading-relaxed">
              A buyer finds a vendor selling clothing or electronics online. They transfer ₦35,000 to the seller&apos;s personal bank account in good faith. Days pass with no dispatch tracking number. When the customer asks for an update, their messages are ignored, or their social media account is blocked entirely.
            </p>
          </div>
        </div>
      </section>

      {/* Practical Safety Tips */}
      <section className="p-8 sm:p-12 rounded-3xl border border-border bg-surface space-y-8">
        <div className="max-w-2xl space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-accent">
            Guidance
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold text-main">
            Practical safety tips for social media commerce
          </h2>
          <p className="text-muted text-sm sm:text-base">
            Whether you use Relyvora or transact directly, keep these practical principles in mind when trading online:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[15px]">
          {/* Tips for Buyers */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-semibold text-main text-base">
              <ShoppingBag className="w-4 h-4 text-accent" />
              <span>For Buyers</span>
            </div>
            <ul className="space-y-3 text-muted">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Never transfer funds directly into a personal bank account for an unverified merchant without protection.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Confirm item specifications, color, sizing, and refund terms in writing within the chat before paying.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Inspect the physical delivery package thoroughly before sharing your six-digit release code with the courier.</span>
              </li>
            </ul>
          </div>

          {/* Tips for Sellers */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-semibold text-main text-base">
              <Store className="w-4 h-4 text-accent" />
              <span>For Sellers</span>
            </div>
            <ul className="space-y-3 text-muted">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Never dispatch goods based on a customer screenshot or SMS notification alone. Verify cleared funds in escrow.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Always use reputable dispatch couriers who agree to verify the six-digit delivery code before handing over items.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Document proof of dispatch, including courier waybills and parcel photographs, in case of transit disputes.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Internal Navigation Links */}
      <section className="pt-6 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-semibold text-main text-base">See how Relyvora solves this</h4>
          <p className="text-muted text-sm">Learn how our 4-step escrow and doorstep release code work.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-all"
          >
            <span>How it works</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/trust-and-safety"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn border border-border bg-surface text-main hover:border-accent hover:text-accent font-semibold text-sm transition-all"
          >
            <span>Trust &amp; Safety</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </article>
  );
}
