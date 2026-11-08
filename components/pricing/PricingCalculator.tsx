'use client';

import React, { useState } from 'react';
import { calculateFee, formatNaira } from '@/lib/feeConfig';

const PRESETS = [5000, 20000, 45000, 85000];

function formatInputDisplay(val: string): string {
  const digits = val.replace(/\D/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('en-US');
}

export function PricingCalculator() {
  const [itemRaw, setItemRaw] = useState<string>('45,000');
  const [deliveryRaw, setDeliveryRaw] = useState<string>('');

  const itemPrice = parseInt(itemRaw.replace(/\D/g, ''), 10) || 0;
  const deliveryFee = parseInt(deliveryRaw.replace(/\D/g, ''), 10) || 0;

  const calculation = calculateFee(itemPrice, deliveryFee);

  const handleItemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setItemRaw(formatInputDisplay(e.target.value));
  };

  const handleDeliveryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDeliveryRaw(formatInputDisplay(e.target.value));
  };

  const applyPreset = (preset: number) => {
    setItemRaw(preset.toLocaleString('en-US'));
  };

  return (
    <div className="p-7 sm:p-9 rounded-3xl border border-border bg-surface space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-xl sm:text-2xl font-semibold text-main">Fee calculator</h2>
        <p className="text-muted text-sm leading-relaxed">
          Enter an order amount to see the 3% buyer fee (minimum ₦500) and total.
        </p>
      </div>

      <div className="space-y-4">
        {/* Item price input */}
        <div className="space-y-1.5">
          <label htmlFor="priceInput" className="block text-xs font-semibold uppercase tracking-wider text-muted">
            Agreed item price (₦)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold text-lg" aria-hidden="true">
              ₦
            </span>
            <input
              id="priceInput"
              type="text"
              inputMode="numeric"
              value={itemRaw}
              onChange={handleItemChange}
              className="w-full h-13 pl-10 pr-4 rounded-xl border border-border bg-site text-main font-semibold text-lg focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-colors"
              placeholder="e.g. 45,000"
            />
          </div>
        </div>

        {/* Optional delivery input */}
        <div className="space-y-1.5">
          <label htmlFor="deliveryInput" className="block text-xs font-semibold uppercase tracking-wider text-muted">
            Delivery fee (optional)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold text-lg" aria-hidden="true">
              ₦
            </span>
            <input
              id="deliveryInput"
              type="text"
              inputMode="numeric"
              value={deliveryRaw}
              onChange={handleDeliveryChange}
              className="w-full h-13 pl-10 pr-4 rounded-xl border border-border bg-site text-main font-semibold text-lg focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-colors"
              placeholder="e.g. 2,500"
            />
          </div>
        </div>

        {/* Presets: ₦5,000, ₦20,000, ₦45,000, ₦85,000 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted mr-1">Presets:</span>
          {PRESETS.map((preset) => {
            const isSelected = itemPrice === preset && deliveryFee === 0;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  isSelected
                    ? 'border-accent bg-accent/10 text-accent font-semibold'
                    : 'border-border bg-surface text-muted hover:text-main hover:border-accent/50'
                }`}
              >
                {formatNaira(preset)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Breakdown */}
      <div className="p-6 rounded-2xl bg-site border border-border space-y-3.5">
        <div className="flex items-center justify-between text-xs text-muted font-medium">
          <span>Breakdown</span>
          <span className="text-accent font-semibold">3% (min ₦500)</span>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-border text-sm">
          <div className="flex justify-between text-muted">
            <span>Item price</span>
            <span className="font-semibold text-main">{calculation.formattedItemPrice}</span>
          </div>

          {calculation.deliveryFee > 0 && (
            <div className="flex justify-between text-muted">
              <span>Delivery fee</span>
              <span className="font-semibold text-main">{calculation.formattedDeliveryFee}</span>
            </div>
          )}

          {calculation.deliveryFee > 0 && (
            <div className="flex justify-between text-muted pt-1 border-t border-border/60 text-xs">
              <span>Base in escrow</span>
              <span className="font-semibold text-main">{calculation.formattedBaseAmount}</span>
            </div>
          )}

          <div className="flex justify-between text-muted">
            <span className="flex items-center gap-1.5">
              <span>Relyvora fee</span>
              {calculation.isMinimumApplied && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                  Minimum fee applies
                </span>
              )}
            </span>
            <span className="font-semibold text-accent">{calculation.formattedFeeAmount}</span>
          </div>

          <div className="flex justify-between pt-3 border-t border-border text-base font-bold text-main">
            <span>Buyer pays</span>
            <span>{calculation.formattedTotalAmount}</span>
          </div>
        </div>

        <p className="pt-1 text-xs text-muted leading-relaxed">
          {calculation.isMinimumApplied
            ? 'The minimum fee of ₦500 applies to orders where 3% is less than ₦500.'
            : 'The 3% fee is shown on the payment screen before the buyer pays.'}
        </p>
      </div>
    </div>
  );
}
