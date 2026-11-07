import React from 'react';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { FAQAccordion } from '@/components/faq/FAQAccordion';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions | Relyvora',
  description:
    'Answers to common questions about Relyvora payment protection, the 3% buyer fee, the six\u2011digit release code, and seller payouts.',
  alternates: { canonical: '/faq' },
};

export default function FAQPage() {
  const faqSchemaData = {
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How does Relyvora protect buyers?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'When you pay through a Relyvora link, your money is held with our banking partner. The seller is not paid until your order arrives, you check it, and you confirm with your six-digit release code.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does Relyvora protect sellers?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You only send out an order after Relyvora confirms the buyer has paid. That means no more dispatching on pay-on-delivery and getting a no-show at the door.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much does Relyvora cost and who pays the fee?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'A flat 3% fee, paid by the buyer and shown on the payment screen before they pay. There are no monthly subscriptions or account opening fees.',
        },
      },
      {
        '@type': 'Question',
        name: 'Where is the money held?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Payments are powered by our regulated Banking-as-a-Service partner, Anchor Technologies Limited, in partnership with CBN-licensed financial institutions.',
        },
      },
    ],
  };

  return (
    <div className="max-w-container mx-auto px-6 pt-16 pb-16 sm:pt-20 sm:pb-20 space-y-12 text-left">
      <JsonLd type="FAQPage" data={faqSchemaData} />

      <div className="max-w-3xl space-y-4">
        <p className="section-label">Questions</p>
        <h1 className="page-h1 text-main">Frequently asked questions.</h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          Clear answers on how Relyvora works for buyers and sellers on WhatsApp and Instagram.
        </p>
      </div>

      <FAQAccordion />

      <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 max-w-3xl">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-main">Still have a question?</h2>
          <p className="text-muted text-sm max-w-md leading-relaxed">
            Reach out to our team if you need help with an order or have a question before getting started.
          </p>
        </div>
        <a
          href="mailto:support@relyvora.com"
          className="inline-flex items-center gap-2 px-6 h-12 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-opacity hover:opacity-90 shrink-0"
        >
          <span>Email support@relyvora.com</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
