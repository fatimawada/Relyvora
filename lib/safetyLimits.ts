/**
 * Safety Limits, Hot Kill Switches & Vendor Allowlist
 * Phase G1.5 Security Hardening
 * 
 * Supports instant database-driven overrides via `system_settings` table,
 * falling back to server environment variables.
 */

import { getServiceSupabase } from './supabaseServer';
import { sendSystemAlert } from './alerts';

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

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from('system_settings').select('key, value');
  if (error || !Array.isArray(data) || data.length === 0) {
    const errMsg = error?.message || 'system_settings table is missing or empty';
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Critical Failure Loading system_settings (Fail Closed)',
      details: { error: errMsg },
    }).catch(() => {});
    throw new Error(`Critical runtime failure: unable to load system_settings (${errMsg}).`);
  }

  const map: Record<string, any> = {};
  for (const row of data) {
    map[row.key] = row.value;
  }
  settingsCache = { data: map, expiresAt: now + 30000 };
  return map;
}

export async function requireHotSetting<T = any>(
  settings: Record<string, any>,
  key: string
): Promise<T> {
  if (!(key in settings) || settings[key] === undefined) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: `Required system_settings Key Missing: ${key}`,
      details: { key },
    }).catch(() => {});
    throw new Error(`Required configuration setting "${key}" is missing from system_settings.`);
  }
  return settings[key] as T;
}

export async function getTier1OrderLimitNgnServer(): Promise<number | null> {
  const settings = await getHotSettings();
  await requireHotSetting(settings, 'tier1_order_limit_ngn');
  if (settings.tier1_order_limit_ngn === null || settings.tier1_order_limit_ngn === 'null') {
    return null;
  }
  return parseNullableLimit(settings.tier1_order_limit_ngn);
}

export async function getTierUpgradeThresholdServer(): Promise<number> {
  const settings = await getHotSettings();
  const raw = await requireHotSetting(settings, 'tier_upgrade_threshold');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid system_settings.tier_upgrade_threshold configuration.');
  }
  return Math.floor(parsed);
}

export async function getTierConfigServer(): Promise<TierConfig> {
  const settings = await getHotSettings();
  const raw = await requireHotSetting<Record<string, any>>(settings, 'tier_config');
  if (!raw || typeof raw !== 'object' || !raw.tiers || !raw.promotion) {
    throw new Error('Invalid system_settings.tier_config structure.');
  }
  const rawTiers = raw.tiers;
  const rawPromo = raw.promotion;

  return {
    tiers: {
      NEW: {
        per_order_cap_ngn: parseNullableLimit(rawTiers.NEW?.per_order_cap_ngn),
        daily_volume_cap_ngn: parseNullableLimit(rawTiers.NEW?.daily_volume_cap_ngn),
      },
      ESTABLISHED: {
        per_order_cap_ngn: parseNullableLimit(rawTiers.ESTABLISHED?.per_order_cap_ngn),
        daily_volume_cap_ngn: parseNullableLimit(rawTiers.ESTABLISHED?.daily_volume_cap_ngn),
      },
      TRUSTED: {
        per_order_cap_ngn: parseNullableLimit(rawTiers.TRUSTED?.per_order_cap_ngn),
        daily_volume_cap_ngn: parseNullableLimit(rawTiers.TRUSTED?.daily_volume_cap_ngn),
      },
    },
    promotion: {
      established_min_completed_orders: Number(rawPromo.established_min_completed_orders),
      established_min_days_since_first_order: Number(rawPromo.established_min_days_since_first_order),
      established_max_disputes: Number(rawPromo.established_max_disputes),
    },
  };
}

export async function getPayoutSafetyConfigServer(): Promise<PayoutSafetyConfig> {
  const settings = await getHotSettings();
  const raw = await requireHotSetting<Record<string, any>>(settings, 'payout_safety_config');
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid system_settings.payout_safety_config structure.');
  }
  return {
    name_match_min_score: Number(raw.name_match_min_score),
    settlement_change_wait_hours: Number(raw.settlement_change_wait_hours),
    require_whatsapp_confirm_on_bank_change: parseBooleanSetting(
      raw.require_whatsapp_confirm_on_bank_change,
      true
    ),
  };
}

export async function getRiskEngineConfigServer(): Promise<RiskEngineConfig> {
  const settings = await getHotSettings();
  const raw = await requireHotSetting<Record<string, any>>(settings, 'risk_engine_config');
  if (!raw || typeof raw !== 'object' || !raw.weights || typeof raw.weights !== 'object') {
    throw new Error('Invalid system_settings.risk_engine_config structure.');
  }
  const mergedWeights: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.weights)) {
    const num = Number(v);
    if (Number.isFinite(num) && num >= 0) {
      mergedWeights[k] = num;
    }
  }
  return {
    review_hold_threshold: Number(raw.review_hold_threshold),
    block_threshold: Number(raw.block_threshold),
    amount_review_threshold_ngn: Number(raw.amount_review_threshold_ngn),
    near_cap_ratio_min: Number(raw.near_cap_ratio_min),
    velocity_window_minutes: Number(raw.velocity_window_minutes),
    velocity_max_orders: Number(raw.velocity_max_orders),
    repeat_pair_window_hours: Number(raw.repeat_pair_window_hours),
    repeat_pair_max_orders: Number(raw.repeat_pair_max_orders),
    spike_multiplier: Number(raw.spike_multiplier),
    spike_min_baseline_ngn: Number(raw.spike_min_baseline_ngn),
    ip_hash_retention_hours: Number(raw.ip_hash_retention_hours),
    weights: mergedWeights,
  };
}

export async function getCoolingWindowConfigServer(): Promise<CoolingWindowConfig> {
  const settings = await getHotSettings();
  const raw = await requireHotSetting<Record<string, any>>(settings, 'cooling_window_config');
  if (!raw || typeof raw !== 'object' || !raw.hours_by_tier) {
    throw new Error('Invalid system_settings.cooling_window_config structure.');
  }
  const rawHours = raw.hours_by_tier;
  return {
    hours_by_tier: {
      NEW: Number(rawHours.NEW ?? 0),
      ESTABLISHED: Number(rawHours.ESTABLISHED ?? 0),
      TRUSTED: Number(rawHours.TRUSTED ?? 0),
    },
    high_value_cooling_hours: Number(raw.high_value_cooling_hours ?? 0),
    notify_buyer_on_code_use: parseBooleanSetting(raw.notify_buyer_on_code_use, true),
  };
}

export async function getAdminSafetyConfigServer(): Promise<AdminSafetyConfig> {
  const settings = await getHotSettings();
  const raw = await requireHotSetting<Record<string, any>>(settings, 'admin_safety_config');
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid system_settings.admin_safety_config structure.');
  }
  return {
    session_max_age_minutes: Number(raw.session_max_age_minutes),
    high_value_confirm_threshold_ngn: Number(raw.high_value_confirm_threshold_ngn),
    require_typed_confirmation: parseBooleanSetting(raw.require_typed_confirmation, true),
    alert_on_every_admin_action: parseBooleanSetting(raw.alert_on_every_admin_action, true),
  };
}

export async function isPayoutsEnabledServer(): Promise<boolean> {
  const settings = await getHotSettings();
  const val = await requireHotSetting(settings, 'payouts_enabled');
  return parseBooleanSetting(val, false);
}

/**
 * Checks if checkout is enabled strictly from system_settings.
 */
export async function isCheckoutEnabledServer(): Promise<boolean> {
  const settings = await getHotSettings();
  const val = await requireHotSetting(settings, 'checkout_enabled');
  return Boolean(val === true || val === 'true');
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
  const dbSetting = await requireHotSetting(settings, 'max_order_ngn');

  const envVal = process.env.MAX_ORDER_NGN ?? process.env.NEXT_PUBLIC_MAX_ORDER_NGN;
  if (envVal !== undefined) {
    const envParsed = parseNullableLimit(envVal);
    if (envParsed !== null) return envParsed;
  }

  return parseNullableLimit(dbSetting);
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
  const dbSetting = await requireHotSetting(settings, 'max_daily_vendor_volume_ngn');

  const envVal = process.env.MAX_DAILY_VENDOR_VOLUME_NGN;
  if (envVal !== undefined) {
    const envParsed = parseNullableLimit(envVal);
    if (envParsed !== null) return envParsed;
  }

  return parseNullableLimit(dbSetting);
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
 * Reads `vendor_allowlist_mode` strictly from system_settings (fails closed if missing).
 */
export async function getVendorAllowlistModeServer(): Promise<boolean> {
  const settings = await getHotSettings();
  const allowlistRaw = await requireHotSetting(settings, 'vendor_allowlist_mode');
  return parseBooleanSetting(allowlistRaw, false);
}

/**
 * Checks whether a vendor is allowlisted when vendor_allowlist_mode = true.
 * Default for vendor_allowlist_mode is false (open signup).
 */
export async function isVendorAllowlistedServer(vendorHandle: string): Promise<boolean> {
  const allowlistMode = await getVendorAllowlistModeServer();

  if (!allowlistMode) {
    return true;
  }

  const cleanHandle = (vendorHandle || '').trim().toLowerCase().replace(/^@/, '');

  const supabase = getServiceSupabase();
  const { data: vendor, error } = await supabase
    .from('vendors')
    .select('is_allowlisted')
    .or(`store_name.ilike.%${cleanHandle}%,email.ilike.%${cleanHandle}%`)
    .maybeSingle();

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Vendor Allowlist Query Failed (Fail Closed)',
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`Vendor allowlist verification failed: ${error.message}`);
  }

  if (vendor && vendor.is_allowlisted === true) {
    return true;
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
  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Vendor Verification Query Failed (Fail Closed)',
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`Vendor verification query failed: ${error.message}`);
  }

  const settings = await getHotSettings();
  const allowlistMode = parseBooleanSetting(
    await requireHotSetting(settings, 'vendor_allowlist_mode'),
    false
  );

  if (!dbVendor) {
    return {
      allowed: false,
      code: 'VENDOR_NOT_FOUND',
      error: `Vendor account for "${input}" could not be verified on the server.`,
    };
  }

  const vendor: Record<string, any> = { ...dbVendor };

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

  // Open-signup gate 2: Anchor deposit account + name-matched settlement payout account verification must pass strictly
  // Note: Raw bank details never need to be stored in public.vendors; verification flags + anchor_deposit_account_id suffice.
  const payoutVerified =
    vendor.payout_account_verified === true && vendor.settlement_account_name_matched === true;

  if (!vendor.anchor_deposit_account_id || !payoutVerified) {
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
    const { data: todayTxRows, error: todayTxErr } = await supabase
      .from('transactions')
      .select('total_amount, status, resolution_notes')
      .eq('vendor_id', vendor.id)
      .gte('created_at', effectiveWindowStartIso)
      .neq('status', 'CANCELLED')
      .neq('status', 'REFUNDED');
    if (todayTxErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Vendor Daily Volume Query Failed (Fail Closed)',
        details: { vendorId: vendor.id, error: todayTxErr.message },
      }).catch(() => {});
      throw new Error(`Unable to compute vendor daily volume: ${todayTxErr.message}`);
    }
    txDailyVolume = (todayTxRows || [])
      .filter((row: any) => String(row.resolution_notes || '').toUpperCase() !== 'TEST')
      .reduce((sum: number, row: any) => sum + (Number(row.total_amount) || 0), 0);
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
