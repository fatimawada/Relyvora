import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Prohibited Items & Activities Policy | Relyvora Technologies',
  description:
    'Items and transactions restricted or prohibited from Relyvora escrow protection in Nigeria.',
};

const PROHIBITED_CATEGORIES = [
  {
    title: '1. Weapons, Firearms, Ammunition & Explosives',
    detail:
      'All firearms, firearm parts, ammunition, explosives, stun guns, pepper sprays regulated under Nigerian law, and bladed items marketed as weapons.',
  },
  {
    title: '2. Controlled Substances, Narcotics & Unregulated Pharmaceuticals',
    detail:
      'Illegal drugs, narcotics, cannabis products, controlled prescription drugs sold without verified NAFDAC/PCN licensing, and counterfeit medical supplies.',
  },
  {
    title: '3. Counterfeit Goods, Pirated Software & Stolen Property',
    detail:
      'Replica luxury items misrepresented as authentic, stolen smartphones/electronics with altered IMEI/serial numbers, pirated media, or unlicensed software keys.',
  },
  {
    title: '4. Financial Instruments, Crypto Speculation & Ponzi / Pyramid Schemes',
    detail:
      'Gift card arbitrage, third-party bank account rentals, BVN/NIN brokering, unregistered investment schemes, binary options, or disguised cash-out transfers.',
  },
  {
    title: '5. Fake Identification, Forged Documents & Academic Fraud',
    detail:
      'Forged CAC certificates, fake commercial receipts, falsified passports/driver licences, exam malpractice materials, or counterfeit government permits.',
  },
  {
    title: '6. Perishable Food Without Agreed Same-Day Inspection Terms',
    detail:
      'Highly perishable prepared meals or live animals where normal 2-to-7 day escrow delivery windows cannot reasonably preserve item condition.',
  },
  {
    title: '7. Adult Content, Escort Services & Harmful / Illegal Materials',
    detail:
      'Explicit adult content, intimate services, human remains/organs, endangered wildlife products, or any transaction unlawful under the Laws of the Federal Republic of Nigeria.',
  },
];

export default function ProhibitedItemsPage() {
  return (
    <div className="bg-site text-main min-h-screen flex flex-col font-sans selection:bg-accent selection:text-white">
      <Header />

      <main className="flex-1 w-full py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-10">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Relyvora Home</span>
            </Link>
          </div>

          <div className="space-y-4 border-b border-border pb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>ACCEPTABLE USE &amp; COMPLIANCE</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-heading font-semibold text-main tracking-tight">
              Prohibited Items &amp; Restricted Activities
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
              <span><strong>Policy Version:</strong> 2026-11-tier1</span>
              <span>•</span>
              <span>Relyvora Technologies Limited (RC 9982218), Abuja, Nigeria</span>
            </div>
          </div>

          <article className="space-y-6 text-sm sm:text-base text-main/90 leading-relaxed">
            <p className="text-muted">
              Vendors creating escrow links and buyers funding orders on Relyvora agree not to use the
              platform for any prohibited or unlawful category listed below. Violating transactions are
              frozen for Trust &amp; Safety review, refunds/holds follow Anchor compliance rules, and vendor
              accounts face immediate compliance strikes and suspension.
            </p>

            <div className="grid grid-cols-1 gap-4">
              {PROHIBITED_CATEGORIES.map((item) => (
                <div
                  key={item.title}
                  className="p-5 rounded-2xl border border-border bg-surface space-y-1.5"
                >
                  <h2 className="text-base sm:text-lg font-heading font-semibold text-main">
                    {item.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>

            <div className="p-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                <span>Supported Social Commerce Categories</span>
              </div>
              <p className="text-xs sm:text-sm text-muted leading-relaxed">
                Phones, laptops, verified gadgets, human hair &amp; beauty products, fashion &amp; footwear,
                appliances, furniture, legitimate spare parts, and standard B2C physical merchandise shipped
                same-city or interstate with verifiable dispatch proof.
              </p>
            </div>

            <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted">
              <span>
                To report a restricted listing or request an NDPA/compliance review:
              </span>
              <a
                href="mailto:support@relyvora.com"
                className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>support@relyvora.com</span>
              </a>
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
