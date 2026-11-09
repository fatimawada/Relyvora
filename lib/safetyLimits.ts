/**
 * Safety Limits, Hot Kill Switches & Vendor Allowlist
 * Phase G1.5 Security Hardening
 * 
 * Supports instant database-driven overrides via `system_settings` table,
 * falling back to server environment variables.
 */

import { getServiceSupabase } from './supabaseServer';

export const DEFAULT_MAX_ORDER_NGN = 50000; // ₦50,000 for soft launch
export const DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN = 200000; // ₦200,000 daily volume cap

// In-memory cache for hot database settings (expires every 30 seconds)
let settingsCache: {
  data: Record<string, any>;
  expiresAt: number;
} | null = null;

async function getHotSettings(): Promise<Record<string, any>> {
  const now = Date.now();
  if (settingsCache && now < settingsCache.expiresAt) {
    return settingsCache.data;
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from('system_settings').select('key, value');
    if (!error && data) {
      const map: Record<string, any> = {};
      for (const row of data) {
        map[row.key] = row.value;
      }
      settingsCache = { data: map, expiresAt: now + 30000 };
      return map;
    }
  } catch (err) {
    console.warn('Could not read system_settings from DB, using env defaults:', err);
  }

  return {};
}

/**
 * Checks if checkout is enabled (DB setting overrides environment variable).
 */
export async function isCheckoutEnabledServer(): Promise<boolean> {
  const settings = await getHotSettings();
  if (settings.checkout_enabled !== undefined) {
    return Boolean(settings.checkout_enabled === true || settings.checkout_enabled === 'true');
  }

  const envFlag = (process.env.CHECKOUT_ENABLED || 'true').toLowerCase().trim();
  return envFlag !== 'false' && envFlag !== '0' && envFlag !== 'disabled';
}

/**
 * Synchronous client/server default check.
 */
export function isCheckoutEnabled(): boolean {
  const envFlag = (
    (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_CHECKOUT_ENABLED : process.env.CHECKOUT_ENABLED) ||
    'true'
  ).toLowerCase().trim();

  return envFlag !== 'false' && envFlag !== '0' && envFlag !== 'disabled';
}

/**
 * Maximum allowable transaction amount in NGN (DB setting overrides env).
 */
export async function getMaxOrderNgnServer(): Promise<number> {
  const settings = await getHotSettings();
  if (settings.max_order_ngn !== undefined) {
    const parsed = Number(settings.max_order_ngn);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  const envVal = process.env.MAX_ORDER_NGN;
  if (!envVal) return DEFAULT_MAX_ORDER_NGN;
  const parsed = Number(envVal);
  return isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_ORDER_NGN : parsed;
}

export function getMaxOrderNgn(): number {
  const envVal = (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_MAX_ORDER_NGN : process.env.MAX_ORDER_NGN);
  if (!envVal) return DEFAULT_MAX_ORDER_NGN;
  const parsed = Number(envVal);
  return isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_ORDER_NGN : parsed;
}

/**
 * Checks whether a vendor is allowlisted via the database `vendors.is_allowlisted` column
 * or via the VENDOR_ALLOWLIST environment variable.
 */
export async function isVendorAllowlistedServer(vendorHandle: string): Promise<boolean> {
  const settings = await getHotSettings();
  const allowlistMode = settings.vendor_allowlist_mode ?? true;

  if (!allowlistMode) {
    return true; // Allowlist disabled in settings
  }

  const cleanHandle = (vendorHandle || '').trim().toLowerCase().replace(/^@/, '');

  // 1. Check database vendors table
  try {
    const supabase = getServiceSupabase();
    const { data: vendor } = await supabase
      .from('vendors')
      .select('is_allowlisted')
      .or(`store_name.ilike.%${cleanHandle}%,email.ilike.%${cleanHandle}%`)
      .maybeSingle();

    if (vendor && vendor.is_allowlisted === true) {
      return true;
    }
  } catch (err) {
    console.warn('Error querying vendor allowlist status in DB:', err);
  }

  // 2. Check environment variable allowlist
  const rawEnv = process.env.VENDOR_ALLOWLIST || '';
  if (rawEnv.trim()) {
    const list = rawEnv
      .split(',')
      .map(v => v.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);

    if (list.includes(cleanHandle)) {
      return true;
    }
    return false;
  }

  // Default in development / sandbox if neither configured
  return process.env.PAYMENTS_MODE !== 'live';
}

export interface OrderSafetyValidation {
  allowed: boolean;
  error?: string;
  code?: 'CHECKOUT_DISABLED' | 'AMOUNT_EXCEEDED' | 'VENDOR_NOT_ALLOWLISTED' | 'DAILY_LIMIT_EXCEEDED' | 'VENDOR_NOT_FOUND';
  vendor?: {
    id: string;
    store_name: string;
    email: string;
    is_allowlisted: boolean;
    anchor_deposit_account_id?: string | null;
    daily_volume_ngn: number;
  };
}

/**
 * Resolves a vendor and validates allowlist status and daily volume ceiling.
 */
export async function resolveAndValidateVendorServer(params: {
  vendorIdOrHandle: string;
  totalAmount: number;
}): Promise<OrderSafetyValidation> {
  const supabase = getServiceSupabase();
  const input = (params.vendorIdOrHandle || '').trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);

  let query = supabase.from('vendors').select('*');
  if (isUuid) {
    query = query.eq('id', input);
  } else {
    const cleanHandle = input.toLowerCase().replace(/^@/, '');
    query = query.or(`store_name.ilike.%${cleanHandle}%,email.ilike.%${cleanHandle}%`);
  }

  const { data: vendor, error } = await query.maybeSingle();

  if (error || !vendor) {
    // In sandbox mode without a vendor seeded in DB, fallback gracefully for demo handles
    if (process.env.PAYMENTS_MODE !== 'live') {
      return {
        allowed: true,
        vendor: {
          id: '00000000-0000-0000-0000-000000000001',
          store_name: input,
          email: `${input.replace(/^@/, '')}@sandbox.relyvora.com`,
          is_allowlisted: true,
          daily_volume_ngn: 0,
        },
      };
    }
    return {
      allowed: false,
      code: 'VENDOR_NOT_FOUND',
      error: `Vendor account for "${input}" could not be verified on the server.`,
    };
  }

  // Check allowlist flag
  const settings = await getHotSettings();
  const allowlistMode = settings.vendor_allowlist_mode ?? true;
  if (allowlistMode && !vendor.is_allowlisted) {
    return {
      allowed: false,
      code: 'VENDOR_NOT_ALLOWLISTED',
      error: `Vendor "${vendor.store_name}" is pending allowlist verification for the invite-only launch.`,
    };
  }

  // Check 24-hour daily volume reset
  const maxDailyLimit = Number(settings.max_daily_vendor_volume_ngn) || DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN;
  const now = new Date();
  const resetAt = vendor.daily_volume_reset_at ? new Date(vendor.daily_volume_reset_at) : new Date(0);
  const isExpired = now.getTime() - resetAt.getTime() > 24 * 60 * 60 * 1000;

  const currentDailyVolume = isExpired ? 0 : (Number(vendor.daily_volume_ngn) || 0);

  if (currentDailyVolume + params.totalAmount > maxDailyLimit) {
    return {
      allowed: false,
      code: 'DAILY_LIMIT_EXCEEDED',
      error: `Order total of ₦${params.totalAmount.toLocaleString()} exceeds your remaining daily volume limit of ₦${Math.max(0, maxDailyLimit - currentDailyVolume).toLocaleString()} (24-hour cap: ₦${maxDailyLimit.toLocaleString()}).`,
    };
  }

  return {
    allowed: true,
    vendor: {
      id: vendor.id,
      store_name: vendor.store_name,
      email: vendor.email,
      is_allowlisted: vendor.is_allowlisted,
      anchor_deposit_account_id: vendor.anchor_deposit_account_id,
      daily_volume_ngn: currentDailyVolume,
    },
  };
}

/**
 * Comprehensive server-side order validation called before link creation.
 */
export async function validateOrderCreationServer(params: {
  vendorHandle: string;
  totalAmount: number;
}): Promise<OrderSafetyValidation> {
  const enabled = await isCheckoutEnabledServer();
  if (!enabled) {
    return {
      allowed: false,
      code: 'CHECKOUT_DISABLED',
      error: 'Checkout and link creation is temporarily suspended for scheduled maintenance.',
    };
  }

  const maxOrder = await getMaxOrderNgnServer();
  if (params.totalAmount > maxOrder) {
    return {
      allowed: false,
      code: 'AMOUNT_EXCEEDED',
      error: `Order total of ₦${params.totalAmount.toLocaleString()} exceeds the maximum allowable launch limit of ₦${maxOrder.toLocaleString()}. Please contact support for high-value orders.`,
    };
  }

  return resolveAndValidateVendorServer({
    vendorIdOrHandle: params.vendorHandle,
    totalAmount: params.totalAmount,
  });
}
