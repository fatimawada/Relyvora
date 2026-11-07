'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
  isTodo?: boolean;
}

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How does Relyvora protect buyers?',
    answer:
      'When you pay through a Relyvora link, your money is held with our banking partner. The seller is not paid until your order arrives, you check it, and you confirm with your six\u2011digit release code.',
  },
  {
    question: 'How does Relyvora protect sellers?',
    answer:
      'You only send out an order after Relyvora confirms the buyer has paid. That means no more dispatching on pay\u2011on\u2011delivery and getting a no\u2011show at the door.',
  },
  {
    question: 'How much does Relyvora cost and who pays the fee?',
    answer:
      'A flat 3% fee, paid by the buyer and shown on the payment screen before they pay. There are no monthly subscriptions or account opening fees.',
  },
  {
    question: 'Where is the money held?',
    answer:
      'Payments are powered by our regulated Banking\u2011as\u2011a\u2011Service partner, Anchor Technologies Limited, in partnership with CBN\u2011licensed financial institutions.',
  },
  {
    question: 'What happens if a buyer refuses or rejects a delivery?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team: Doorstep rejection protocol and return shipping allocation]',
    isTodo: true,
  },
  {
    question: 'What happens if a buyer loses their six\u2011digit release code?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team: Code reissuance and authentication protocol]',
    isTodo: true,
  },
  {
    question: 'What are the dispute timelines?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team: Official dispute resolution timeline and investigation SLA]',
    isTodo: true,
  },
  {
    question: 'Which payment methods are supported in Nigeria?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team: Confirmed payment methods (Bank Transfer, NIP Virtual Accounts, Cards, USSD)]',
    isTodo: true,
  },
  {
    question: 'How quickly does the seller receive their payout after the code is confirmed?',
    answer:
      '[TODO: Policy pending confirmation from Relyvora team: Exact payout settlement turnaround time]',
    isTodo: true,
  },
  {
    question: 'Which countries is Relyvora available in?',
    answer:
      'Relyvora is launching in Nigeria first. Ghana, Kenya, and South Africa are coming soon.',
  },
];

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-3.5 max-w-3xl">
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
                aria-hidden="true"
              />
            </button>

            {isOpen && (
              <div className="px-5 sm:px-6 pb-6 text-sm sm:text-base text-muted leading-relaxed border-t border-border/60 pt-4">
                {item.isTodo ? (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-medium">
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
