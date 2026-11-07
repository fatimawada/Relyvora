/**
 * Single source of truth for platform fee calculation and launch status.
 * All pricing displays, calculators, and marketing examples MUST derive from this configuration.
 */

export const LAUNCH_STATUS = 'launching' as const; // 'launching' | 'live'

export const FEE_CONFIG = {
  RATE: 0.03, // Flat 3%
  BASE: 'item' as const, // Placeholder: item price only (pending owner confirmation on whether delivery is included)
  MIN: null, // Placeholder: no minimum fee confirmed yet (owner to confirm any floor amount)
};

export interface FeeCalculation {
  itemPrice: number;
  feeRate: number;
  feeAmount: number;
  totalAmount: number;
  formattedItemPrice: string;
  formattedFeeAmount: string;
  formattedTotalAmount: string;
}

export function calculateFee(itemPriceInput: number | string): FeeCalculation {
  const price = typeof itemPriceInput === 'string' ? parseFloat(itemPriceInput) || 0 : itemPriceInput;
  const validPrice = Math.max(0, price);
  const feeAmount = Math.round(validPrice * FEE_CONFIG.RATE);
  const totalAmount = validPrice + feeAmount;

  return {
    itemPrice: validPrice,
    feeRate: FEE_CONFIG.RATE,
    feeAmount,
    totalAmount,
    formattedItemPrice: formatNaira(validPrice),
    formattedFeeAmount: formatNaira(feeAmount),
    formattedTotalAmount: formatNaira(totalAmount),
  };
}

export function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Standard illustrative example: ₦45,000 item + ₦1,350 fee = ₦46,350 total */
export const ILLUSTRATIVE_EXAMPLE = calculateFee(45000);
