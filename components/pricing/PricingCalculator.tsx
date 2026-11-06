'use client';

import React, { useState } from 'react';
import { calculateFee, formatNaira, FEE_CONFIG } from '@/lib/feeConfig';

export function PricingCalculator() {
  const [inputPrice, setInputPrice] = useState<string>('45000');
  const calculation = calculateFee(inputPrice);

  const presets = [15000, 30000, 45000, 85000, 150000];

  return (
    <div className="p-8 sm:p-12 rounded-3xl border border-border bg-surface shadow-sm space-y-8">
      <div className="space-y-2">
        <h3 className="text-xl sm:text-2xl font-semibold text-main">
          Interactive Fee Calculator
        </h3>
        <p className="text-muted text-sm leading-relaxed">
          Enter any agreed order amount to see the exact 3% buyer protection fee breakdown.
        </p>
      </div>

      <div className="space-y-4">
        <label htmlFor="priceInput" className="block text-xs font-semibold uppercase tracking-wider text-muted">
          Agreed Item Price (₦)
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold text-lg">
            ₦
          </span>
          <input
            id="priceInput"
            type="number"
            min="0"
            step="1000"
            value={inputPrice}
            onChange={(e) => setInputPrice(e.target.value)}
            className="w-full h-14 pl-10 pr-4 rounded-xl border border-border bg-site text-main font-semibold text-xl focus:border-accent focus:outline-none transition-colors"
            placeholder="e.g. 45,000"
          />
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted mr-1">Quick amounts:</span>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setInputPrice(preset.toString())}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                parseFloat(inputPrice) === preset
                  ? 'border-accent bg-accent/10 text-accent font-semibold'
                  : 'border-border bg-surface text-muted hover:text-main'
              }`}
            >
              {formatNaira(preset)}
            </button>
          ))}
        </div>
      </div>

      {/* Output Results Table */}
      <div className="p-6 rounded-2xl bg-site border border-border space-y-3.5">
        <div className="flex items-center justify-between text-xs text-muted font-medium">
          <span>Fee breakdown</span>
          <span className="text-accent font-semibold">Flat 3% Rate</span>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-border text-sm">
          <div className="flex justify-between text-muted">
            <span>Item Price</span>
            <span className="font-semibold text-main">{calculation.formattedItemPrice}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Buyer Protection Fee (3%)</span>
            <span className="font-semibold text-accent">{calculation.formattedFeeAmount}</span>
          </div>
          <div className="flex justify-between pt-3 border-t border-border text-base font-bold text-main">
            <span>Total Payable by Buyer</span>
            <span>{calculation.formattedTotalAmount}</span>
          </div>
        </div>

        <div className="pt-2 text-[11px] text-muted italic">
          * Illustrative example. The 3% protection fee is shown to the buyer on the payment screen prior to authorization.
        </div>
      </div>
    </div>
  );
}
