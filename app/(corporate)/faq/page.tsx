import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, HelpCircle } from 'lucide-react';
import { FAQAccordion } from '@/components/faq/FAQAccordion';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions | Relyvora',
  description:
    'Answers to common questions about Relyvora payment protection, escrow custody, fees, release codes, and seller payouts.',
};

export default function FAQPage() {
  return (
    <div className="max-w-container mx-auto px-6 py-16 sm:py-20 space-y-16">
      {/* Header */}
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-xs font-semibold text-accent">
          <span>Knowledge Base</span>
        </div>
        <h1 className="text-main leading-tight">
          Frequently asked questions.
        </h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          Everything you need to know about how Relyvora protects payments between social commerce buyers and sellers.
        </p>
      </div>

      {/* Accordion Component */}
      <FAQAccordion />

      {/* Contact Support Teaser */}
      <div className="p-8 sm:p-12 rounded-3xl border border-border bg-surface text-center space-y-4 max-w-3xl mx-auto">
        <h3 className="text-xl font-semibold text-main">
          Have a question not listed here?
        </h3>
        <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">
          Our support team is here to help with active transactions, dispute guidance, or onboarding questions.
        </p>
        <div className="pt-2">
          <a
            href="mailto:support@relyvora.com"
            className="inline-flex items-center gap-2 px-6 h-12 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-all"
          >
            <span>Email support@relyvora.com</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
