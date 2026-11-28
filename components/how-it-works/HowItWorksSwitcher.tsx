'use client';

import React, { useId, useRef, useState } from 'react';
import {
  CheckCircle2,
  CornerDownRight,
  KeyRound,
  Lock,
  MessageCircle,
  Truck,
} from 'lucide-react';
import { FEE_CONFIG, calculateFee } from '@/lib/feeConfig';

export const SAMPLE_STORE_NAME = '@gadgetstore';
export const SAMPLE_ITEM_NAME = 'Wireless Headphone';
export const SAMPLE_ORDER_LABEL = 'Order';
export const SAMPLE_ITEM_PRICE_NGN = 45000;

export interface HowItWorksTabDefinition {
  id: 'link-created' | 'money-held' | 'order-dispatched' | 'code-confirmed';
  tabLabel: string;
  stepTitle: string;
  stepSummary: string;
  statusPillText: string;
}

export const HOW_IT_WORKS_TABS: readonly HowItWorksTabDefinition[] = [
  {
    id: 'link-created',
    tabLabel: '1. Link created',
    stepTitle: 'Seller creates a link and shares it in chat',
    stepSummary:
      'The seller enters the item and agreed price, then shares the Relyvora payment link in WhatsApp or Instagram.',
    statusPillText: 'WhatsApp message',
  },
  {
    id: 'money-held',
    tabLabel: '2. Money held',
    stepTitle: 'Buyer pays and money is held safely',
    stepSummary:
      'The buyer reviews the order summary and pays. The money is held with our banking partner, not sent to the seller yet.',
    statusPillText: 'Money held with our banking partner',
  },
  {
    id: 'order-dispatched',
    tabLabel: '3. Order dispatched',
    stepTitle: 'Seller dispatches the order to the buyer',
    stepSummary:
      'Seeing that payment is held, the seller packs and dispatches the order. The buyer inspects before handing over their code.',
    statusPillText: 'Order dispatched',
  },
  {
    id: 'code-confirmed',
    tabLabel: '4. Code confirmed and paid',
    stepTitle: 'Buyer hands the code to the rider and seller is paid',
    stepSummary:
      'After checking the package at the door, the buyer gives their release code to the rider and the money is paid to the seller.',
    statusPillText: 'Code given to rider. Seller paid.',
  },
] as const;

export function HowItWorksSwitcher() {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const instanceId = useId();

  // Dynamically computed from FEE_CONFIG (not hard-coded):
  // item ₦45,000, fee ₦1,350 (3%), total ₦46,350
  const feeBreakdown = calculateFee(SAMPLE_ITEM_PRICE_NGN, 0);
  const feePercentageLabel = `${Math.round(FEE_CONFIG.RATE * 100)}%`;

  // Approved payment_link_v1 wording with Sample Store, Sample item, and ₦45,000
  const approvedWhatsappMessage = `Hello. ${SAMPLE_STORE_NAME} has created a payment link on Relyvora for ${SAMPLE_ITEM_NAME} (${feeBreakdown.formattedItemPrice}). Your payment is securely held until your order is delivered. Tap Continue to open your payment page.`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = HOW_IT_WORKS_TABS.length;
    let nextIndex: number | null = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % count;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + count) % count;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = count - 1;
    }

    if (nextIndex !== null) {
      setSelectedIndex(nextIndex);
      tabRefs.current[nextIndex]?.focus();
      tabRefs.current[nextIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  };

  const handleSelectTab = (index: number) => {
    setSelectedIndex(index);
    tabRefs.current[index]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  };

  return (
    <div
      className="w-full"
      data-testid="how-it-works-switcher"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left Column: Tablist (scrollable horizontal row on 390px mobile, stacked/grid on desktop) + Active Step Detail */}
        <div className="lg:col-span-7 min-w-0 space-y-6">
          {/* Tablist: horizontal scrollable row at 390px with zero page-level horizontal scroll */}
          <div
            role="tablist"
            aria-label="How Relyvora works step by step"
            className="flex lg:grid lg:grid-cols-2 gap-2.5 overflow-x-auto pb-2 lg:pb-0 -mx-1 px-1 scrollbar-none"
          >
            {HOW_IT_WORKS_TABS.map((tab, index) => {
              const isSelected = selectedIndex === index;
              const tabId = `${instanceId}-tab-${tab.id}`;
              const panelId = `${instanceId}-panel-${tab.id}`;

              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  id={tabId}
                  role="tab"
                  type="button"
                  aria-selected={isSelected}
                  aria-controls={panelId}
                  tabIndex={isSelected ? 0 : -1}
                  data-testid={`hiw-tab-${index + 1}`}
                  onClick={() => handleSelectTab(index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className={`shrink-0 lg:shrink text-left px-4 py-3.5 rounded-2xl border text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isSelected
                      ? 'bg-main text-site dark:bg-accent dark:text-[#071229] border-main dark:border-accent shadow-xs'
                      : 'bg-site text-main border-border hover:border-accent/60 hover:text-accent'
                  }`}
                >
                  <span className="block whitespace-nowrap">{tab.tabLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Step description cards for the selected tab */}
          <div className="p-6 sm:p-7 rounded-2xl border border-border bg-site space-y-3 text-left">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
              <span>{HOW_IT_WORKS_TABS[selectedIndex].tabLabel}</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-heading font-semibold text-main">
              {HOW_IT_WORKS_TABS[selectedIndex].stepTitle}
            </h3>
            <p className="text-sm sm:text-base text-muted leading-relaxed">
              {HOW_IT_WORKS_TABS[selectedIndex].stepSummary}
            </p>

            {/* Sample Order Summary Strip */}
            <div className="pt-4 mt-4 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                {SAMPLE_ORDER_LABEL}: <strong className="text-main">{SAMPLE_ITEM_NAME}</strong> from{' '}
                <strong className="text-main">{SAMPLE_STORE_NAME}</strong>
              </span>
              <span className="font-semibold text-accent">
                {feeBreakdown.formattedItemPrice} + {feeBreakdown.formattedFeeAmount} ({feePercentageLabel} fee) ={' '}
                {feeBreakdown.formattedTotalAmount}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Phone Mockup Panels (stacks below tabs on mobile) */}
        <div className="lg:col-span-5 min-w-0 flex justify-center w-full">
          {HOW_IT_WORKS_TABS.map((tab, index) => {
            const isSelected = selectedIndex === index;
            const tabId = `${instanceId}-tab-${tab.id}`;
            const panelId = `${instanceId}-panel-${tab.id}`;

            return (
              <div
                key={tab.id}
                id={panelId}
                role="tabpanel"
                aria-labelledby={tabId}
                hidden={!isSelected}
                data-testid={`hiw-panel-${index + 1}`}
                className={isSelected ? 'w-full max-w-[330px] mx-auto' : 'hidden'}
              >
                <div className="relative w-full rounded-[36px] border-[6px] border-[#0A1B3D] dark:border-[#1B315E] bg-surface p-4 shadow-card text-left">
                  {/* Phone top speaker notch */}
                  <div
                    className="w-24 h-3.5 bg-[#0A1B3D] dark:bg-[#1B315E] rounded-b-xl mx-auto mb-3.5"
                    aria-hidden="true"
                  />

                  {/* Phone header bar */}
                  <div className="flex items-center justify-between text-[11px] text-muted border-b border-border pb-2.5 mb-3.5">
                    <span className="font-semibold text-main">Relyvora</span>
                    <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
                      {SAMPLE_ORDER_LABEL}
                    </span>
                  </div>

                  {/* ======================================================= */}
                  {/* TAB 1: 1. Link created                                  */}
                  {/* Approved payment_link_v1 wording + Continue / Not my order */}
                  {/* ======================================================= */}
                  {tab.id === 'link-created' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
                          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>WhatsApp message</span>
                        </span>
                        <span className="text-[11px] text-muted">{SAMPLE_STORE_NAME}</span>
                      </div>

                      <div className="rounded-2xl bg-site border border-border p-3.5 space-y-2.5">
                        <p className="text-xs leading-relaxed text-main">
                          {approvedWhatsappMessage}
                        </p>
                        <div className="pt-2 border-t border-border text-[11px] text-muted">
                          Secured by Relyvora
                        </div>
                      </div>

                      <div className="space-y-1.5" role="group" aria-label="Example message buttons">
                        <div className="w-full py-2.5 px-3 rounded-xl bg-accent/10 border border-accent/30 text-accent font-semibold text-xs flex items-center justify-center gap-1.5">
                          <CornerDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Continue</span>
                        </div>
                        <div className="w-full py-2.5 px-3 rounded-xl bg-site border border-border text-muted font-semibold text-xs flex items-center justify-center gap-1.5">
                          <CornerDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Not my order</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-site border border-border space-y-1 text-xs">
                        <div className="flex justify-between text-muted">
                          <span>Seller</span>
                          <span className="font-semibold text-main">{SAMPLE_STORE_NAME}</span>
                        </div>
                        <div className="flex justify-between text-muted">
                          <span>Item</span>
                          <span className="font-semibold text-main">{SAMPLE_ITEM_NAME}</span>
                        </div>
                        <div className="flex justify-between text-muted">
                          <span>Relyvora fee ({feePercentageLabel})</span>
                          <span className="font-semibold text-accent">{feeBreakdown.formattedFeeAmount}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-border font-semibold text-main">
                          <span>Total</span>
                          <span>{feeBreakdown.formattedTotalAmount}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ======================================================= */}
                  {/* TAB 2: 2. Money held                                    */}
                  {/* Order summary + pill "Money held with our banking partner". No code yet. */}
                  {/* ======================================================= */}
                  {tab.id === 'money-held' && (
                    <div className="space-y-3.5">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/15 text-accent text-xs font-semibold">
                        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Money held with our banking partner</span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-site border border-border space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span>{SAMPLE_ORDER_LABEL}</span>
                          <span className="font-semibold text-main">{SAMPLE_STORE_NAME}</span>
                        </div>
                        <div className="text-sm font-semibold text-main">{SAMPLE_ITEM_NAME}</div>

                        <div className="space-y-1.5 text-xs pt-2 border-t border-border">
                          <div className="flex items-center justify-between text-muted">
                            <span>Item price</span>
                            <span className="font-semibold text-main">
                              {feeBreakdown.formattedItemPrice}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-muted">
                            <span>Relyvora fee ({feePercentageLabel})</span>
                            <span className="font-semibold text-accent">
                              {feeBreakdown.formattedFeeAmount}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1.5 border-t border-border text-main font-semibold">
                            <span>Total paid</span>
                            <span>{feeBreakdown.formattedTotalAmount}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-site border border-border text-xs text-muted leading-relaxed">
                        Payment is confirmed and held safely while <strong className="text-main">{SAMPLE_STORE_NAME}</strong> prepares your order for dispatch.
                      </div>
                    </div>
                  )}

                  {/* ======================================================= */}
                  {/* TAB 3: 3. Order dispatched                              */}
                  {/* Status "Order dispatched" with "Inspect before handing over your code" */}
                  {/* ======================================================= */}
                  {tab.id === 'order-dispatched' && (
                    <div className="space-y-3.5">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/15 text-accent text-xs font-semibold">
                        <Truck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Order dispatched</span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-site border border-border space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span>{SAMPLE_ORDER_LABEL}</span>
                          <span className="font-semibold text-main">{SAMPLE_STORE_NAME}</span>
                        </div>
                        <div className="text-sm font-semibold text-main">{SAMPLE_ITEM_NAME}</div>
                        <div className="space-y-1 text-xs pt-2 border-t border-border">
                          <div className="flex items-center justify-between text-muted">
                            <span>Item price</span>
                            <span className="font-semibold text-main">{feeBreakdown.formattedItemPrice}</span>
                          </div>
                          <div className="flex items-center justify-between text-muted">
                            <span>Relyvora fee ({feePercentageLabel})</span>
                            <span className="font-semibold text-accent">{feeBreakdown.formattedFeeAmount}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border font-semibold text-main">
                            <span>Total held</span>
                            <span>{feeBreakdown.formattedTotalAmount}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/25 space-y-1.5">
                        <div className="text-xs font-semibold text-accent">
                          Inspect before handing over your code
                        </div>
                        <p className="text-[11px] text-muted leading-relaxed">
                          Check your order at the door first. Only give your release code to the rider when you are satisfied.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ======================================================= */}
                  {/* TAB 4: 4. Code confirmed and paid                       */}
                  {/* "Code given to rider. Seller paid." + 6 empty boxes labelled "Code shown to buyer only" */}
                  {/* ======================================================= */}
                  {tab.id === 'code-confirmed' && (
                    <div className="space-y-3.5">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/15 text-accent text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Code given to rider. Seller paid.</span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-site border border-border space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span>{SAMPLE_ORDER_LABEL}</span>
                          <span className="font-semibold text-main">{SAMPLE_STORE_NAME}</span>
                        </div>
                        <div className="text-sm font-semibold text-main">{SAMPLE_ITEM_NAME}</div>
                        <div className="space-y-1 text-xs pt-2 border-t border-border">
                          <div className="flex items-center justify-between text-muted">
                            <span>Seller payout ({SAMPLE_ITEM_NAME})</span>
                            <span className="font-semibold text-main">{feeBreakdown.formattedItemPrice}</span>
                          </div>
                          <div className="flex items-center justify-between text-muted">
                            <span>Relyvora fee ({feePercentageLabel})</span>
                            <span className="font-semibold text-accent">{feeBreakdown.formattedFeeAmount}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border font-semibold text-main">
                            <span>Total released</span>
                            <span>{feeBreakdown.formattedTotalAmount}</span>
                          </div>
                        </div>
                      </div>

                      {/* Six empty boxes labelled "Code shown to buyer only" — zero digits */}
                      <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/25 text-center space-y-2.5">
                        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-accent">
                          <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Code shown to buyer only</span>
                        </div>

                        <div
                          className="grid grid-cols-6 gap-1.5 max-w-[220px] mx-auto"
                          aria-label="Six empty release code boxes"
                        >
                          {Array.from({ length: 6 }).map((_, boxIdx) => (
                            <span
                              key={boxIdx}
                              data-testid={`empty-code-box-${boxIdx + 1}`}
                              className="h-9 rounded-lg bg-surface border border-accent/40 block"
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Phone bottom home indicator bar */}
                  <div
                    className="w-24 h-1 bg-border rounded-full mx-auto mt-5"
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
