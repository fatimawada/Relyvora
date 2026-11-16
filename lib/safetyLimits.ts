/**
 * Safety Limits, Hot Kill Switches & Vendor Allowlist
 * Phase G1.5 Security Hardening
 * 
 * Supports instant database-driven overrides via `system_settings` table,
 * falling back to server environment variables.
 */

import { getServiceSupabase } from './supabaseServer';

export const DEFAULT_MAX_ORDER_NGN: number | null = null;
export const DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN: number | null = null;
export const DEFAULT_TIER1_ORDER_LIMIT_NGN = 2500000;
export const DEFAULT_TIER_UPGRADE_THRESHOLD = 5;

export type VendorTierName = 'NEW' | 'ESTABLISHED' | 'TRUSTED';

export interface TierRuleConfig {
  per_order_cap_ngn: number | null;
  daily_volume_cap_ngn: number | null;
}

export interface TierConfig {
  tiers: Record<VendorTierName, TierRuleConfig>;
  promotion: {
    established_min_completed_orders: number;
    established_min_days_since_first_order: number;
    established_max_disputes: number;
  };
}

export interface PayoutSafetyConfig {
  name_match_min_score: number;
  settlement_change_wait_hours: number;
  require_whatsapp_confirm_on_bank_change: boolean;
}

export interface RiskEngineConfig {
  review_hold_threshold: number;
  block_threshold: number;
  amount_review_threshold_ngn: number;
  near_cap_ratio_min: number;
  velocity_window_minutes: number;
  velocity_max_orders: number;
  repeat_pair_window_hours: number;
  repeat_pair_max_orders: number;
  spike_multiplier: number;
  spike_min_baseline_ngn: number;
  ip_hash_retention_hours: number;
  weights: Record<string, number>;
}

export interface CoolingWindowConfig {
  hours_by_tier: Record<VendorTierName, number>;
  high_value_cooling_hours?: number;
  notify_buyer_on_code_use: boolean;
}

export interface AdminSafetyConfig {
  session_max_age_minutes: number;
  high_value_confirm_threshold_ngn: number;
  require_typed_confirmation: boolean;
  alert_on_every_admin_action: boolean;
}

export const DEFAULT_TIER_CONFIG: TierConfig = {
  tiers: {
    NEW: { per_order_cap_ngn: 2500000, daily_volume_cap_ngn: 5000000 },
    ESTABLISHED: { per_order_cap_ngn: 10000000, daily_volume_cap_ngn: 20000000 },
    TRUSTED: { per_order_cap_ngn: null, daily_volume_cap_ngn: null },
  },
  promotion: {
    established_min_completed_orders: 5,
    established_min_days_since_first_order: 14,
    established_max_disputes: 0,
  },
};

export const DEFAULT_PAYOUT_SAFETY_CONFIG: PayoutSafetyConfig = {
  name_match_min_score: 0.7,
  settlement_change_wait_hours: 48,
  require_whatsapp_confirm_on_bank_change: true,
};

export const DEFAULT_RISK_ENGINE_CONFIG: RiskEngineConfig = {
  review_hold_threshold: 3,
  block_threshold: 6,
  amount_review_threshold_ngn: 500000,
  near_cap_ratio_min: 0.85,
  velocity_window_minutes: 60,
  velocity_max_orders: 5,
  repeat_pair_window_hours: 24,
  repeat_pair_max_orders: 3,
  spike_multiplier: 3,
  spike_min_baseline_ngn: 50000,
  ip_hash_retention_hours: 72,
  weights: {
    ABOVE_REVIEW_AMOUNT: 2,
    HIGH_VELOCITY_VENDOR: 2,
    REPEATED_BUYER_VENDOR_PAIR: 2,
    REPEATED_NEAR_CAP_ORDER: 2,
    SUDDEN_AMOUNT_SPIKE: 2,
    SHARED_DEVICE_OR_IP: 3,
    MISSING_DEPOSIT_SENDER_NAME: 3,
    DEPOSIT_EXCEEDS_TIER_CAP: 3,
    SETTLEMENT_HOLD_ACTIVE: 3,
    SHARED_PHONE_VENDOR_BUYER: 6,
    SELF_DEALING_NAME_MATCH: 6,
    SELF_DEALING_ACCOUNT_MATCH: 6,
  },
};

export const DEFAULT_COOLING_WINDOW_CONFIG: CoolingWindowConfig = {
  hours_by_tier: {
    NEW: 2,
    ESTABLISHED: 0,
    TRUSTED: 0,
  },
  high_value_cooling_hours: 2,
  notify_buyer_on_code_use: true,
};

export const DEFAULT_ADMIN_SAFETY_CONFIG: AdminSafetyConfig = {
  session_max_age_minutes: 15,
  high_value_confirm_threshold_ngn: 500000,
  require_typed_confirmation: true,
  alert_on_every_admin_action: true,
};

// In-memory cache for hot database settings (expires every 30 seconds)
let settingsCache: {
  data: Record<string, any>;
  expiresAt: number;
} | null = null;

export function clearSafetySettingsCache(): void {
  settingsCache = null;
}

function parseNullableLimit(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'none' || trimmed === 'unlimited') {
      return null;
    }
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseBooleanSetting(raw: unknown, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null) return defaultValue;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'enabled') return true;
    if (lower === 'false' || lower === '0' || lower === 'disabled') return false;
  }
  return Boolean(raw);
}

export async function getHotSettings(): Promise<Record<string, any>> {
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

export async function getTier1OrderLimitNgnServer(): Promise<number | null> {
  const settings = await getHotSettings();
  if (settings.tier1_order_limit_ngn !== undefined) {
    if (settings.tier1_order_limit_ngn === null || settings.tier1_order_limit_ngn === 'null') {
      return null;
    }
    return parseNullableLimit(settings.tier1_order_limit_ngn);
  }
  const tierRaw = settings.tier_config?.tiers?.NEW?.per_order_cap_ngn;
  if (tierRaw !== undefined) {
    return parseNullableLimit(tierRaw);
  }
  return DEFAULT_TIER1_ORDER_LIMIT_NGN;
}

export async function getTierUpgradeThresholdServer(): Promise<number> {
  const settings = await getHotSettings();
  if (settings.tier_upgrade_threshold !== undefined && settings.tier_upgrade_threshold !== null) {
    const parsed = Number(settings.tier_upgrade_threshold);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  const promoRaw = settings.tier_config?.promotion?.established_min_completed_orders;
  if (Number.isFinite(Number(promoRaw)) && Number(promoRaw) > 0) {
    return Math.floor(Number(promoRaw));
  }
  return DEFAULT_TIER_UPGRADE_THRESHOLD;
}

export async function getTierConfigServer(): Promise<TierConfig> {
  const settings = await getHotSettings();
  const raw = settings.tier_config && typeof settings.tier_config === 'object' ? settings.tier_config : {};
  const rawTiers = raw.tiers && typeof raw.tiers === 'object' ? raw.tiers : {};
  const rawPromo = raw.promotion && typeof raw.promotion === 'object' ? raw.promotion : {};
  const tier1Fallback =
    settings.tier1_order_limit_ngn !== undefined
      ? parseNullableLimit(settings.tier1_order_limit_ngn)
      : DEFAULT_TIER_CONFIG.tiers.NEW.per_order_cap_ngn;
  const thresholdFallback = Number.isFinite(Number(settings.tier_upgrade_threshold))
    ? Number(settings.tier_upgrade_threshold)
    : DEFAULT_TIER_CONFIG.promotion.established_min_completed_orders;

  return {
    tiers: {
      NEW: {
        per_order_cap_ngn:
          rawTiers.NEW?.per_order_cap_ngn !== undefined
            ? parseNullableLimit(rawTiers.NEW.per_order_cap_ngn)
            : tier1Fallback,
        daily_volume_cap_ngn:
          rawTiers.NEW?.daily_volume_cap_ngn !== undefined
            ? parseNullableLimit(rawTiers.NEW.daily_volume_cap_ngn)
            : DEFAULT_TIER_CONFIG.tiers.NEW.daily_volume_cap_ngn,
      },
      ESTABLISHED: {
        per_order_cap_ngn:
          rawTiers.ESTABLISHED?.per_order_cap_ngn !== undefined
            ? parseNullableLimit(rawTiers.ESTABLISHED.per_order_cap_ngn)
            : DEFAULT_TIER_CONFIG.tiers.ESTABLISHED.per_order_cap_ngn,
        daily_volume_cap_ngn:
          rawTiers.ESTABLISHED?.daily_volume_cap_ngn !== undefined
            ? parseNullableLimit(rawTiers.ESTABLISHED.daily_volume_cap_ngn)
            : DEFAULT_TIER_CONFIG.tiers.ESTABLISHED.daily_volume_cap_ngn,
      },
      TRUSTED: {
        per_order_cap_ngn:
          rawTiers.TRUSTED?.per_order_cap_ngn !== undefined
            ? parseNullableLimit(rawTiers.TRUSTED.per_order_cap_ngn)
            : DEFAULT_TIER_CONFIG.tiers.TRUSTED.per_order_cap_ngn,
        daily_volume_cap_ngn:
          rawTiers.TRUSTED?.daily_volume_cap_ngn !== undefined
            ? parseNullableLimit(rawTiers.TRUSTED.daily_volume_cap_ngn)
            : DEFAULT_TIER_CONFIG.tiers.TRUSTED.daily_volume_cap_ngn,
      },
    },
    promotion: {
      established_min_completed_orders:
        Number.isFinite(Number(rawPromo.established_min_completed_orders))
          ? Number(rawPromo.established_min_completed_orders)
          : thresholdFallback,
      established_min_days_since_first_order:
        Number.isFinite(Number(rawPromo.established_min_days_since_first_order))
          ? Number(rawPromo.established_min_days_since_first_order)
          : DEFAULT_TIER_CONFIG.promotion.established_min_days_since_first_order,
      established_max_disputes:
        Number.isFinite(Number(rawPromo.established_max_disputes))
          ? Number(rawPromo.established_max_disputes)
          : DEFAULT_TIER_CONFIG.promotion.established_max_disputes,
    },
  };
}

export async function getPayoutSafetyConfigServer(): Promise<PayoutSafetyConfig> {
  const settings = await getHotSettings();
  const raw =
    settings.payout_safety_config && typeof settings.payout_safety_config === 'object'
      ? settings.payout_safety_config
      : {};
  return {
    name_match_min_score:
      Number.isFinite(Number(raw.name_match_min_score))
        ? Number(raw.name_match_min_score)
        : DEFAULT_PAYOUT_SAFETY_CONFIG.name_match_min_score,
    settlement_change_wait_hours:
      Number.isFinite(Number(raw.settlement_change_wait_hours))
        ? Number(raw.settlement_change_wait_hours)
        : DEFAULT_PAYOUT_SAFETY_CONFIG.settlement_change_wait_hours,
    require_whatsapp_confirm_on_bank_change: parseBooleanSetting(
      raw.require_whatsapp_confirm_on_bank_change,
      DEFAULT_PAYOUT_SAFETY_CONFIG.require_whatsapp_confirm_on_bank_change
    ),
  };
}

export async function getRiskEngineConfigServer(): Promise<RiskEngineConfig> {
  const settings = await getHotSettings();
  const raw =
    settings.risk_engine_config && typeof settings.risk_engine_config === 'object'
      ? settings.risk_engine_config
      : {};
  const rawWeights = raw.weights && typeof raw.weights === 'object' ? raw.weights : {};
  const mergedWeights: Record<string, number> = { ...DEFAULT_RISK_ENGINE_CONFIG.weights };
  for (const [k, v] of Object.entries(rawWeights)) {
    const num = Number(v);
    if (Number.isFinite(num) && num >= 0) {
      mergedWeights[k] = num;
    }
  }
  return {
    review_hold_threshold: Number.isFinite(Number(raw.review_hold_threshold))
      ? Number(raw.review_hold_threshold)
      : DEFAULT_RISK_ENGINE_CONFIG.review_hold_threshold,
    block_threshold: Number.isFinite(Number(raw.block_threshold))
      ? Number(raw.block_threshold)
      : DEFAULT_RISK_ENGINE_CONFIG.block_threshold,
    amount_review_threshold_ngn: Number.isFinite(Number(raw.amount_review_threshold_ngn))
      ? Number(raw.amount_review_threshold_ngn)
      : DEFAULT_RISK_ENGINE_CONFIG.amount_review_threshold_ngn,
    near_cap_ratio_min: Number.isFinite(Number(raw.near_cap_ratio_min))
      ? Number(raw.near_cap_ratio_min)
      : DEFAULT_RISK_ENGINE_CONFIG.near_cap_ratio_min,
    velocity_window_minutes: Number.isFinite(Number(raw.velocity_window_minutes))
      ? Number(raw.velocity_window_minutes)
      : DEFAULT_RISK_ENGINE_CONFIG.velocity_window_minutes,
    velocity_max_orders: Number.isFinite(Number(raw.velocity_max_orders))
      ? Number(raw.velocity_max_orders)
      : DEFAULT_RISK_ENGINE_CONFIG.velocity_max_orders,
    repeat_pair_window_hours: Number.isFinite(Number(raw.repeat_pair_window_hours))
      ? Number(raw.repeat_pair_window_hours)
      : DEFAULT_RISK_ENGINE_CONFIG.repeat_pair_window_hours,
    repeat_pair_max_orders: Number.isFinite(Number(raw.repeat_pair_max_orders))
      ? Number(raw.repeat_pair_max_orders)
      : DEFAULT_RISK_ENGINE_CONFIG.repeat_pair_max_orders,
    spike_multiplier: Number.isFinite(Number(raw.spike_multiplier))
      ? Number(raw.spike_multiplier)
      : DEFAULT_RISK_ENGINE_CONFIG.spike_multiplier,
    spike_min_baseline_ngn: Number.isFinite(Number(raw.spike_min_baseline_ngn))
      ? Number(raw.spike_min_baseline_ngn)
      : DEFAULT_RISK_ENGINE_CONFIG.spike_min_baseline_ngn,
    ip_hash_retention_hours: Number.isFinite(Number(raw.ip_hash_retention_hours))
      ? Number(raw.ip_hash_retention_hours)
      : DEFAULT_RISK_ENGINE_CONFIG.ip_hash_retention_hours,
    weights: mergedWeights,
  };
}

export async function getCoolingWindowConfigServer(): Promise<CoolingWindowConfig> {
  const settings = await getHotSettings();
  const raw =
    settings.cooling_window_config && typeof settings.cooling_window_config === 'object'
      ? settings.cooling_window_config
      : {};
  const rawHours = raw.hours_by_tier && typeof raw.hours_by_tier === 'object' ? raw.hours_by_tier : {};
  return {
    hours_by_tier: {
      NEW: Number.isFinite(Number(rawHours.NEW))
        ? Number(rawHours.NEW)
        : DEFAULT_COOLING_WINDOW_CONFIG.hours_by_tier.NEW,
      ESTABLISHED: Number.isFinite(Number(rawHours.ESTABLISHED))
        ? Number(rawHours.ESTABLISHED)
        : DEFAULT_COOLING_WINDOW_CONFIG.hours_by_tier.ESTABLISHED,
      TRUSTED: Number.isFinite(Number(rawHours.TRUSTED))
        ? Number(rawHours.TRUSTED)
        : DEFAULT_COOLING_WINDOW_CONFIG.hours_by_tier.TRUSTED,
    },
    high_value_cooling_hours: Number.isFinite(Number(raw.high_value_cooling_hours))
      ? Number(raw.high_value_cooling_hours)
      : DEFAULT_COOLING_WINDOW_CONFIG.high_value_cooling_hours,
    notify_buyer_on_code_use: parseBooleanSetting(
      raw.notify_buyer_on_code_use,
      DEFAULT_COOLING_WINDOW_CONFIG.notify_buyer_on_code_use
    ),
  };
}

export async function getAdminSafetyConfigServer(): Promise<AdminSafetyConfig> {
  const settings = await getHotSettings();
  const raw =
    settings.admin_safety_config && typeof settings.admin_safety_config === 'object'
      ? settings.admin_safety_config
      : {};
  return {
    session_max_age_minutes: Number.isFinite(Number(raw.session_max_age_minutes))
      ? Number(raw.session_max_age_minutes)
      : DEFAULT_ADMIN_SAFETY_CONFIG.session_max_age_minutes,
    high_value_confirm_threshold_ngn: Number.isFinite(Number(raw.high_value_confirm_threshold_ngn))
      ? Number(raw.high_value_confirm_threshold_ngn)
      : DEFAULT_ADMIN_SAFETY_CONFIG.high_value_confirm_threshold_ngn,
    require_typed_confirmation: parseBooleanSetting(
      raw.require_typed_confirmation,
      DEFAULT_ADMIN_SAFETY_CONFIG.require_typed_confirmation
    ),
    alert_on_every_admin_action: parseBooleanSetting(
      raw.alert_on_every_admin_action,
      DEFAULT_ADMIN_SAFETY_CONFIG.alert_on_every_admin_action
    ),
  };
}

export async function isPayoutsEnabledServer(): Promise<boolean> {
  const settings = await getHotSettings();
  if (settings.payouts_enabled !== undefined) {
    return parseBooleanSetting(settings.payouts_enabled, true);
  }
  const envFlag = (process.env.PAYOUTS_ENABLED || 'true').toLowerCase().trim();
  return envFlag !== 'false' && envFlag !== '0' && envFlag !== 'disabled';
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
 * Returns null when uncapped.
 */
export async function getMaxOrderNgnServer(): Promise<number | null> {
  const settings = await getHotSettings();
  if (settings.max_order_ngn !== undefined && settings.max_order_ngn !== null) {
    const dbVal = parseNullableLimit(settings.max_order_ngn);
    if (dbVal !== null) return dbVal;
  }

  const envVal = process.env.MAX_ORDER_NGN ?? process.env.NEXT_PUBLIC_MAX_ORDER_NGN;
  if (envVal !== undefined) {
    const parsed = parseNullableLimit(envVal);
    if (parsed !== null) return parsed;
  }

  return DEFAULT_MAX_ORDER_NGN;
}

export function getMaxOrderNgn(): number | null {
  const envVal =
    typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_MAX_ORDER_NGN : process.env.MAX_ORDER_NGN;
  if (envVal !== undefined) {
    const parsed = parseNullableLimit(envVal);
    if (parsed !== null) return parsed;
  }
  return DEFAULT_MAX_ORDER_NGN;
}

/**
 * Maximum daily volume per vendor in NGN (DB setting overrides env).
 * Returns null when uncapped.
 */
export async function getMaxDailyVendorVolumeNgnServer(): Promise<number | null> {
  const settings = await getHotSettings();
  if (settings.max_daily_vendor_volume_ngn !== undefined && settings.max_daily_vendor_volume_ngn !== null) {
    const dbVal = parseNullableLimit(settings.max_daily_vendor_volume_ngn);
    if (dbVal !== null) return dbVal;
  }

  const envVal = process.env.MAX_DAILY_VENDOR_VOLUME_NGN;
  if (envVal !== undefined) {
    const parsed = parseNullableLimit(envVal);
    if (parsed !== null) return parsed;
  }

  return DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN;
}

export function computeVendorEffectiveTierLimits(params: {
  tier?: string | null;
  capOverrideUnlimited?: boolean | null;
  successfulSalesCount?: number | null;
  completedOrdersCount?: number | null;
  disputesCount?: number | null;
  tierUpgradeThreshold?: number | null;
  tier1OrderLimitNgn?: number | null;
  tierConfig: TierConfig;
  globalMaxOrderNgn: number | null;
  globalMaxDailyNgn: number | null;
}): {
  tier: VendorTierName;
  perOrderCapNgn: number | null;
  dailyVolumeCapNgn: number | null;
  capOverrideUnlimited: boolean;
} {
  const rawTier = String(params.tier || 'NEW').toUpperCase();
  const tier: VendorTierName =
    rawTier === 'TRUSTED' || rawTier === 'ESTABLISHED' ? rawTier : 'NEW';
  const capOverrideUnlimited = Boolean(params.capOverrideUnlimited);

  // Only TRUSTED tier or explicit admin cap_override_unlimited lifts tier caps completely.
  // Sales count alone NEVER removes caps; NEW -> ESTABLISHED requires sales + days + 0 disputes.
  if (capOverrideUnlimited || tier === 'TRUSTED') {
    return {
      tier,
      perOrderCapNgn: params.globalMaxOrderNgn,
      dailyVolumeCapNgn: params.globalMaxDailyNgn,
      capOverrideUnlimited,
    };
  }

  const rule = params.tierConfig.tiers[tier] || params.tierConfig.tiers.NEW;
  const baseOrderCap =
    rule.per_order_cap_ngn !== undefined
      ? rule.per_order_cap_ngn
      : tier === 'NEW' && params.tier1OrderLimitNgn !== undefined
        ? params.tier1OrderLimitNgn
        : null;

  const pickTighter = (a: number | null, b: number | null): number | null => {
    if (a !== null && b !== null) return Math.min(a, b);
    return a ?? b ?? null;
  };

  return {
    tier,
    perOrderCapNgn: pickTighter(baseOrderCap, params.globalMaxOrderNgn),
    dailyVolumeCapNgn: pickTighter(rule.daily_volume_cap_ngn, params.globalMaxDailyNgn),
    capOverrideUnlimited: false,
  };
}

/**
 * Checks whether a vendor is allowlisted when vendor_allowlist_mode = true.
 * Default for vendor_allowlist_mode is false (open signup).
 */
export async function isVendorAllowlistedServer(vendorHandle: string): Promise<boolean> {
  const settings = await getHotSettings();
  const allowlistMode =
    settings.vendor_allowlist_mode !== undefined
      ? parseBooleanSetting(settings.vendor_allowlist_mode, false)
      : false;

  if (!allowlistMode) {
    return true;
  }

  const cleanHandle = (vendorHandle || '').trim().toLowerCase().replace(/^@/, '');

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

  return false;
}

export interface OrderSafetyValidation {
  allowed: boolean;
  error?: string;
  code?:
    | 'CHECKOUT_DISABLED'
    | 'AMOUNT_EXCEEDED'
    | 'TIER_ORDER_CAP_EXCEEDED'
    | 'VENDOR_NOT_ALLOWLISTED'
    | 'VENDOR_KYC_REQUIRED'
    | 'VENDOR_SUSPENDED'
    | 'PAYOUT_ACCOUNT_UNVERIFIED'
    | 'DAILY_LIMIT_EXCEEDED'
    | 'VENDOR_NOT_FOUND';
  effectivePerOrderCapNgn?: number | null;
  effectiveDailyCapNgn?: number | null;
  vendor?: {
    id: string;
    store_name: string;
    email: string;
    kyc_status?: string;
    is_allowlisted: boolean;
    is_suspended?: boolean;
    tier?: VendorTierName;
    cap_override_unlimited?: boolean;
    phone_number?: string | null;
    phone_verified?: boolean;
    phone_hash?: string | null;
    legal_first_name?: string | null;
    legal_last_name?: string | null;
    settlement_bank_code?: string | null;
    settlement_account_number?: string | null;
    settlement_account_name?: string | null;
    payout_account_verified?: boolean;
    settlement_account_name_matched?: boolean;
    payout_hold_until?: string | null;
    anchor_deposit_account_id?: string | null;
    daily_volume_ngn: number;
    successful_sales_count?: number;
    completed_orders_count?: number;
    disputes_count?: number;
    first_order_at?: string | null;
  };
}

/**
 * Resolves a vendor and validates allowlist switch, KYC, payout account verification,
 * tier per-order cap, and daily volume ceiling.
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

  const { data: dbVendor, error } = await query.maybeSingle();
  const settings = await getHotSettings();
  const allowlistMode =
    settings.vendor_allowlist_mode !== undefined
      ? parseBooleanSetting(settings.vendor_allowlist_mode, false)
      : false;

  if (error || !dbVendor) {
    // Preserve sandbox handle demo mode only when allowlist switch is off and input is a non-UUID handle
    if (process.env.PAYMENTS_MODE !== 'live' && !isUuid && !allowlistMode) {
      return {
        allowed: true,
        vendor: {
          id: '00000000-0000-0000-0000-000000000001',
          store_name: input,
          email: `${input.replace(/^@/, '')}@sandbox.relyvora.com`,
          kyc_status: 'verified',
          is_allowlisted: true,
          tier: 'NEW',
          payout_account_verified: true,
          settlement_account_name_matched: true,
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

  const overlay =
    ((globalThis as any).__relyvoraVendorSafetyOverlay as Map<string, any> | undefined)?.get(
      dbVendor.id
    ) || {};
  const definedDbEntries = Object.entries(dbVendor).filter(([, v]) => v !== undefined);
  const vendor: Record<string, any> = {
    ...Object.fromEntries(definedDbEntries),
    ...overlay,
  };

  // Allowlist instant kill-switch (only enforced when vendor_allowlist_mode = true)
  if (allowlistMode && !vendor.is_allowlisted) {
    return {
      allowed: false,
      code: 'VENDOR_NOT_ALLOWLISTED',
      error: `Vendor "${vendor.store_name}" is not on the active allowlist while allowlist mode is enabled.`,
    };
  }

  // Open-signup gate 0: Suspended vendors cannot create payment links
  if (vendor.is_suspended === true) {
    return {
      allowed: false,
      code: 'VENDOR_SUSPENDED',
      error: `Vendor "${vendor.store_name}" is currently suspended pending compliance review (${vendor.suspension_reason || 'policy violation'}).`,
    };
  }

  // Open-signup gate 1: Anchor KYC verification must be verified server-side
  if (vendor.kyc_status !== 'verified') {
    return {
      allowed: false,
      code: 'VENDOR_KYC_REQUIRED',
      error: `Vendor "${vendor.store_name}" must complete Anchor KYC verification (current status: ${vendor.kyc_status || 'pending'}) before creating payment links.`,
    };
  }

  // Open-signup gate 2: Settlement payout account + name-match verification must pass
  const hasPayoutColumns =
    typeof vendor.payout_account_verified === 'boolean' ||
    typeof vendor.settlement_account_name_matched === 'boolean';
  const payoutVerified = hasPayoutColumns
    ? Boolean(vendor.payout_account_verified) && Boolean(vendor.settlement_account_name_matched)
    : Boolean(vendor.settlement_account_number && vendor.settlement_bank_code);

  if (!vendor.anchor_deposit_account_id || !vendor.settlement_account_number || !payoutVerified) {
    return {
      allowed: false,
      code: 'PAYOUT_ACCOUNT_UNVERIFIED',
      error: `Vendor "${vendor.store_name}" does not have a verified settlement payout account matching their KYC legal name.`,
    };
  }

  const tierConfig = await getTierConfigServer();
  const globalMaxOrder = await getMaxOrderNgnServer();
  const globalMaxDaily = await getMaxDailyVendorVolumeNgnServer();
  const tierUpgradeThreshold = await getTierUpgradeThresholdServer();
  const tier1OrderLimitNgn = await getTier1OrderLimitNgnServer();

  const effective = computeVendorEffectiveTierLimits({
    tier: vendor.tier,
    capOverrideUnlimited: vendor.cap_override_unlimited,
    successfulSalesCount: vendor.successful_sales_count,
    completedOrdersCount: vendor.completed_orders_count,
    disputesCount: vendor.disputes_count,
    tierUpgradeThreshold,
    tier1OrderLimitNgn,
    tierConfig,
    globalMaxOrderNgn: globalMaxOrder,
    globalMaxDailyNgn: globalMaxDaily,
  });

  if (effective.perOrderCapNgn !== null && params.totalAmount > effective.perOrderCapNgn) {
    return {
      allowed: false,
      code: 'TIER_ORDER_CAP_EXCEEDED',
      effectivePerOrderCapNgn: effective.perOrderCapNgn,
      effectiveDailyCapNgn: effective.dailyVolumeCapNgn,
      error: `Order total of ₦${params.totalAmount.toLocaleString()} exceeds the ₦${effective.perOrderCapNgn.toLocaleString()} per-order limit for vendor tier ${effective.tier}.`,
    };
  }

  const now = new Date();
  const startOfUtcDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const resetAt = vendor.daily_volume_reset_at ? new Date(vendor.daily_volume_reset_at) : new Date(0);
  const isExpired = now.getTime() - resetAt.getTime() > 24 * 60 * 60 * 1000;
  const storedDailyVolume = isExpired ? 0 : (Number(vendor.daily_volume_ngn) || 0);
  const effectiveWindowStartIso = new Date(
    Math.max(startOfUtcDayMs, resetAt.getTime())
  ).toISOString();

  let txDailyVolume = 0;
  if (effective.dailyVolumeCapNgn !== null) {
    try {
      const { data: todayTxRows, error: todayTxErr } = await supabase
        .from('transactions')
        .select('total_amount, status, resolution_notes')
        .eq('vendor_id', vendor.id)
        .gte('created_at', effectiveWindowStartIso)
        .neq('status', 'CANCELLED')
        .neq('status', 'REFUNDED');
      if (!todayTxErr && Array.isArray(todayTxRows)) {
        txDailyVolume = todayTxRows
          .filter((row: any) => String(row.resolution_notes || '').toUpperCase() !== 'TEST')
          .reduce((sum: number, row: any) => sum + (Number(row.total_amount) || 0), 0);
      }
    } catch {
      // ignore fallback errors and use stored daily_volume_ngn
    }
  }
  const currentDailyVolume = Math.max(storedDailyVolume, txDailyVolume);

  if (
    effective.dailyVolumeCapNgn !== null &&
    currentDailyVolume + params.totalAmount > effective.dailyVolumeCapNgn
  ) {
    return {
      allowed: false,
      code: 'DAILY_LIMIT_EXCEEDED',
      effectivePerOrderCapNgn: effective.perOrderCapNgn,
      effectiveDailyCapNgn: effective.dailyVolumeCapNgn,
      error: `Order total of ₦${params.totalAmount.toLocaleString()} exceeds your remaining daily volume limit of ₦${Math.max(0, effective.dailyVolumeCapNgn - currentDailyVolume).toLocaleString()} (tier ${effective.tier} cap: ₦${effective.dailyVolumeCapNgn.toLocaleString()}).`,
    };
  }

  return {
    allowed: true,
    effectivePerOrderCapNgn: effective.perOrderCapNgn,
    effectiveDailyCapNgn: effective.dailyVolumeCapNgn,
    vendor: {
      id: vendor.id,
      store_name: vendor.store_name,
      email: vendor.email,
      kyc_status: vendor.kyc_status,
      is_allowlisted: Boolean(vendor.is_allowlisted),
      is_suspended: Boolean(vendor.is_suspended),
      tier: effective.tier,
      cap_override_unlimited: effective.capOverrideUnlimited,
      phone_number: vendor.phone_number ?? null,
      phone_verified: Boolean(vendor.phone_verified),
      phone_hash: vendor.phone_hash ?? null,
      legal_first_name: vendor.legal_first_name ?? null,
      legal_last_name: vendor.legal_last_name ?? null,
      settlement_bank_code: vendor.settlement_bank_code ?? null,
      settlement_account_number: vendor.settlement_account_number ?? null,
      settlement_account_name: vendor.settlement_account_name ?? null,
      payout_account_verified: payoutVerified,
      settlement_account_name_matched:
        typeof vendor.settlement_account_name_matched === 'boolean'
          ? vendor.settlement_account_name_matched
          : true,
      payout_hold_until: vendor.payout_hold_until ?? null,
      anchor_deposit_account_id: vendor.anchor_deposit_account_id,
      daily_volume_ngn: currentDailyVolume,
      successful_sales_count: Number(
        vendor.successful_sales_count ?? vendor.completed_orders_count ?? 0
      ),
      completed_orders_count: Number(
        vendor.completed_orders_count ?? vendor.successful_sales_count ?? 0
      ),
      disputes_count: Number(vendor.disputes_count || 0),
      first_order_at: vendor.first_order_at ?? null,
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
  if (maxOrder !== null && maxOrder > 0 && params.totalAmount > maxOrder) {
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
