import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Scale, ArrowLeft, Mail, AlertTriangle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Dispute and Refund Policy | Relyvora Technologies',
  description: 'The official 8 binding scenarios for Relyvora escrow dispute resolution and refunds.',
};

export default function DisputesPolicyPage() {
  return (
    <div className="bg-site text-main min-h-screen flex flex-col font-sans selection:bg-accent selection:text-white">
      <Header />

      <main className="flex-1 w-full py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-12">
          
          {/* Navigation Breadcrumb */}
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-accent hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Relyvora Home</span>
            </Link>
          </div>

          {/* Header Title Block */}
          <div className="space-y-4 border-b border-border pb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs font-mono font-semibold text-accent">
              <Scale className="w-3.5 h-3.5 text-accent" />
              <span>ARBITRATION & REFUND PROTOCOL</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-heading font-semibold text-main tracking-tight">
              Relyvora Dispute and Refund Policy
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted">
              <span><strong>Last Updated:</strong> November 5, 2026</span>
              <span>•</span>
              <span>8 Binding Arbitration Scenarios</span>
            </div>
            <p className="text-sm sm:text-base text-muted leading-relaxed pt-2">
              Relyvora protects both buyers from substandard goods and non-delivery, and vendors from Pay-on-Delivery losses and unserious buyers. When a dispute is flagged prior to the entry of the 6-digit delivery code, the funds remain frozen in escrow and are resolved by Relyvora Support under the following 8 binding scenarios:
            </p>
          </div>

          {/* Legal Document Content */}
          <article className="prose prose-slate dark:prose-invert max-w-none text-sm sm:text-base text-main/90 leading-relaxed space-y-8 font-sans">
            
            {/* Scenario 1 */}
            <section className="p-6 sm:p-7 rounded-card bg-surface border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                  SCENARIO 01
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-accent border border-emerald-500/20">
                  100% Full Refund
                </span>
              </div>
              <h2 className="text-xl font-heading font-semibold text-main tracking-tight">
                1. Quality Mismatch (&quot;What I Ordered vs. What I Got&quot;)
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li><strong>Scenario:</strong> The delivered item materially differs from the vendor&apos;s description, size, or photos.</li>
                <li><strong>Action Required:</strong> The buyer must refuse the item at the point of delivery, withhold the 6-digit code, hand the item back to the rider, and click &quot;Dispute.&quot;</li>
                <li><strong>Evidence Required:</strong> The buyer must upload clear photos or video of the delivered item to Relyvora Support within <strong>2 hours</strong>. The vendor must provide the original product listing or chat agreement.</li>
                <li><strong>Resolution:</strong> Once verified as a mismatch and the rider confirms the return of the item to the vendor, Relyvora issues a <strong>100% full refund</strong> to the buyer.</li>
              </ul>
            </section>

            {/* Scenario 2 */}
            <section className="p-6 sm:p-7 rounded-card bg-surface border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                  SCENARIO 02
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                  Partial Split
                </span>
              </div>
              <h2 className="text-xl font-heading font-semibold text-main tracking-tight">
                2. Buyer Refuses Delivery / Unreachable (&quot;Buyer Ghosts&quot;)
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li><strong>Scenario:</strong> The vendor dispatches the item, but the buyer switches off their phone, is unreachable, or refuses to show up to receive the package.</li>
                <li><strong>Evidence Required:</strong> The vendor submits screenshots of the dispatch rider&apos;s call logs showing repeated missed calls and proof of arrival at the agreed location.</li>
                <li><strong>Resolution:</strong> Relyvora executes a <strong>Partial Split</strong>. The buyer is refunded their purchase price <strong>minus the delivery fee</strong>, and the delivery fee is paid directly to the vendor to cover wasted logistics costs.</li>
              </ul>
            </section>

            {/* Scenario 3 */}
            <section className="p-6 sm:p-7 rounded-card bg-surface border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                  SCENARIO 03
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                  12-Hour Ultimatum
                </span>
              </div>
              <h2 className="text-xl font-heading font-semibold text-main tracking-tight">
                3. The &quot;Hostage&quot; Situation (Item Taken, Code Withheld)
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li><strong>Scenario:</strong> The buyer takes physical possession of the item without handing over the 6-digit code and subsequently refuses to provide the code or return the item.</li>
                <li><strong>Evidence Required:</strong> The vendor provides proof of delivery (e.g., rider handover photo, signed waybill, or chat messages where the buyer acknowledges having the item).</li>
                <li><strong>Resolution:</strong> Relyvora issues a strict <strong>12-hour ultimatum</strong> to the buyer to either submit valid defect evidence and return the item, or release the code. If the buyer remains silent, Relyvora overrides the 6-digit code requirement and releases the <strong>full payout to the vendor</strong>.</li>
              </ul>
            </section>

            {/* Scenario 4 */}
            <section className="p-6 sm:p-7 rounded-card bg-surface border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                  SCENARIO 04
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-accent border border-emerald-500/20">
                  100% Full Refund
                </span>
              </div>
              <h2 className="text-xl font-heading font-semibold text-main tracking-tight">
                4. Item Damaged in Transit
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li><strong>Scenario:</strong> The item arrives broken, spilled, or physically damaged at the point of delivery.</li>
                <li><strong>Evidence Required:</strong> The buyer provides immediate photos or an unboxing video taken at the point of delivery in the presence of the rider.</li>
                <li><strong>Resolution:</strong> The damaged item is returned immediately with the rider. Relyvora issues a <strong>100% full refund</strong> to the buyer. Because the vendor selects and contracts the dispatch rider, the vendor must pursue compensation from their logistics provider.</li>
              </ul>
            </section>

            {/* Scenario 5 */}
            <section className="p-6 sm:p-7 rounded-card bg-surface border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                  SCENARIO 05
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                  Custom Split
                </span>
              </div>
              <h2 className="text-xl font-heading font-semibold text-main tracking-tight">
                5. Partial Acceptance (Multi-Item Orders)
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li><strong>Scenario:</strong> A buyer orders multiple items in a single escrow link, accepts some, and rejects others due to defects or inaccuracy.</li>
                <li><strong>Evidence Required:</strong> Photos of the rejected item(s) handed back to the rider and confirmation from both parties of the kept items.</li>
                <li><strong>Resolution:</strong> Relyvora executes a <strong>Custom Partial Split</strong>. The vendor is paid for the accepted items (minus the 3% platform fee), and the buyer receives a proportionate refund for the returned item(s).</li>
              </ul>
            </section>

            {/* Scenario 6 */}
            <section className="p-6 sm:p-7 rounded-card bg-surface border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                  SCENARIO 06
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                  6-Hour Window
                </span>
              </div>
              <h2 className="text-xl font-heading font-semibold text-main tracking-tight">
                6. Vendor Failure to Deliver (&quot;Vendor MIA&quot;)
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li><strong>Scenario:</strong> The agreed delivery timeframe expires, the item has not been dispatched, and the vendor is unresponsive to the buyer.</li>
                <li><strong>Evidence Required:</strong> Buyer submits screenshots of unanswered inquiries; Relyvora system logs confirm no delivery activity.</li>
                <li><strong>Resolution:</strong> Relyvora gives the vendor a <strong>6-hour window</strong> to provide valid dispatch proof. If the vendor fails to respond, Relyvora issues a <strong>100% full refund</strong> to the buyer and logs a compliance strike against the vendor&apos;s account.</li>
              </ul>
            </section>

            {/* Scenario 7 */}
            <section className="p-6 sm:p-7 rounded-card bg-surface border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                  SCENARIO 07
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                  Minus Delivery
                </span>
              </div>
              <h2 className="text-xl font-heading font-semibold text-main tracking-tight">
                7. Buyer&apos;s Remorse at the Door
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li><strong>Scenario:</strong> The delivered item matches the vendor&apos;s description and photos accurately, but the buyer simply changes their mind at the door and rejects it.</li>
                <li><strong>Evidence Required:</strong> Vendor provides the original listing alongside photos of the delivered item showing it matches as advertised.</li>
                <li><strong>Resolution:</strong> The rider returns the item to the vendor. Relyvora issues a refund to the buyer <strong>minus the cost of delivery</strong>, routing the delivery fee to the vendor so the merchant is not out of pocket for dispatch.</li>
              </ul>
            </section>

            {/* Scenario 8 */}
            <section className="p-6 sm:p-7 rounded-card bg-surface border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                  SCENARIO 08
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                  100% Full Refund
                </span>
              </div>
              <h2 className="text-xl font-heading font-semibold text-main tracking-tight">
                8. Lost or Stolen in Transit (Rider Absconds)
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted">
                <li><strong>Scenario:</strong> The vendor hands the package to a third-party dispatch rider, but the rider loses the package, gets into an accident, or absconds, and the buyer never receives the item.</li>
                <li><strong>Evidence Required:</strong> Vendor provides the dispatch waybill/receipt; buyer confirms non-arrival.</li>
                <li><strong>Resolution:</strong> Because the buyer never received the goods, Relyvora issues a <strong>100% full refund</strong> to the buyer. The vendor must pursue recovery of the lost goods directly with the management of the logistics company they hired.</li>
              </ul>
            </section>

            {/* How to File or Respond */}
            <section className="p-6 sm:p-8 rounded-card bg-surface border border-border space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono uppercase font-bold text-accent">
                <AlertTriangle className="w-4 h-4 text-accent" />
                <span>How to File or Respond to a Dispute</span>
              </div>
              <p className="text-sm text-main/90 leading-relaxed">
                Click the <strong>&quot;Raise Dispute&quot;</strong> button directly on your active Relyvora transaction page or email transaction evidence with your Transaction Reference ID to{' '}
                <a href="mailto:support@relyvora.com" className="text-accent font-semibold underline underline-offset-4">
                  support@relyvora.com
                </a>.
              </p>
              <div className="text-xs text-muted pt-1">
                Funds remain safely frozen in the Anchor escrow vault until a binding resolution is determined.
              </div>
            </section>

          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
