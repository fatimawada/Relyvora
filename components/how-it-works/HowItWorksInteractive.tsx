'use client';

import React, { useState } from 'react';
import { ShoppingBag, Store } from 'lucide-react';
import { PhoneCodeMock } from './PhoneCodeMock';

const BUYER_STEPS = [
  {
    step: 'Step 1',
    tag: 'Link received',
    title: 'Open the seller’s payment link',
    body: (
      <>
        The seller sends you a Relyvora link in your WhatsApp or Instagram chat. You see the item, the agreed price, and
        the 3% buyer fee before you pay.
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
        When the rider arrives, check your order. Once you are happy with it, share your{' '}
        <span className="nowrap">six-digit</span> code to release the payment to the seller.
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
        Once the buyer checks the order and confirms with their <span className="nowrap">six-digit</span> code, the
        payment is released to your bank account.
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
            <span>I&apos;m buying</span>
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
            <span>I&apos;m selling</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Steps list on left, CSS Phone Mockup on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        <ol className="lg:col-span-7 space-y-4">
          {steps.map((item) => (
            <li key={item.step} className="p-6 rounded-2xl border border-border bg-surface space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-accent">
                <span>{item.step}</span>
                <span className="text-muted">{item.tag}</span>
              </div>
              <h2 className="text-lg font-semibold text-main">{item.title}</h2>
              <p className="text-muted text-sm leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ol>

        <div className="lg:col-span-5 flex justify-center">
          <PhoneCodeMock />
        </div>
      </div>
    </div>
  );
}
