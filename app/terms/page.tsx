import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, Mail, Phone, MapPin } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service | Relyvora Technologies',
  description: 'Terms of Service governing the use of Relyvora transaction protection and escrow services.',
};

export default function TermsOfServicePage() {
  return (
    <div className="bg-site text-main min-h-screen flex flex-col font-sans selection:bg-accent selection:text-white">
      <Header />

      <main className="flex-1 w-full py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-12">
          
          {/* Navigation Breadcrumb */}
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Relyvora Home</span>
            </Link>
          </div>

          {/* Header Title Block */}
          <div className="space-y-4 border-b border-border pb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs font-semibold text-accent">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              <span>LEGAL & COMPLIANCE</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-heading font-semibold text-main tracking-tight">
              Relyvora Terms of Service
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
              <span><strong>Last Updated:</strong> November 5, 2026</span>
              <span>•</span>
              <span>Relyvora Technologies Limited (RC 9982218)</span>
            </div>
          </div>

          {/* Legal Document Content */}
          <article className="max-w-none text-base text-main/90 leading-relaxed space-y-8 font-sans">
            
            {/* Section 1 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                1. Introduction and Acceptance of Terms
              </h2>
              <p className="text-sm sm:text-base text-main/80 dark:text-muted leading-relaxed">
                Welcome to Relyvora. These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement governing your access to and use of the Relyvora website (relyvora.com), web application (ng.relyvora.com), escrow payment links, and related services (collectively, the &quot;Service&quot;).
              </p>
              <p className="text-sm sm:text-base text-main/80 dark:text-muted leading-relaxed">
                The Service is operated by <strong>Relyvora Technologies Limited</strong> (RC No: 9982218), headquartered in Abuja, Nigeria (&quot;Relyvora&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By registering a vendor account, generating an escrow link, or making a payment as a buyer through Relyvora, you agree to be bound by these Terms.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                2. Nature of Our Service &amp; Banking Infrastructure
              </h2>
              <p className="text-sm sm:text-base text-main/80 dark:text-muted leading-relaxed">
                Relyvora provides transaction-protection and escrow checkout infrastructure designed for social commerce across WhatsApp, Instagram, and other digital channels.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-main/80 dark:text-muted">
                <li>
                  <strong>Technology Platform, Not a Bank:</strong> Relyvora Technologies Limited is a financial technology company, not a licensed commercial bank or depository institution.
                </li>
                <li>
                  <strong>Regulated Banking Partner:</strong> All payment collections, virtual deposit accounts, fund custody, and payout settlements are powered by our regulated Banking-as-a-Service (BaaS) partner, <strong>Anchor Technologies Limited (&quot;Anchor&quot;)</strong>, in partnership with CBN-licensed financial institutions. When a buyer funds a transaction, the money is held securely in a dedicated partner-managed escrow ledger until the transaction conditions are fulfilled.
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                3. Account Registration &amp; KYC Verification
              </h2>
              <p className="text-sm sm:text-base text-main/80 dark:text-muted leading-relaxed">
                Our platform serves two distinct participants in a transaction:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-main/80 dark:text-muted">
                <li>
                  <strong>Vendors (Sellers):</strong> To generate payment links and receive payouts, vendors must create an account and complete mandatory Know Your Customer (KYC) and Anti-Money Laundering (AML) verification. This requires providing your full legal name, date of birth, residential/business address, a valid 11-digit Bank Verification Number (BVN) or National Identity Number (NIN), and a matching Nigerian commercial bank account (NUBAN). Payouts cannot be routed to third-party bank accounts that do not match the verified vendor&apos;s legal name.
                </li>
                <li>
                  <strong>Buyers (Customers):</strong> Buyers do not need to provide a BVN, NIN, or undergo KYC verification to pay via a Relyvora escrow link. Buyers only provide basic contact and delivery details (name, phone number, email address, and delivery location) to receive their payment receipt and unique 6-digit delivery code.
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                4. How the Escrow &amp; 6-Digit Delivery Code Works
              </h2>
              <ol className="list-decimal pl-5 space-y-2.5 text-sm sm:text-base text-main/80 dark:text-muted">
                <li>
                  <strong>Link Generation:</strong> The vendor generates a Relyvora payment link specifying the item description, price, delivery fee, and fee-bearer preference, and shares it with the buyer.
                </li>
                <li>
                  <strong>Escrow Funding:</strong> The buyer pays via bank transfer or card into the designated Anchor-powered escrow account. Once payment is confirmed, both parties are notified, and a unique <strong>6-Digit Delivery Code</strong> is sent privately to the buyer.
                </li>
                <li>
                  <strong>Delivery &amp; Inspection:</strong> The vendor dispatches the item to the buyer. Upon arrival, the buyer inspects the item in the presence of the dispatch rider.
                </li>
                <li>
                  <strong>Code Verification &amp; Automated Split Payout:</strong> Once satisfied with the item, the buyer provides the 6-digit code to the vendor or dispatch rider. Entering this valid 6-digit code into the Relyvora portal immediately triggers an automated split payout: releasing the net purchase price to the vendor&apos;s verified bank account and routing the platform fee to Relyvora.
                </li>
                <li>
                  <strong>Strict Handover Rule:</strong> Vendors and their dispatch riders must <strong>never</strong> leave an item with a buyer without first receiving and verifying the 6-digit code (or receiving explicit written clearance from Relyvora Support). Relyvora is not liable for physical goods handed over without system verification.
                </li>
              </ol>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                5. Platform Fees &amp; Pricing
              </h2>
              <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-main/80 dark:text-muted">
                <li>
                  <strong>Standard Fee:</strong> Relyvora charges a flat platform fee of <strong>3% of the total transaction value</strong>, subject to a <strong>minimum fee of ₦500</strong> per transaction.
                </li>
                <li>
                  <strong>Fee Allocation:</strong> When creating an escrow link, the vendor selects whether the 3% fee is added to the buyer&apos;s checkout total, deducted from the vendor&apos;s final payout, or split between both parties.
                </li>
                <li>
                  <strong>Non-Refundable Processing Costs:</strong> In the event of a cancelled transaction caused by buyer remorse or buyer unavailability after dispatch, applicable logistics deductions will apply as detailed in our Dispute and Refund Policy.
                </li>
              </ul>
            </section>

            {/* Section 6 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                6. Disputes, Frozen Funds, and Resolution Authority
              </h2>
              <p className="text-sm sm:text-base text-main/80 dark:text-muted leading-relaxed">
                Either party may trigger a transaction freeze by clicking &quot;Dispute&quot; on the transaction portal prior to the entry of the 6-digit code.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-main/80 dark:text-muted">
                <li>
                  <strong>Effect of a Freeze:</strong> Once a dispute is flagged, the automated 6-digit code trigger is locked, and the funds remain safely frozen in the escrow ledger.
                </li>
                <li>
                  <strong>Arbitration by Relyvora:</strong> Both parties agree to submit required evidence (such as unboxing videos, item photos, original product listings, or rider call logs) within the timeframes specified in our <strong><Link href="/disputes" target="_blank" rel="noopener noreferrer" className="text-accent underline font-semibold">Dispute and Refund Policy</Link></strong>. You grant Relyvora Technologies Limited full authority to review the evidence and manually execute a Full Refund, Partial Split (deducting delivery fees), or Full Vendor Payout based on our findings.
                </li>
              </ul>
            </section>

            {/* Section 7 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                7. Prohibited Goods and Transactions
              </h2>
              <p className="text-sm sm:text-base text-main/80 dark:text-muted leading-relaxed">
                You may not use Relyvora to buy, sell, or transfer funds for:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm sm:text-base text-main/80 dark:text-muted">
                <li>Narcotics, controlled substances, or unlicensed pharmaceuticals.</li>
                <li>Weapons, firearms, ammunition, or explosives.</li>
                <li>Stolen goods, counterfeit items, or intellectual property infringements.</li>
                <li>Adult content, human trafficking, or illegal services.</li>
                <li>Money laundering, terrorist financing, Ponzi schemes, or fraudulent cash-out schemes.</li>
              </ul>
              <p className="text-xs text-muted pt-1">
                Relyvora reserves the right to immediately freeze funds, terminate accounts, and report suspicious transactions to the Special Control Unit Against Money Laundering (SCUML), the Economic and Financial Crimes Commission (EFCC), and other Nigerian law enforcement agencies.
              </p>
            </section>

            {/* Section 8 */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                8. Logistics Disclaimer &amp; Limitation of Liability
              </h2>
              <p className="text-sm sm:text-base text-main/80 dark:text-muted leading-relaxed">
                Relyvora is strictly a financial technology and escrow layer; <strong>we are not a logistics, courier, or dispatch company</strong>. Vendors are solely responsible for selecting reliable third-party logistics (3PL) riders and insuring goods in transit. To the maximum extent permitted under Nigerian law, Relyvora&apos;s total liability in any transaction is strictly limited to the actual escrow funds held for that specific transaction.
              </p>
            </section>

            {/* Section 9 */}
            <section className="space-y-4 pt-4 border-t border-border">
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                9. Governing Law &amp; Contact Us
              </h2>
              <p className="text-sm sm:text-base text-main/80 dark:text-muted leading-relaxed">
                These Terms are governed by the laws of the Federal Republic of Nigeria. For questions, support, or official correspondence, contact us at:
              </p>
              <div className="p-5 rounded-card bg-surface border border-border space-y-2.5 text-xs sm:text-sm font-sans transition-colors">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-accent" />
                  <span><strong>General Inquiries:</strong> <a href="mailto:hello@relyvora.com" className="text-accent hover:underline">hello@relyvora.com</a></span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-accent" />
                  <span><strong>Customer &amp; Dispute Support:</strong> <a href="mailto:support@relyvora.com" className="text-accent hover:underline">support@relyvora.com</a></span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-accent" />
                  <span><strong>Compliance &amp; Legal:</strong> <a href="mailto:compliance@relyvora.com" className="text-accent hover:underline">compliance@relyvora.com</a></span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-accent" />
                  <span><strong>Phone:</strong> <a href="tel:+2347033841860" className="text-accent hover:underline">+234 703 384 1860</a></span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-accent" />
                  <span><strong>Location:</strong> Abuja, Nigeria</span>
                </div>
              </div>
            </section>

          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
