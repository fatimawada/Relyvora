'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ShoppingBag, 
  Store, 
  ShieldCheck, 
  KeyRound, 
  CheckCircle2, 
  ArrowRight, 
  Lock, 
  Package, 
  Zap 
} from 'lucide-react';

export function HowItWorksInteractive() {
  const [activeTab, setActiveTab] = useState<'buyer' | 'seller'>('buyer');

  return (
    <div className="space-y-16">
      {/* Tab Switcher */}
      <div className="flex justify-center">
        <div className="p-1.5 rounded-full border border-border bg-surface flex items-center gap-1 shadow-2xs">
          <button
            onClick={() => setActiveTab('buyer')}
            type="button"
            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'buyer'
                ? 'bg-main text-site dark:bg-accent dark:text-[#071229] shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>I&apos;m a Buyer</span>
          </button>
          <button
            onClick={() => setActiveTab('seller')}
            type="button"
            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'seller'
                ? 'bg-main text-site dark:bg-accent dark:text-[#071229] shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>I&apos;m a Seller</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Steps list on left, CSS Phone Mockup on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: 4 Detailed Steps */}
        <div className="lg:col-span-7 space-y-6">
          {activeTab === 'buyer' ? (
            <div className="space-y-6">
              {/* Step 1 */}
              <div className="p-6 rounded-2xl border border-border bg-surface space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-accent">
                  <span>STEP 01</span>
                  <span>LINK RECEIVED</span>
                </div>
                <h3 className="text-lg font-semibold text-main">Receive your verified payment link</h3>
                <p className="text-muted text-sm leading-relaxed">
                  The seller sends you a Relyvora link in WhatsApp or Instagram DM. You can view the exact product name, agreed price, delivery address, and the transparent 3% protection fee before paying.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-6 rounded-2xl border border-border bg-surface space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-accent">
                  <span>STEP 02</span>
                  <span>PAYMENT PROTECTED</span>
                </div>
                <h3 className="text-lg font-semibold text-main">Pay into regulated escrow custody</h3>
                <p className="text-muted text-sm leading-relaxed">
                  Make your payment securely through Anchor banking rails. Your money is held in custody—not released to the seller yet. You immediately receive a unique, secret six-digit confirmation code.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-6 rounded-2xl border border-border bg-surface space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-accent">
                  <span>STEP 03</span>
                  <span>ORDER DISPATCHED</span>
                </div>
                <h3 className="text-lg font-semibold text-main">Wait comfortably for your delivery</h3>
                <p className="text-muted text-sm leading-relaxed">
                  The seller dispatches your goods. You don&apos;t have to worry about fake delivery alerts or paying on delivery with cash. Your order is safely on its way.
                </p>
              </div>

              {/* Step 4 */}
              <div className="p-6 rounded-2xl border border-border bg-surface space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-accent">
                  <span>STEP 04</span>
                  <span>DOORSTEP CODE HANDSHAKE</span>
                </div>
                <h3 className="text-lg font-semibold text-main">Inspect package and share code</h3>
                <p className="text-muted text-sm leading-relaxed">
                  When the rider arrives, open and inspect your goods. Once satisfied, share your six-digit release code with the rider or confirm on your phone to release payment to the seller.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Step 1 Seller */}
              <div className="p-6 rounded-2xl border border-border bg-surface space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-accent">
                  <span>STEP 01</span>
                  <span>GENERATE LINK</span>
                </div>
                <h3 className="text-lg font-semibold text-main">Generate an escrow payment link</h3>
                <p className="text-muted text-sm leading-relaxed">
                  Enter the agreed item name, price, and customer phone number in your Relyvora vendor dashboard. Generate a link and drop it straight into your customer&apos;s DM.
                </p>
              </div>

              {/* Step 2 Seller */}
              <div className="p-6 rounded-2xl border border-border bg-surface space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-accent">
                  <span>STEP 02</span>
                  <span>FUNDS CONFIRMED</span>
                </div>
                <h3 className="text-lg font-semibold text-main">Receive verified payment confirmation</h3>
                <p className="text-muted text-sm leading-relaxed">
                  Relyvora verifies that the buyer&apos;s money has settled in Anchor escrow custody. No more falling victim to photoshopped bank transfer screenshots or fake SMS alerts.
                </p>
              </div>

              {/* Step 3 Seller */}
              <div className="p-6 rounded-2xl border border-border bg-surface space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-accent">
                  <span>STEP 03</span>
                  <span>DISPATCH SAFELY</span>
                </div>
                <h3 className="text-lg font-semibold text-main">Dispatch with full peace of mind</h3>
                <p className="text-muted text-sm leading-relaxed">
                  Send your delivery rider with confidence. You know the buyer has committed their payment, eliminating the risk of pay-on-delivery ghosting or cancelled orders at the door.
                </p>
              </div>

              {/* Step 4 Seller */}
              <div className="p-6 rounded-2xl border border-border bg-surface space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-accent">
                  <span>STEP 04</span>
                  <span>AUTOMATED SETTLEMENT</span>
                </div>
                <h3 className="text-lg font-semibold text-main">Receive payout to your bank</h3>
                <p className="text-muted text-sm leading-relaxed">
                  The moment the buyer inspects the package and shares the six-digit code, the escrow releases funds directly into your linked Nigerian commercial bank account.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: CSS-Only Phone Mockup */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="relative w-full max-w-[320px] rounded-[40px] border-[6px] border-[#0A1B3D] dark:border-[#1B315E] bg-surface p-4 shadow-2xl">
            {/* Phone Speaker Notch */}
            <div className="w-24 h-4 bg-[#0A1B3D] dark:bg-[#1B315E] rounded-b-xl mx-auto mb-4" />

            {/* In-App Screen Content */}
            <div className="space-y-4 font-sans text-left">
              {/* Status Header */}
              <div className="flex items-center justify-between text-[11px] font-mono text-muted border-b border-border pb-2">
                <span>Relyvora Escrow</span>
                <span className="text-accent font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  Locked Safe
                </span>
              </div>

              {/* Transaction Card */}
              <div className="p-3.5 rounded-xl bg-site border border-border space-y-2">
                <div className="text-[11px] text-muted">Order RV-4821</div>
                <div className="text-sm font-bold text-main">Human Hair Wig (30&quot;)</div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
                  <span className="text-muted">Total Paid</span>
                  <span className="font-semibold text-main">₦87,550</span>
                </div>
              </div>

              {/* The Six-Digit Code Feature Card */}
              <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-center space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-accent">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Doorstep Release Code</span>
                </div>
                <div className="py-2 px-3 rounded-lg bg-surface border border-accent/30 font-mono text-2xl font-bold tracking-widest text-main shadow-2xs">
                  842 - 195
                </div>
                <p className="text-[11px] text-muted leading-tight">
                  Only share this code with the delivery rider after inspecting your goods.
                </p>
              </div>

              {/* Delivery Courier Check */}
              <div className="p-3 rounded-xl bg-surface border border-border flex items-center gap-2.5 text-xs text-muted">
                <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
                <span>Rider verifies code in their app before handover</span>
              </div>
            </div>

            {/* Phone Home Bar */}
            <div className="w-28 h-1 bg-border rounded-full mx-auto mt-6" />
          </div>
        </div>
      </div>
    </div>
  );
}
