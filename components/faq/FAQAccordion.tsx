'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowUpRight } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: React.ReactNode;
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
      'The seller is paid when the buyer checks the order and confirms with their six\u2011digit code. If there is a dispute, the money stays frozen while Relyvora Support reviews it. In some cases set out in the dispute policy, Relyvora can refund or release without the code.',
  },
  {
    question: 'How much does Relyvora cost and who pays the fee?',
    answer:
      'The buyer pays 3% of what they pay into escrow, with a minimum fee of ₦500. The fee is shown before they pay. There are no other Relyvora fees and no subscriptions.',
  },
  {
    question: 'Are there any other charges?',
    answer:
      'Relyvora charges only the 3% fee (minimum ₦500) to the buyer. Delivery is a separate cost agreed between buyer and seller.',
  },
  {
    question: 'Where is the money held?',
    answer:
      'Payments are powered by our regulated Banking\u2011as\u2011a\u2011Service partner, Anchor Technologies Limited, in partnership with CBN\u2011licensed financial institutions.',
  },
  {
    question: 'What happens if an order goes wrong or there is a dispute?',
    answer: (
      <div className="space-y-3">
        <p>
          If an order does not match what was agreed, arrives damaged, or goes wrong in another way, the buyer raises a
          dispute from their transaction page before sharing the code, or emails{' '}
          <a href="mailto:support@relyvora.com" className="text-accent underline">
            support@relyvora.com
          </a>{' '}
          with the transaction reference. The money stays frozen while Relyvora Support reviews it.
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted">
          <li><strong>Wrong or damaged item:</strong> Full refund after the item is returned to the seller.</li>
          <li><strong>Lost in transit:</strong> Full refund to the buyer.</li>
          <li><strong>Buyer unreachable or refuses delivery:</strong> Refund less the delivery fee, with the delivery fee paid to the seller.</li>
          <li><strong>Seller does not deliver:</strong> Seller has 6 hours to provide valid proof, otherwise a full refund is issued.</li>
        </ul>
        <p className="pt-1">
          <Link
            href="/disputes"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
          >
            <span>Read the full dispute policy</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>
    ),
  },
  {
    question: 'What happens if a buyer loses their six\u2011digit release code?',
    answer:
      'Buyers can look up their code directly on their active order status page, or email support@relyvora.com with their transaction reference for immediate assistance.',
  },
  {
    question: 'Which payment methods are supported in Nigeria?',
    answer:
      'Payments are made via instant bank transfer and dedicated virtual accounts powered by Anchor.',
  },
  {
    question: 'How quickly does the seller receive their payout after the code is confirmed?',
    answer:
      'Once the buyer enters their six-digit delivery code, the payout is triggered automatically through our banking partner to the seller\'s commercial bank account.',
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
    <div className="space-y-4 max-w-3xl">
      {FAQ_ITEMS.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={item.question}
            className="rounded-2xl border border-border bg-surface overflow-hidden transition-colors"
          >
            <button
              type="button"
              onClick={() => toggle(index)}
              aria-expanded={isOpen}
              className="w-full p-6 text-left flex items-center justify-between gap-4 font-semibold text-main hover:text-accent transition-colors"
            >
              <span className="text-base sm:text-lg">{item.question}</span>
              <ChevronDown
                className={`w-5 h-5 shrink-0 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-accent' : 'text-muted'
                }`}
                aria-hidden="true"
              />
            </button>
            {isOpen && (
              <div className="px-6 pb-6 pt-1 text-sm text-muted leading-relaxed border-t border-border/50">
                {item.isTodo ? (
                  <p className="text-amber-800 dark:text-amber-300 font-medium">{item.answer}</p>
                ) : (
                  <div>{item.answer}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
