import { PricingBreakdown } from './types';

export const MINIMUM_PROTECTION_FEE = 500;
export const PROTECTION_FEE_RATE = 0.03;

/**
 * Single standardized fee calculation engine:
 * fee = max(round(totalPaid * 0.03), 500)
 * 
 * @param itemPriceInput Price of the item in NGN
 * @param deliveryFeeInput Optional courier/delivery fee in NGN (defaults to 0)
 */
export function calculatePricing(
  itemPriceInput: number | string,
  deliveryFeeInput: number | string = 0
): PricingBreakdown {
  const parseNum = (val: number | string) => {
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || 0;
    }
    return typeof val === 'number' && !isNaN(val) ? val : 0;
  };

  const itemPrice = Math.max(0, parseNum(itemPriceInput));
  const deliveryFee = Math.max(0, parseNum(deliveryFeeInput));
  const baseAmount = itemPrice + deliveryFee;
  
  if (baseAmount <= 0) {
    return {
      itemPrice: 0,
      deliveryFee: 0,
      protectionFee: 0,
      totalAmount: 0,
      feePercentage: 3,
      minimumFee: MINIMUM_PROTECTION_FEE,
    };
  }

  // Calculate 3% fee with strict ₦500 floor
  const calculatedFee = Math.round(baseAmount * PROTECTION_FEE_RATE);
  const protectionFee = Math.max(MINIMUM_PROTECTION_FEE, calculatedFee);
  const totalAmount = baseAmount + protectionFee;

  return {
    itemPrice: baseAmount, // Base goods & delivery
    deliveryFee,
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
