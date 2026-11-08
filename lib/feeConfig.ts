/**
 * Single source of truth for platform fee calculation and launch status.
 * All pricing displays, calculators, and marketing examples MUST derive from this configuration.
 */

export const LAUNCH_STATUS = 'launching' as const; // 'launching' | 'live'

export const FEE_CONFIG = {
  RATE: 0.03, // 3%
  MIN: 500, // Minimum fee: ₦500 (the fee is never below ₦500)
  MAX: null as number | null,
  BASE: 'total' as const, // total = item plus delivery (OwnerTodo: pending final owner confirmation)
};

export interface FeeCalculation {
  itemPrice: number;
  deliveryFee: number;
  baseAmount: number;
  feeRate: number;
  feeAmount: number;
  totalAmount: number;
  isMinimumApplied: boolean;
  formattedItemPrice: string;
  formattedDeliveryFee: string;
  formattedBaseAmount: string;
  formattedFeeAmount: string;
  formattedTotalAmount: string;
}

/**
 * Calculates Relyvora protection fee:
 * fee = clamp(FEE_RATE * base, FEE_MIN ?? 0, FEE_MAX ?? Infinity), rounded to the nearest naira.
 */
export function calculateFee(
  itemPriceInput: number | string,
  deliveryFeeInput: number | string = 0
): FeeCalculation {
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

  let rawFee = baseAmount * FEE_CONFIG.RATE;
  let isMinimumApplied = false;

  if (baseAmount > 0 && FEE_CONFIG.MIN !== null && rawFee < FEE_CONFIG.MIN) {
    rawFee = FEE_CONFIG.MIN;
    isMinimumApplied = true;
  }
  if (FEE_CONFIG.MAX !== null && rawFee > FEE_CONFIG.MAX) {
    rawFee = FEE_CONFIG.MAX;
  }

  // If baseAmount is 0, fee is 0
  const feeAmount = baseAmount > 0 ? Math.round(rawFee) : 0;
  const totalAmount = baseAmount + feeAmount;

  return {
    itemPrice,
    deliveryFee,
    baseAmount,
    feeRate: FEE_CONFIG.RATE,
    feeAmount,
    totalAmount,
    isMinimumApplied: baseAmount > 0 && isMinimumApplied,
    formattedItemPrice: formatNaira(itemPrice),
    formattedDeliveryFee: formatNaira(deliveryFee),
    formattedBaseAmount: formatNaira(baseAmount),
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

/** Standard illustrative example: ₦45,000 item + ₦0 delivery => ₦1,350 fee => ₦46,350 total */
export const ILLUSTRATIVE_EXAMPLE = calculateFee(45000, 0);
