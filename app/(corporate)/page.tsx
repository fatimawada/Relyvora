import React from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, 
  ArrowRight, 
  ArrowUpRight, 
  Lock, 
  CheckCircle2, 
  Store, 
  ShoppingBag, 
  Package, 
  KeyRound, 
  Percent, 
  Globe 
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { FlagIcon } from '@/components/flags/FlagIcon';
import { LAUNCH_STATUS, calculateFee, formatNaira } from '@/lib/feeConfig';

export default function HomePage() {
  const exampleCalculation = calculateFee(45000);

  return (
    <div className="w-full space-y-24 sm:space-y-32 py-12 sm:py-16">
      {/* ------------------------------------------------------------- */}
      {/* HERO SECTION */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column (1.1 ratio ~ col-span-7) */}
          <div className="lg:col-span-7 space-y-6 text-left">
            {/* Launch Status Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border bg-surface text-xs font-semibold text-accent shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span>
                {LAUNCH_STATUS === 'launching' ? 'Launching in Nigeria' : 'Live in Nigeria'}
              </span>
            </div>

            {/* H1 Heading */}
            <h1 className="text-main tracking-tight leading-[1.06]">
              Trade with<br />
              <span className="text-accent">confidence.</span>
            </h1>

            {/* Subheading Body */}
            <p className="text-muted text-base sm:text-lg max-w-xl leading-relaxed">
              Pay sellers on WhatsApp and Instagram without the fear. Your money is held until your order arrives and you confirm with a six-digit code.
            </p>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4">
              <a
                href="#how-it-works"
                className="px-6 h-12 rounded-btn font-semibold text-sm bg-main text-site dark:bg-accent dark:text-[#071229] hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                <span>I&apos;m buying</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <a
                href="https://ng.relyvora.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 h-12 rounded-btn font-semibold text-sm border border-border bg-surface text-main hover:border-accent hover:text-accent transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                <span>I&apos;m selling</span>
                <ArrowUpRight className="w-4 h-4 opacity-70" />
              </a>
            </div>

            {/* Trust Line */}
            <div className="pt-2 flex items-center gap-2 text-xs text-muted">
              <ShieldCheck className="w-4 h-4 text-accent" />
              <span>Payments powered by Anchor</span>
            </div>
          </div>

          {/* Right Column (0.9 ratio ~ col-span-5) - Brand Symbol Presentation */}
          <div className="lg:col-span-5 flex items-center justify-center">
            <div className="relative w-full max-w-[340px] aspect-square rounded-3xl border border-border bg-surface p-8 flex items-center justify-center shadow-lg transition-transform card-lift">
              {/* Pre-rendered Brand Symbol SVG */}
              <div className="w-44 h-44 flex items-center justify-center">
                <Logo variant="symbol" height={150} withLink={false} />
              </div>
              <div className="absolute bottom-4 left-6 right-6 text-center text-xs font-medium text-muted">
                Transaction Protection Infrastructure
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* THREE VALUE CARDS */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-12">
          <h2 className="text-main">
            Protection built for both sides of social trade.
          </h2>
          <p className="text-muted text-base">
            No complicated apps or paperwork. Relyvora creates a neutral escrow contract over a secure web link.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 card-perspective">
          {/* Card 1: Safe for buyers */}
          <div className="p-8 rounded-card border border-border bg-surface card-lift space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h3 className="text-main text-xl font-semibold">Safe for buyers</h3>
            <p className="text-muted text-[15px] leading-relaxed">
              Never worry about sending money to an Instagram or WhatsApp vendor and hoping for the best. Your money is held in regulated custody until your package is in your hands.
            </p>
          </div>

          {/* Card 2: Fair for sellers */}
          <div className="p-8 rounded-card border border-border bg-surface card-lift space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
            <h3 className="text-main text-xl font-semibold">Fair for sellers</h3>
            <p className="text-muted text-[15px] leading-relaxed">
              Say goodbye to dispatching inventory on pay-on-delivery only for buyers to cancel or go unreachable. Pack and ship with confidence knowing payment is verified and waiting.
            </p>
          </div>

          {/* Card 3: Clear pricing */}
          <div className="p-8 rounded-card border border-border bg-surface card-lift space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
              <Percent className="w-6 h-6" />
            </div>
            <h3 className="text-main text-xl font-semibold">Clear pricing</h3>
            <p className="text-muted text-[15px] leading-relaxed">
              A flat 3% transaction protection fee paid by the buyer. Calculated transparently upfront before payment so there are no surprises or hidden maintenance deductions.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* FOUR-STEP SUMMARY */}
      {/* ------------------------------------------------------------- */}
      <section id="how-it-works" className="max-w-container mx-auto px-6">
        <div className="p-8 sm:p-14 rounded-3xl border border-border bg-surface space-y-12 shadow-sm">
          <div className="max-w-2xl space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-accent">
              The 4-Step Escrow Workflow
            </div>
            <h2 className="text-main">
              How Relyvora protects your transactions.
            </h2>
            <p className="text-muted text-base">
              Turn social media direct messages into safe, confirmed transactions in four clear steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="space-y-3 p-5 rounded-2xl bg-site border border-border/80">
              <div className="text-xs font-semibold text-accent">STEP 01</div>
              <h4 className="text-base font-semibold text-main">Seller creates link</h4>
              <p className="text-sm text-muted leading-relaxed">
                The seller enters the agreed item name and price, generating a secure escrow link for the customer.
              </p>
            </div>

            {/* Step 2 */}
            <div className="space-y-3 p-5 rounded-2xl bg-site border border-border/80">
              <div className="text-xs font-semibold text-accent">STEP 02</div>
              <h4 className="text-base font-semibold text-main">Buyer locks payment</h4>
              <p className="text-sm text-muted leading-relaxed">
                The buyer pays securely into Anchor custody. Funds are held safely; neither party can tamper with them.
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-3 p-5 rounded-2xl bg-site border border-border/80">
              <div className="text-xs font-semibold text-accent">STEP 03</div>
              <h4 className="text-base font-semibold text-main">Seller dispatches</h4>
              <p className="text-sm text-muted leading-relaxed">
                Knowing payment is locked, the seller dispatches the package to the buyer&apos;s delivery address.
              </p>
            </div>

            {/* Step 4 */}
            <div className="space-y-3 p-5 rounded-2xl bg-site border border-border/80">
              <div className="text-xs font-semibold text-accent">STEP 04</div>
              <h4 className="text-base font-semibold text-main">Doorstep code release</h4>
              <p className="text-sm text-muted leading-relaxed">
                The buyer inspects the order and confirms with their secret 6-digit code, releasing funds to the seller.
              </p>
            </div>
          </div>

          <div className="pt-2 text-center">
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
            >
              <span>Explore the full walkthrough with interactive demo</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* PRICING TEASER */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center p-8 sm:p-12 rounded-3xl border border-border bg-surface">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-accent">
              Transparent Pricing
            </div>
            <h2 className="text-main">
              Flat 3% buyer protection fee.
            </h2>
            <p className="text-muted text-base leading-relaxed">
              We charge a straightforward 3% fee, paid by the buyer at checkout. No setup fees, no monthly software subscriptions, and no surprise charges.
            </p>
            <div className="pt-2">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn text-sm font-semibold border border-border bg-site hover:border-accent text-main hover:text-accent transition-all"
              >
                <span>Open interactive fee calculator</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 p-6 rounded-2xl bg-site border border-border space-y-4">
            <div className="flex items-center justify-between text-xs text-muted font-medium">
              <span>Illustrative example</span>
              <span className="text-accent font-semibold">3% Rate</span>
            </div>
            <div className="space-y-2.5 pt-2 border-t border-border text-sm">
              <div className="flex justify-between text-muted">
                <span>Agreed Item Price</span>
                <span className="font-semibold text-main">{exampleCalculation.formattedItemPrice}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Relyvora Protection Fee (3%)</span>
                <span className="font-semibold text-accent">{exampleCalculation.formattedFeeAmount}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border font-semibold text-main text-base">
                <span>Total Buyer Pays</span>
                <span>{exampleCalculation.formattedTotalAmount}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* MARKETS TEASER */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6">
        <div className="p-8 sm:p-12 rounded-3xl border border-border bg-surface space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-accent">
                Regional Coverage
              </div>
              <h2 className="text-main text-2xl sm:text-3xl">
                Built for African commerce.
              </h2>
            </div>
            <Link
              href="/markets"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline self-start sm:self-auto"
            >
              <span>View all market timelines</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Nigeria */}
            <div className="p-5 rounded-2xl bg-site border border-border space-y-3">
              <div className="flex items-center justify-between">
                <FlagIcon country="NG" size={26} />
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                  Launching
                </span>
              </div>
              <div>
                <div className="font-semibold text-main">Nigeria</div>
                <div className="text-xs text-muted">Operational launch market</div>
              </div>
            </div>

            {/* Ghana */}
            <div className="p-5 rounded-2xl bg-site border border-border space-y-3">
              <div className="flex items-center justify-between">
                <FlagIcon country="GH" size={26} />
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-border text-muted">
                  Coming soon
                </span>
              </div>
              <div>
                <div className="font-semibold text-main">Ghana</div>
                <div className="text-xs text-muted">Accra &amp; Kumasi waitlist</div>
              </div>
            </div>

            {/* Kenya */}
            <div className="p-5 rounded-2xl bg-site border border-border space-y-3">
              <div className="flex items-center justify-between">
                <FlagIcon country="KE" size={26} />
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-border text-muted">
                  Coming soon
                </span>
              </div>
              <div>
                <div className="font-semibold text-main">Kenya</div>
                <div className="text-xs text-muted">Nairobi waitlist</div>
              </div>
            </div>

            {/* South Africa */}
            <div className="p-5 rounded-2xl bg-site border border-border space-y-3">
              <div className="flex items-center justify-between">
                <FlagIcon country="ZA" size={26} />
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-border text-muted">
                  Coming soon
                </span>
              </div>
              <div>
                <div className="font-semibold text-main">South Africa</div>
                <div className="text-xs text-muted">Johannesburg &amp; Cape Town</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* TOP 4 FAQS TEASER */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-accent">
              Questions &amp; Answers
            </div>
            <h2 className="text-main text-2xl sm:text-3xl">
              Frequently asked questions.
            </h2>
          </div>
          <Link
            href="/faq"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline self-start sm:self-auto"
          >
            <span>See full FAQ directory</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h4 className="font-semibold text-main text-base">How does Relyvora protect buyers?</h4>
            <p className="text-muted text-sm leading-relaxed">
              When you pay through a Relyvora link, your money is held safely in Anchor-powered banking custody. The seller is not paid until you inspect your package and provide your secret 6-digit release code.
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h4 className="font-semibold text-main text-base">How does Relyvora protect sellers?</h4>
            <p className="text-muted text-sm leading-relaxed">
              You no longer have to risk your inventory or delivery fees on pay-on-delivery. You dispatch only after Relyvora verifies that the buyer&apos;s payment is locked in escrow.
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h4 className="font-semibold text-main text-base">Who pays the 3% protection fee?</h4>
            <p className="text-muted text-sm leading-relaxed">
              The buyer pays the 3% protection fee at checkout. The fee is calculated transparently and shown on the payment screen before any payment is initiated.
            </p>
          </div>

          <div className="p-6 rounded-card border border-border bg-surface space-y-2">
            <h4 className="font-semibold text-main text-base">Where is the money held?</h4>
            <p className="text-muted text-sm leading-relaxed">
              Funds are held in segregated accounts powered by our regulated Banking-as-a-Service partner, Anchor Technologies Limited, in partnership with CBN-licensed financial institutions.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* FINAL CALL TO ACTION */}
      {/* ------------------------------------------------------------- */}
      <section className="max-w-container mx-auto px-6">
        <div className="p-10 sm:p-16 rounded-3xl border border-border bg-surface text-center space-y-6 shadow-sm">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold">
            <span>Social Commerce Protection</span>
          </div>
          <h2 className="text-main max-w-xl mx-auto">
            Ready to trade without the fear?
          </h2>
          <p className="text-muted text-base max-w-lg mx-auto leading-relaxed">
            Join buyers and merchants creating safe, verified transactions on WhatsApp and Instagram across Nigeria.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://ng.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 h-12 rounded-btn font-semibold text-sm bg-main text-site dark:bg-accent dark:text-[#071229] hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <span>Go to Relyvora NG</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
            <Link
              href="/how-it-works"
              className="px-6 h-12 rounded-btn font-semibold text-sm border border-border bg-site text-main hover:border-accent hover:text-accent transition-all flex items-center justify-center"
            >
              Learn how it works
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
