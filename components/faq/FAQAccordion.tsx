'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
  isTodo?: boolean;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How does Relyvora protect buyers?',
    answer:
      'When you pay through a Relyvora link, your money is held in regulated Anchor banking custody. The seller is not paid until your package arrives, you physically inspect the items, and you share your secret six-digit release code with the courier or confirm in-app.',
  },
  {
    question: 'How does Relyvora protect sellers?',
    answer:
      'You never have to dispatch goods on pay-on-delivery only for buyers to change their mind or fail to answer their phone. You package and ship only after Relyvora verifies that the buyer’s payment has cleared into escrow.',
  },
  {
    question: 'How much does Relyvora cost and who pays the fee?',
    answer:
      'Relyvora charges a flat 3% transaction protection fee paid by the buyer at checkout. The fee is calculated transparently and shown on the payment screen prior to authorization. There are no account maintenance fees or monthly subscriptions.',
  },
  {
    question: 'Where are escrow funds held?',
    answer:
      'Funds are held in segregated virtual accounts powered by our regulated Banking-as-a-Service partner, Anchor Technologies Limited, in partnership with CBN-licensed financial institutions.',
  },
  {
    question: 'What happens if a buyer refuses or rejects a delivery?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team — Doorstep rejection protocol & return shipping allocation]',
    isTodo: true,
  },
  {
    question: 'What happens if a buyer loses their 6-digit release code?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team — Code reissuance and authentication protocol]',
    isTodo: true,
  },
  {
    question: 'What are the dispute timelines and resolution SLAs?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team — Official dispute resolution timeline and investigation SLA]',
    isTodo: true,
  },
  {
    question: 'Which payment methods are supported in Nigeria?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team — Confirmed payment methods (Bank Transfer, NIP Virtual Accounts, Cards, USSD)]',
    isTodo: true,
  },
  {
    question: 'How quickly does the seller receive payout once the code is entered?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team — Exact payout settlement turnaround time]',
    isTodo: true,
  },
  {
    question: 'Which countries is Relyvora available in?',
    answer:
      'Relyvora is launching in Nigeria. Expansion into Ghana, Kenya, and South Africa is scheduled on our roadmap, with early access waitlists currently open.',
  },
];

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-3.5 max-w-3xl mx-auto">
      {FAQ_ITEMS.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={item.question}
            className="rounded-2xl border border-border bg-surface overflow-hidden transition-colors"
          >
            <button
              onClick={() => toggle(index)}
              type="button"
              className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 font-semibold text-main text-base sm:text-[17px] hover:text-accent transition-colors"
              aria-expanded={isOpen}
            >
              <span>{item.question}</span>
              <ChevronDown
                className={`w-5 h-5 text-muted shrink-0 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-accent' : ''
                }`}
              />
            </button>

            {isOpen && (
              <div className="px-5 sm:px-6 pb-6 text-sm sm:text-base text-muted leading-relaxed border-t border-border/60 pt-4">
                {item.isTodo ? (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-mono">
                    {item.answer}
                  </div>
                ) : (
                  <p>{item.answer}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
