'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: 'How does the 6-digit release code work?',
    answer:
      'When a buyer pays for an order through a Relyvora escrow link, the money is safely locked in escrow and a private 6-digit release code is generated exclusively for the buyer. When the package is delivered, the buyer unboxes and inspects the item to confirm quality and specifications. Once satisfied, the buyer shares the 6-digit code with the dispatch rider or vendor. Entering the code immediately releases the payout directly to the vendor\'s bank account.',
  },
  {
    question: 'What happens if an item is rejected or incorrect?',
    answer:
      'If the item arrives damaged, is the wrong size or model, or does not match what was agreed, the buyer does not share the 6-digit code. Instead, they tap "Freeze / Report Issue" directly on their transaction tracker. Payout is immediately frozen, preventing the vendor from claiming funds. Our dispute resolution workflow then coordinates a verified replacement or returns 100% of the funds back to the buyer.',
  },
  {
    question: 'How does Relyvora make money?',
    answer:
      'Relyvora charges a simple, transparent 3% transaction protection fee (minimum ₦500) per successful order. There are no monthly subscription fees, onboarding costs, or surprise charges. If an order is canceled before delivery or disputed with cause, no protection fee is pocketed. We only earn when commerce happens safely.',
  },
  {
    question: 'Do buyers or vendors need to download a mobile app?',
    answer:
      'No app download is needed. Relyvora is built mobile-first to live natively inside social commerce chats. Vendors generate shareable escrow links in seconds on the web, and customers open them directly in WhatsApp, Instagram DMs, TikTok, or their mobile browser to pay, track delivery, and release funds.',
  },
];

export function CorporateFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-[#FAF8F5]">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-[#64748B]">
            <HelpCircle className="w-3.5 h-3.5 text-[#047857]" />
            <span>Frequently Asked Questions</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
            Everything you need to know about Relyvora
          </h2>
          <p className="text-base text-[#475569] leading-relaxed">
            Clear answers on our escrow architecture, doorstep inspection safeguards, release keys, and pricing.
          </p>
        </div>

        <div className="space-y-3.5">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={faq.question}
                className="rounded-xl border border-[#E7E4DC] bg-white transition-all overflow-hidden shadow-2xs hover:border-[#CBD5E1]"
              >
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  className="w-full text-left px-5 sm:px-6 py-5 flex items-center justify-between gap-4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#047857]"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm sm:text-base font-bold text-[#090E1A] tracking-tight">
                    {faq.question}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen
                        ? 'bg-[#E8F5E9] text-[#047857] rotate-180'
                        : 'bg-[#F1F5F9] text-[#64748B]'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-5 pt-1 text-xs sm:text-sm text-[#475569] leading-relaxed border-t border-[#F1F5F9] animate-in fade-in duration-150">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Still have questions note */}
        <div className="p-6 rounded-xl bg-white border border-[#E7E4DC] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-[#090E1A]">Have another question?</h4>
            <p className="text-xs text-[#64748B] pt-0.5">
              Our merchant team is available to help sellers, dispatch riders, and partners.
            </p>
          </div>
          <a
            href="mailto:partnerships@relyvora.com"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#FAF8F5] text-[#090E1A] border border-[#E7E4DC] hover:bg-[#F3EFEA] transition-colors shrink-0"
          >
            <span>Contact Partnerships</span>
          </a>
        </div>
      </div>
    </section>
  );
}
