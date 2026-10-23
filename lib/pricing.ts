import { PricingBreakdown } from './types';

export const MINIMUM_PROTECTION_FEE = 500;
export const PROTECTION_FEE_RATE = 0.03;

/**
 * Calculates the Relyvora Buyer Protection Fee.
 * Formula: Math.max(500, Math.round(itemPrice * 0.03))
 */
export function calculatePricing(itemPriceInput: number | string): PricingBreakdown {
  const itemPrice = Math.max(0, typeof itemPriceInput === 'string' ? parseFloat(itemPriceInput) || 0 : itemPriceInput);
  
  if (itemPrice <= 0) {
    return {
      itemPrice: 0,
      protectionFee: 0,
      totalAmount: 0,
      feePercentage: 3,
      minimumFee: MINIMUM_PROTECTION_FEE,
    };
  }

  const calculatedFee = Math.round(itemPrice * PROTECTION_FEE_RATE);
  const protectionFee = Math.max(MINIMUM_PROTECTION_FEE, calculatedFee);
  const totalAmount = itemPrice + protectionFee;

  return {
    itemPrice,
    protectionFee,
    totalAmount,
    feePercentage: 3,
    minimumFee: MINIMUM_PROTECTION_FEE,
  };
}

/**
 * Formats a number into Nigerian Naira string (e.g. ₦45,000)
 */
export function formatNaira(amount: number): string {
  if (isNaN(amount)) return '₦0';
  return `₦${new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}
