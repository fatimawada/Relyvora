'use client';

import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck, ShoppingBag, Store } from 'lucide-react';

const BUYER_STEPS = [
  {
    step: 'Step 1',
    tag: 'Get the link',
    title: 'Agree on your order in the chat',
    body: (
      <>
        Agree on the item, price, and delivery in your WhatsApp or Instagram DMs. The seller sends you a secure Relyvora
        link.
      </>
    ),
  },
  {
    step: 'Step 2',
    tag: 'Money held',
    title: 'Pay through Relyvora',
    body: (
      <>
        Your money is held with our banking partner, not sent to the seller yet. You receive a secret{' '}
        <span className="nowrap">six-digit</span> release code.
      </>
    ),
  },
  {
    step: 'Step 3',
    tag: 'Order on the way',
    title: 'Wait for your delivery',
    body: (
      <>
        Knowing the payment is held, the seller packs and sends your order to your address.
      </>
    ),
  },
  {
    step: 'Step 4',
    tag: 'Confirm at the door',
    title: 'Check your order and confirm with your code',
    body: (
      <>
        The seller is paid when the buyer checks the order and confirms with their six-digit code. If there is a dispute,
        the money stays frozen while Relyvora Support reviews it. In some cases set out in the dispute policy, Relyvora can
        refund or release without the code.
      </>
    ),
  },
];

const SELLER_STEPS = [
  {
    step: 'Step 1',
    tag: 'Create link',
    title: 'Create a payment link',
    body: (
      <>
        Enter the item name and agreed price in your Relyvora dashboard, then share the link in your customer’s WhatsApp
        or Instagram chat.
      </>
    ),
  },
  {
    step: 'Step 2',
    tag: 'Payment confirmed',
    title: 'See that the buyer has paid',
    body: (
      <>
        Relyvora confirms when the buyer’s payment is held with our banking partner, ending the guesswork over transfer
        screenshots or fake SMS alerts.
      </>
    ),
  },
  {
    step: 'Step 3',
    tag: 'Send the order',
    title: 'Ship knowing the money is waiting',
    body: (
      <>
        Send your rider knowing the buyer has already paid, avoiding <span className="nowrap">pay-on-delivery</span>{' '}
        <span className="nowrap">no-shows</span> at the door.
      </>
    ),
  },
  {
    step: 'Step 4',
    tag: 'Payment released',
    title: 'Get paid when the code is confirmed',
    body: (
      <>
        The seller is paid when the buyer checks the order and confirms with their six-digit code. If there is a dispute,
        the money stays frozen while Relyvora Support reviews it. In some cases set out in the dispute policy, Relyvora can
        refund or release without the code.
      </>
    ),
  },
];

export function HowItWorksInteractive() {
  const [activeTab, setActiveTab] = useState<'buyer' | 'seller'>('buyer');
  const steps = activeTab === 'buyer' ? BUYER_STEPS : SELLER_STEPS;

  return (
    <div className="space-y-12">
      {/* Tab Switcher */}
      <div className="flex justify-start">
        <div
          role="tablist"
          aria-label="Perspective"
          className="p-1.5 rounded-full border border-border bg-surface inline-flex items-center gap-1"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'buyer'}
            onClick={() => setActiveTab('buyer')}
            type="button"
            className={`px-5 h-10 rounded-full text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
              activeTab === 'buyer'
                ? 'bg-main text-site dark:bg-accent dark:text-[#071229]'
                : 'text-muted hover:text-main'
            }`}
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            <span>I&apos;m a buyer</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'seller'}
            onClick={() => setActiveTab('seller')}
            type="button"
            className={`px-5 h-10 rounded-full text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
              activeTab === 'seller'
                ? 'bg-main text-site dark:bg-accent dark:text-[#071229]'
                : 'text-muted hover:text-main'
            }`}
          >
            <Store className="w-4 h-4" aria-hidden="true" />
            <span>I&apos;m a seller</span>
          </button>
        </div>
      </div>

      {/* 4 Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {steps.map((item, index) => (
          <div
            key={item.title}
            className="p-7 sm:p-8 rounded-3xl border border-border bg-surface space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/10 text-accent">
                  {item.step}
                </span>
                <span className="text-xs text-muted font-medium">{item.tag}</span>
              </div>
              <h3 className="text-xl font-semibold text-main">{item.title}</h3>
              <p className="text-muted text-[15px] leading-relaxed">{item.body}</p>
            </div>
            <div className="pt-4 border-t border-border/60 flex items-center gap-2 text-xs text-muted">
              <ShieldCheck className="w-4 h-4 text-accent" aria-hidden="true" />
              <span>Step {index + 1} of 4</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
