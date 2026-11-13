'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  Store,
  MessageCircle,
  KeyRound,
} from 'lucide-react';
import { isSandboxMode } from '@/lib/paymentsMode';

export default function NigerianMarketPage() {
  const sandbox = isSandboxMode();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-16 space-y-16 sm:space-y-24">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span>{sandbox ? 'Nigeria • Sandbox Mode' : 'Nigeria • Invite-Only Launch'}</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-heading font-bold text-main tracking-tight leading-[1.15]">
          Safe payments for WhatsApp and <br className="hidden sm:inline" />
          <span className="text-accent">Instagram orders in Nigeria.</span>
        </h1>

        <p className="text-base sm:text-lg text-muted max-w-2xl mx-auto leading-relaxed font-sans">
          Your money is held safely until your order arrives at your doorstep. Open the package, check what you bought, and share your six-digit release code with the dispatch rider to pay the seller.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
          <Link
            href="/vendor"
            className="w-full sm:w-auto px-6 py-4 rounded-xl bg-accent hover:opacity-90 text-[#071229] font-bold text-base flex items-center justify-center gap-2 shadow-card transition-all transform active:scale-[0.99]"
          >
            <Store className="w-5 h-5 text-[#071229]" />
            <span>Open Vendor Portal</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>

          <Link
            href="#how-it-works"
            className="w-full sm:w-auto px-6 py-4 rounded-xl bg-surface hover:bg-site border border-border text-main font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <span>See How It Works</span>
          </Link>
        </div>

        {/* Key facts */}
        <div className="pt-6 grid grid-cols-3 gap-2 sm:gap-6 border-t border-border max-w-lg mx-auto text-center">
          <div>
            <div className="text-xl sm:text-2xl font-bold text-main font-heading tabular-nums">3% Fee</div>
            <div className="text-[11px] sm:text-xs text-muted">Minimum ₦500 per order</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-main font-heading tabular-nums">6-Digit Code</div>
            <div className="text-[11px] sm:text-xs text-muted">Shared after inspection</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-accent font-heading tabular-nums">
              {sandbox ? 'Sandbox Mode' : 'Bank Transfer'}
            </div>
            <div className="text-[11px] sm:text-xs text-muted">
              {sandbox ? 'Test environment active' : 'Virtual account per order'}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-main tracking-tight">
            How Relyvora Works
          </h2>
          <p className="text-sm text-muted">
            Three clear steps for buyers and sellers on WhatsApp and Instagram.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-surface p-6 sm:p-7 rounded-card border border-border shadow-xs space-y-4 relative overflow-hidden transition-colors">
            <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-heading tabular-nums font-bold text-xl border border-accent/20">
              1
            </div>
            <h3 className="text-lg font-heading font-semibold text-main">Seller creates a link</h3>
            <p className="text-xs sm:text-sm text-muted leading-relaxed">
              The seller enters the item name, price, and delivery fee in the vendor portal, then shares the checkout link in chat.
            </p>
            <div className="pt-2 text-xs font-semibold text-accent flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              <span>Shareable on WhatsApp &amp; Instagram</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-surface p-6 sm:p-7 rounded-card border border-border shadow-xs space-y-4 relative overflow-hidden transition-colors">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-heading tabular-nums font-bold text-xl border border-blue-500/20">
              2
            </div>
            <h3 className="text-lg font-heading font-semibold text-main">Buyer pays into escrow</h3>
            <p className="text-xs sm:text-sm text-muted leading-relaxed">
              The buyer reviews the order total and transfers the exact amount to the dedicated virtual bank account. Funds stay held while the seller ships.
            </p>
            <div className="pt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <Lock className="w-4 h-4" />
              <span>Funds held until delivery</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-surface p-6 sm:p-7 rounded-card border border-border shadow-xs space-y-4 relative overflow-hidden transition-colors">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-heading tabular-nums font-bold text-xl border border-teal-500/20">
              3
            </div>
            <h3 className="text-lg font-heading font-semibold text-main">Inspect and share code</h3>
            <p className="text-xs sm:text-sm text-muted leading-relaxed">
              Once paid, the buyer receives a six-digit release code. At delivery, the buyer opens the package, checks the items, and gives the code to the rider to release payment.
            </p>
            <div className="pt-2 text-xs font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1">
              <KeyRound className="w-4 h-4" />
              <span>Doorstep verification</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <section className="bg-surface border border-border rounded-card p-8 sm:p-12 text-center space-y-6 relative overflow-hidden shadow-card transition-colors">
        <div className="relative z-10 max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center mx-auto border border-accent/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-main tracking-tight">
            {sandbox ? 'Explore the Relyvora Sandbox' : 'Create or track an escrow order'}
          </h2>
          <p className="text-xs sm:text-sm text-muted">
            {sandbox
              ? 'Walk through the seller link generator, simulated payment flow, and six-digit code release in sandbox mode.'
              : 'Open the vendor portal to create an escrow payment link or check an active order status.'}
          </p>
          <div className="pt-2">
            <Link
              href="/vendor"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent hover:opacity-90 text-[#071229] font-bold text-sm shadow-card transition-all"
            >
              <span>Go to Vendor Portal</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      </section>
    </div>
  );
}
