'use client';

import React, { useState } from 'react';
import { calculateFee, formatNaira } from '@/lib/feeConfig';

export function PricingCalculator() {
  const [inputPrice, setInputPrice] = useState<string>('45000');
  const calculation = calculateFee(inputPrice);

  const presets = [15000, 30000, 45000, 85000, 150000];

  return (
    <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl sm:text-2xl font-semibold text-main">Fee calculator</h2>
        <p className="text-muted text-sm leading-relaxed">
          Enter an order amount to see the 3% buyer fee and total.
        </p>
      </div>

      <div className="space-y-4">
        <label htmlFor="priceInput" className="block text-xs font-semibold uppercase tracking-wider text-muted">
          Agreed item price (₦)
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold text-lg" aria-hidden="true">
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

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted mr-1">Example amounts:</span>
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

      <div className="p-6 rounded-2xl bg-site border border-border space-y-3.5">
        <div className="flex items-center justify-between text-xs text-muted font-medium">
          <span>Illustrative example</span>
          <span className="text-accent font-semibold">3%</span>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-border text-sm">
          <div className="flex justify-between text-muted">
            <span>Item price</span>
            <span className="font-semibold text-main">{calculation.formattedItemPrice}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Relyvora fee (3%)</span>
            <span className="font-semibold text-accent">{calculation.formattedFeeAmount}</span>
          </div>
          <div className="flex justify-between pt-3 border-t border-border text-base font-bold text-main">
            <span>Buyer pays</span>
            <span>{calculation.formattedTotalAmount}</span>
          </div>
        </div>

        <p className="pt-2 text-xs text-muted">
          Illustrative example derived from the 3% buyer fee. The fee is shown before payment.
        </p>
      </div>
    </div>
  );
}
