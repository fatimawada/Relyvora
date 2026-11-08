import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock, ArrowLeft, Mail } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy | Relyvora Technologies',
  description: 'Privacy Policy and Nigeria Data Protection Act (NDPA) 2023 compliance notice for Relyvora.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-site text-main min-h-screen flex flex-col font-sans selection:bg-accent selection:text-white">
      <Header />

      <main className="flex-1 w-full py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-12">
          
          {/* Navigation Breadcrumb */}
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#047857] hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Relyvora Home</span>
            </Link>
          </div>

          {/* Header Title Block */}
          <div className="space-y-4 border-b border-[#E7E4DC] pb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-mono font-semibold text-emerald-800">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>DATA PROTECTION & PRIVACY</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-serif text-[#090E1A] tracking-tight">
              Relyvora Privacy Policy
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#64748B]">
              <span><strong>Last Updated:</strong> November 5, 2026</span>
              <span>•</span>
              <span>Nigeria Data Protection Act (NDPA) 2023 Compliant</span>
            </div>
          </div>

          {/* Legal Document Content */}
          <article className="prose prose-slate max-w-none text-sm sm:text-base text-[#334155] leading-relaxed space-y-8 font-sans">
            
            {/* Section 1 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold text-[#090E1A] tracking-tight">
                1. Introduction
              </h2>
              <p>
                Relyvora Technologies Limited (RC No: 9982218 | TIN: 2623717709692) (&quot;Relyvora&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) respects your privacy and is committed to protecting your personal data in strict compliance with the <strong>Nigeria Data Protection Act (NDPA) 2023</strong>. This Privacy Policy explains what information we collect from Vendors and Buyers, how we use and safeguard it, and your statutory rights.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-bold text-[#090E1A] tracking-tight">
                2. Information We Collect
              </h2>
              <p>
                To maintain a secure escrow ecosystem while keeping checkout frictionless, we collect different tiers of data depending on your role:
              </p>

              <div className="space-y-4 pl-2">
                {/* Subsection A */}
                <div className="p-5 rounded-2xl bg-white border border-[#E7E4DC] space-y-2">
                  <h3 className="text-base font-bold text-[#090E1A]">
                    A. Data Collected from Vendors (Merchants)
                  </h3>
                  <p className="text-xs sm:text-sm text-[#475569]">
                    Because vendors receive financial payouts through regulated banking rails, Nigerian law requires mandatory identity verification (KYC):
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                    <li>
                      <strong>Identity &amp; KYC Data:</strong> Full legal name, Date of Birth, Gender, Residential/Business Address, 11-digit Bank Verification Number (BVN), and/or 11-digit National Identity Number (NIN).
                    </li>
                    <li>
                      <strong>Account &amp; Contact Data:</strong> Store/business name, email address, and active phone number.
                    </li>
                    <li>
                      <strong>Payout Financial Data:</strong> Commercial bank name and 10-digit NUBAN account number (which must match the legal name on your BVN/NIN).
                    </li>
                  </ul>
                </div>

                {/* Subsection B */}
                <div className="p-5 rounded-2xl bg-white border border-[#E7E4DC] space-y-2">
                  <h3 className="text-base font-bold text-[#090E1A]">
                    B. Data Collected from Buyers (Customers)
                  </h3>
                  <p className="text-xs sm:text-sm text-[#475569]">
                    Buyers are <strong>never</strong> required to provide a BVN or NIN to make an escrow payment. From buyers, we only collect:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                    <li>
                      <strong>Transaction &amp; Delivery Data:</strong> Name, phone number, email address (for sending receipts and the 6-digit release code), and delivery details.
                    </li>
                    <li>
                      <strong>Payment Confirmation Data:</strong> Transaction reference numbers, payment timestamps, and refund bank account details (only if a refund is triggered). <em>Note: Relyvora does not store raw debit/credit card numbers; all card and bank transfer collections are processed directly by our PCI-DSS compliant partner, Anchor Technologies Limited.</em>
                    </li>
                  </ul>
                </div>

                {/* Subsection C */}
                <div className="p-5 rounded-2xl bg-white border border-[#E7E4DC] space-y-2">
                  <h3 className="text-base font-bold text-[#090E1A]">
                    C. Dispute Resolution Data (Both Parties)
                  </h3>
                  <p className="text-xs sm:text-sm text-[#475569]">
                    If a transaction enters a dispute, we collect evidence submitted by either party, including product photos, unboxing videos, WhatsApp/Instagram chat screenshots, and dispatch rider call logs.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold text-[#090E1A] tracking-tight">
                3. How We Use Your Data
              </h2>
              <p>
                We process your personal data strictly on lawful grounds under the NDPA to:
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Generate escrow payment links, hold transaction statuses, and issue 6-digit delivery verification codes.</li>
                <li>Verify vendor identities via NIBSS/banking databases to prevent impersonation, fraud, and Pay-on-Delivery scams.</li>
                <li>Execute automated split payouts and refunds through our banking APIs.</li>
                <li>Arbitrate and resolve transaction disputes fairly between buyers and vendors.</li>
                <li>Fulfill mandatory Anti-Money Laundering (AML) and Combating the Financing of Terrorism (CFT) obligations overseen by SCUML and the Central Bank of Nigeria (CBN).</li>
              </ol>
            </section>

            {/* Section 4 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold text-[#090E1A] tracking-tight">
                4. Data Sharing &amp; Third-Party Disclosures
              </h2>
              <p>
                Relyvora <strong>never sells</strong> your personal data to advertisers or third parties. We only share data with essential operational and regulatory entities:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Anchor Technologies Limited:</strong> Our regulated Banking-as-a-Service (BaaS) provider, to perform BVN/NIN name-enquiry checks, generate virtual escrow accounts, and settle payouts.
                </li>
                <li>
                  <strong>Transaction Counterparties:</strong> Necessary contact details (such as a vendor&apos;s store name or a buyer&apos;s delivery phone number and address) are shared between the specific buyer and vendor of a transaction to enable item dispatch.
                </li>
                <li>
                  <strong>Regulatory &amp; Law Enforcement Authorities:</strong> When required by law, subpoena, or regulatory directive from the Nigeria Data Protection Commission (NDPC), CBN, SCUML, or EFCC.
                </li>
              </ul>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold text-[#090E1A] tracking-tight">
                5. Data Security &amp; Statutory Retention
              </h2>
              <p>
                We implement industry-standard encryption (TLS/SSL in transit and encryption at rest), strict role-based access controls, and row-level database security to protect your information.
              </p>
              <p>
                In accordance with Nigerian financial and anti-money laundering regulations, transaction records and vendor KYC logs are retained for a minimum statutory period of <strong>five (5) years</strong> following the completion of a transaction or closure of an account.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-3 pt-4 border-t border-[#E7E4DC]">
              <h2 className="text-xl sm:text-2xl font-bold text-[#090E1A] tracking-tight">
                6. Your Rights Under the NDPA 2023
              </h2>
              <p>
                Under the Nigeria Data Protection Act, you have the right to:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Request access to and obtain a copy of the personal data we hold about you.</li>
                <li>Request correction of inaccurate or incomplete personal data.</li>
                <li>Object to processing or request the deletion of your account (subject to our mandatory 5-year regulatory retention obligation for financial and KYC records).</li>
              </ul>
              <div className="p-4 rounded-xl bg-white border border-[#E7E4DC] flex items-center gap-3 text-xs sm:text-sm mt-4">
                <Mail className="w-5 h-5 text-[#047857] shrink-0" />
                <span>
                  To exercise any of your privacy rights or contact our Data Protection Officer, please email{' '}
                  <a href="mailto:compliance@relyvora.com" className="text-emerald-700 font-semibold hover:underline">
                    compliance@relyvora.com
                  </a>.
                </span>
              </div>
            </section>

          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
