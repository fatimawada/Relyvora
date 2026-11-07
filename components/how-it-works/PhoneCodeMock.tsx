import React from 'react';
import { KeyRound } from 'lucide-react';
import { ILLUSTRATIVE_EXAMPLE } from '@/lib/feeConfig';

/**
 * CSS-only phone mock showing the buyer's six-digit release code.
 * Illustrative example derived from FEE_CONFIG (item ₦45,000, fee ₦1,350, buyer pays ₦46,350).
 */
export function PhoneCodeMock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative w-full max-w-[300px] rounded-[40px] border-[6px] border-[#0A1B3D] dark:border-[#1B315E] bg-surface p-4 shadow-xl ${className}`}
      role="img"
      aria-label="Illustrative example phone screen showing an order with the money held and a six-digit release code"
    >
      <div className="w-24 h-4 bg-[#0A1B3D] dark:bg-[#1B315E] rounded-b-xl mx-auto mb-4" aria-hidden="true" />

      <div className="space-y-4 text-left" aria-hidden="true">
        <div className="flex items-center justify-between text-[11px] text-muted border-b border-border pb-2">
          <span className="font-medium">Relyvora</span>
          <span className="text-accent font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Money held
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-site border border-border space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>Illustrative example</span>
            <span className="text-accent font-semibold">3% fee</span>
          </div>
          <div className="text-sm font-semibold text-main">Human hair wig (30&quot;)</div>
          <div className="space-y-1 text-xs pt-2 border-t border-border">
            <div className="flex items-center justify-between text-muted">
              <span>Item price</span>
              <span className="font-semibold text-main">{ILLUSTRATIVE_EXAMPLE.formattedItemPrice}</span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>Relyvora fee (3%)</span>
              <span className="font-semibold text-accent">{ILLUSTRATIVE_EXAMPLE.formattedFeeAmount}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border text-main font-semibold">
              <span>Buyer pays</span>
              <span>{ILLUSTRATIVE_EXAMPLE.formattedTotalAmount}</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-accent">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Your release code</span>
          </div>
          <div className="py-2 px-3 rounded-lg bg-surface border border-accent/30 font-heading tabular-nums text-2xl font-semibold tracking-[0.2em] text-main whitespace-nowrap">
            842 195
          </div>
          <p className="text-[11px] text-muted leading-snug">Only share this code after you have checked your order.</p>
        </div>
      </div>

      <div className="w-28 h-1 bg-border rounded-full mx-auto mt-6" aria-hidden="true" />
    </div>
  );
}
