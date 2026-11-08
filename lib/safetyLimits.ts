/**
 * Safety Limits, Kill Switches & Vendor Allowlist
 * Governed by environment variables for Phase G2 operations.
 */

export const DEFAULT_MAX_ORDER_NGN = 50000; // ₦50,000 for soft launch

/**
 * Global kill switch to instantly halt link creation and checkout.
 * Set CHECKOUT_ENABLED="false" in environment variables to trigger.
 */
export function isCheckoutEnabled(): boolean {
  const flag = (
    process.env.NEXT_PUBLIC_CHECKOUT_ENABLED ||
    process.env.CHECKOUT_ENABLED ||
    'true'
  ).toLowerCase().trim();

  return flag !== 'false' && flag !== '0' && flag !== 'disabled';
}

/**
 * Maximum allowable transaction amount in NGN during launch.
 */
export function getMaxOrderNgn(): number {
  const envVal = process.env.NEXT_PUBLIC_MAX_ORDER_NGN || process.env.MAX_ORDER_NGN;
  if (!envVal) return DEFAULT_MAX_ORDER_NGN;
  const parsed = Number(envVal);
  return isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_ORDER_NGN : parsed;
}

/**
 * Parses comma-separated vendor allowlist for invite-only launch.
 * If empty or undefined, all vendors are permitted.
 */
export function getVendorAllowlist(): string[] {
  const raw = process.env.VENDOR_ALLOWLIST || process.env.NEXT_PUBLIC_VENDOR_ALLOWLIST || '';
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map(v => v.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

/**
 * Checks whether a vendor handle is on the launch allowlist.
 */
export function isVendorAllowlisted(vendorHandle: string): boolean {
  const allowlist = getVendorAllowlist();
  if (allowlist.length === 0) {
    // If no allowlist is configured, all vendors are permitted
    return true;
  }
  const cleanHandle = (vendorHandle || '').trim().toLowerCase().replace(/^@/, '');
  return allowlist.includes(cleanHandle);
}

export interface OrderSafetyValidation {
  allowed: boolean;
  error?: string;
  code?: 'CHECKOUT_DISABLED' | 'AMOUNT_EXCEEDED' | 'VENDOR_NOT_ALLOWLISTED';
}

/**
 * Comprehensive validation function called on order creation.
 */
export function validateOrderCreation(params: {
  vendorHandle: string;
  totalAmount: number;
}): OrderSafetyValidation {
  if (!isCheckoutEnabled()) {
    return {
      allowed: false,
      code: 'CHECKOUT_DISABLED',
      error: 'Checkout and escrow link creation is temporarily suspended for scheduled maintenance.',
    };
  }

  const maxOrder = getMaxOrderNgn();
  if (params.totalAmount > maxOrder) {
    return {
      allowed: false,
      code: 'AMOUNT_EXCEEDED',
      error: `Order total of ₦${params.totalAmount.toLocaleString()} exceeds the maximum allowable launch limit of ₦${maxOrder.toLocaleString()}. Please contact support for high-value orders.`,
    };
  }

  if (!isVendorAllowlisted(params.vendorHandle)) {
    return {
      allowed: false,
      code: 'VENDOR_NOT_ALLOWLISTED',
      error: `Vendor handle "${params.vendorHandle}" is not on the invite-only launch allowlist. Please request access from the Relyvora team.`,
    };
  }

  return { allowed: true };
}
