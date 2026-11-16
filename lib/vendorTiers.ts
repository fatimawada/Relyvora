/**
 * Vendor Tiers & Cap Management:
 * - NEW (per-order & daily caps from system_settings, default ₦2,500,000 / unlimited daily)
 * - ESTABLISHED (rule-based promotion after N completed orders, M days since first order, zero disputes)
 * - TRUSTED (admin-set only, with mandatory reason logged & alerted)
 * - Cap override lifting requires explicit admin action + reason + audit log + alert
 */

import { getServiceSupabase } from './supabaseServer';
import {
  computeVendorEffectiveTierLimits,
  getMaxDailyVendorVolumeNgnServer,
  getMaxOrderNgnServer,
  getTier1OrderLimitNgnServer,
  getTierConfigServer,
  getTierUpgradeThresholdServer,
  type VendorTierName,
} from './safetyLimits';
import { getVendorSafetyOverlay, setVendorSafetyOverlay } from './payoutSafety';
import { getTxRiskFallback, hashPhoneSignal } from './riskEngine';
import { logAndAlertAdminAction } from './adminSafety';
import { isSchemaMissingError } from './whatsapp';
import { sendSystemAlert } from './alerts';

function mergeVendorWithOverlay(
  dbVendor: Record<string, any> | null,
  vendorIdHint?: string | null
): Record<string, any> | null {
  const id = dbVendor?.id || vendorIdHint;
  const overlay = id ? getVendorSafetyOverlay(id) || {} : {};
  if (!dbVendor) {
    return Object.keys(overlay).length > 0 ? overlay : null;
  }
  const definedEntries = Object.entries(dbVendor).filter(([, v]) => v !== undefined);
  return {
    ...Object.fromEntries(definedEntries),
    ...overlay,
  };
}

export async function getVendorEffectiveTierAndCaps(
  vendorOrId: string | Record<string, any>,
  supabaseClient?: ReturnType<typeof getServiceSupabase>
) {
  let vendor: Record<string, any> | null =
    typeof vendorOrId === 'object' ? mergeVendorWithOverlay(vendorOrId, vendorOrId?.id) : null;

  if (typeof vendorOrId === 'string') {
    const supabase = supabaseClient || getServiceSupabase();
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorOrId)
      .maybeSingle();
    vendor = mergeVendorWithOverlay(data, vendorOrId);
  }

  const tierConfig = await getTierConfigServer();
  const globalMaxOrder = await getMaxOrderNgnServer();
  const globalMaxDaily = await getMaxDailyVendorVolumeNgnServer();
  const tierUpgradeThreshold = await getTierUpgradeThresholdServer();
  const tier1OrderLimitNgn = await getTier1OrderLimitNgnServer();

  return computeVendorEffectiveTierLimits({
    tier: vendor?.tier,
    capOverrideUnlimited: vendor?.cap_override_unlimited,
    successfulSalesCount: vendor?.successful_sales_count,
    completedOrdersCount: vendor?.completed_orders_count,
    disputesCount: vendor?.disputes_count,
    tierUpgradeThreshold,
    tier1OrderLimitNgn,
    tierConfig,
    globalMaxOrderNgn: globalMaxOrder,
    globalMaxDailyNgn: globalMaxDaily,
  });
}

/**
 * Rule-based tier counter update on completed release.
 * Increments successful_sales_count ONLY when the order reached RELEASED with no dispute
 * and the buyer and vendor do not share a phone, IP, or device.
 * Only promotes NEW -> ESTABLISHED when rules in system_settings['tier_config'] are satisfied
 * (N deliveries AND M days since first order AND 0 disputes).
 * NEVER auto-promotes to TRUSTED or lifts caps entirely on sales count alone.
 */
export async function recordCompletedOrderAndEvaluateTier(params: {
  vendorId: string;
  transactionId?: string | null;
  completedAt?: string;
  alreadyIncrementedInDb?: boolean;
  preReleaseSalesCount?: number;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{
  previousTier: VendorTierName;
  newTier: VendorTierName;
  promoted: boolean;
  incrementedSalesCount: boolean;
  completedOrdersCount: number;
  successfulSalesCount: number;
}> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const { data: rawVendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', params.vendorId)
    .maybeSingle();

  const vendor = mergeVendorWithOverlay(rawVendor, params.vendorId);

  if (!vendor) {
    return {
      previousTier: 'NEW',
      newTier: 'NEW',
      promoted: false,
      incrementedSalesCount: false,
      completedOrdersCount: 0,
      successfulSalesCount: 0,
    };
  }

  let eligibleToIncrement = true;
  if (params.transactionId) {
    try {
      const { data: txRow } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', params.transactionId)
        .maybeSingle();

      const { data: disputeResRows } = await supabase
        .from('dispute_resolutions')
        .select('id')
        .eq('transaction_id', params.transactionId)
        .limit(1);

      const txRiskFb = getTxRiskFallback(params.transactionId);
      const hasDispute =
        Boolean(txRow?.disputed_at) ||
        Boolean(txRow?.dispute_reason) ||
        String(txRow?.status || '').toUpperCase() === 'DISPUTED' ||
        (Array.isArray(disputeResRows) && disputeResRows.length > 0);

      const buyerPhoneHash = txRow?.buyer_phone_hash || hashPhoneSignal(txRow?.buyer_phone);
      const vendorPhoneHash = vendor.phone_hash || hashPhoneSignal(vendor.phone_number);
      const sharedPhone = Boolean(buyerPhoneHash && vendorPhoneHash && buyerPhoneHash === vendorPhoneHash);

      const buyerIpHash = txRow?.buyer_ip_hash || null;
      const creatorIpHash = txRow?.creator_ip_hash || txRiskFb?.creator_ip_hash || null;
      const sharedIp = Boolean(
        buyerIpHash &&
          ((vendor.signup_ip_hash && buyerIpHash === vendor.signup_ip_hash) ||
            (creatorIpHash && buyerIpHash === creatorIpHash))
      );

      const buyerDeviceHash = txRow?.buyer_device_hash || null;
      const creatorDeviceHash = txRow?.creator_device_hash || txRiskFb?.creator_device_hash || null;
      const sharedDevice = Boolean(
        buyerDeviceHash &&
          ((vendor.signup_device_hash && buyerDeviceHash === vendor.signup_device_hash) ||
            (creatorDeviceHash && buyerDeviceHash === creatorDeviceHash))
      );

      const txSignals: Array<{ code?: string }> = Array.isArray(txRow?.risk_signals)
        ? txRow.risk_signals
        : txRiskFb?.risk_signals || [];
      const hasSharedSignal = txSignals.some(
        (s) => s?.code === 'SHARED_PHONE_VENDOR_BUYER' || s?.code === 'SHARED_DEVICE_OR_IP'
      );

      if (hasDispute || sharedPhone || sharedIp || sharedDevice || hasSharedSignal) {
        eligibleToIncrement = false;
      }
    } catch {
      // If dispute/signal check throws, stay conservative
    }
  }

  const nowIso = params.completedAt || new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const prevTierRaw = String(vendor.tier || 'NEW').toUpperCase();
  const previousTier: VendorTierName =
    prevTierRaw === 'TRUSTED' || prevTierRaw === 'ESTABLISHED' ? prevTierRaw : 'NEW';

  const baseSalesCount =
    typeof params.preReleaseSalesCount === 'number'
      ? params.preReleaseSalesCount
      : Number(vendor.successful_sales_count ?? vendor.completed_orders_count ?? 0);

  let successfulSalesCount: number;
  if (!eligibleToIncrement) {
    successfulSalesCount = baseSalesCount;
  } else if (typeof params.preReleaseSalesCount === 'number') {
    successfulSalesCount = baseSalesCount + 1;
  } else {
    successfulSalesCount = params.alreadyIncrementedInDb ? baseSalesCount : baseSalesCount + 1;
  }

  const completedOrdersCount = successfulSalesCount;
  const disputesCount = Number(vendor.disputes_count || 0);
  const firstOrderAt = vendor.first_order_at || nowIso;
  const firstOrderMs = new Date(firstOrderAt).getTime();
  const daysSinceFirstOrder = Math.max(0, (nowMs - firstOrderMs) / (24 * 3600_000));

  const tierCfg = await getTierConfigServer();
  let newTier: VendorTierName = previousTier;
  let promoted = false;

  if (
    previousTier === 'NEW' &&
    successfulSalesCount >= tierCfg.promotion.established_min_completed_orders &&
    daysSinceFirstOrder >= tierCfg.promotion.established_min_days_since_first_order &&
    disputesCount <= tierCfg.promotion.established_max_disputes
  ) {
    newTier = 'ESTABLISHED';
    promoted = true;
  }

  const patch: Record<string, any> = {
    successful_sales_count: successfulSalesCount,
    completed_orders_count: completedOrdersCount,
    first_order_at: firstOrderAt,
    updated_at: nowIso,
  };
  if (promoted) {
    patch.tier = newTier;
    patch.tier_updated_at = nowIso;
  }

  const { error: updErr } = await supabase
    .from('vendors')
    .update(patch)
    .eq('id', vendor.id);

  if (!updErr || isSchemaMissingError(updErr)) {
    setVendorSafetyOverlay(vendor.id, patch);
  }

  if (promoted) {
    await sendSystemAlert({
      type: 'TIER_CHANGE',
      severity: 'WARNING',
      title: `Vendor Auto-Promoted from ${previousTier} to ${newTier}`,
      vendorHandle: vendor.store_name,
      details: {
        vendorId: vendor.id,
        previousTier,
        newTier,
        successfulSalesCount,
        completedOrdersCount,
        daysSinceFirstOrder: Number(daysSinceFirstOrder.toFixed(2)),
        disputesCount,
      },
    }).catch(() => {});
  }

  return {
    previousTier,
    newTier,
    promoted,
    incrementedSalesCount: eligibleToIncrement,
    completedOrdersCount,
    successfulSalesCount,
  };
}

/**
 * Increments disputes_count on vendor and demotes ESTABLISHED -> NEW if dispute budget exceeded.
 */
export async function recordDisputeAndDemoteIfNeeded(params: {
  vendorId?: string | null;
  transactionId: string;
  reason?: string;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<void> {
  if (!params.vendorId) return;
  const supabase = params.supabaseClient || getServiceSupabase();
  const { data: rawVendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', params.vendorId)
    .maybeSingle();

  const vendor = mergeVendorWithOverlay(rawVendor, params.vendorId);
  if (!vendor) return;

  const tierCfg = await getTierConfigServer();
  const disputesCount = Number(vendor.disputes_count || 0) + 1;
  const prevTier = String(vendor.tier || 'NEW').toUpperCase();
  const nowIso = new Date().toISOString();

  const shouldDemote =
    prevTier === 'ESTABLISHED' &&
    disputesCount > tierCfg.promotion.established_max_disputes;

  const patch: Record<string, any> = {
    disputes_count: disputesCount,
    updated_at: nowIso,
  };
  if (shouldDemote) {
    patch.tier = 'NEW';
    patch.tier_updated_at = nowIso;
  }

  const { error: updErr } = await supabase
    .from('vendors')
    .update(patch)
    .eq('id', vendor.id);

  if (!updErr || isSchemaMissingError(updErr)) {
    setVendorSafetyOverlay(vendor.id, patch);
  }

  if (params.transactionId) {
    try {
      await supabase
        .from('transactions')
        .update({
          disputed_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', params.transactionId);
    } catch {
      // Non-fatal if transactions column not yet migrated
    }
  }

  if (shouldDemote) {
    await sendSystemAlert({
      type: 'TIER_CHANGE',
      severity: 'WARNING',
      title: 'Vendor Demoted to NEW Tier Following Dispute',
      transactionId: params.transactionId,
      vendorHandle: vendor.store_name,
      details: {
        vendorId: vendor.id,
        previousTier: prevTier,
        newTier: 'NEW',
        disputesCount,
        reason: params.reason || 'Dispute raised',
      },
    }).catch(() => {});
  }
}

/**
 * Admin-only action to change vendor tier (including TRUSTED) or lift caps.
 * Requires a non-empty reason and writes audit log + alerts ops.
 */
export async function adminSetVendorTierOrCapOverride(params: {
  vendorId: string;
  adminEmail: string;
  reason: string;
  tier?: VendorTierName;
  capOverrideUnlimited?: boolean;
  ipAddress?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{
  success: boolean;
  statusCode: number;
  vendor?: Record<string, any>;
  error?: string;
}> {
  const reason = String(params.reason || '').trim();
  if (reason.length < 3) {
    return {
      success: false,
      statusCode: 400,
      error: 'A clear non-empty reason (at least 3 characters) is required for any vendor tier or cap override.',
    };
  }

  const supabase = params.supabaseClient || getServiceSupabase();
  const { data: rawVendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', params.vendorId)
    .maybeSingle();

  const vendor = mergeVendorWithOverlay(rawVendor, params.vendorId);
  if (!vendor) {
    return { success: false, statusCode: 404, error: 'Vendor not found.' };
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, any> = { updated_at: nowIso };

  if (params.tier !== undefined) {
    const t = String(params.tier).toUpperCase();
    if (t !== 'NEW' && t !== 'ESTABLISHED' && t !== 'TRUSTED') {
      return { success: false, statusCode: 400, error: `Invalid tier "${params.tier}".` };
    }
    patch.tier = t;
    patch.tier_updated_at = nowIso;
  }

  if (typeof params.capOverrideUnlimited === 'boolean') {
    patch.cap_override_unlimited = params.capOverrideUnlimited;
    patch.cap_override_reason = reason;
    patch.cap_override_by = params.adminEmail;
    patch.cap_override_at = nowIso;
  }

  const { error: updErr } = await supabase
    .from('vendors')
    .update(patch)
    .eq('id', vendor.id);

  if (updErr && !isSchemaMissingError(updErr)) {
    return {
      success: false,
      statusCode: 500,
      error: `Failed updating vendor tier/cap override: ${updErr.message}`,
    };
  }

  setVendorSafetyOverlay(vendor.id, patch);

  await logAndAlertAdminAction({
    adminEmail: params.adminEmail,
    action: 'ADMIN_VENDOR_TIER_OR_CAP_OVERRIDE',
    targetType: 'vendor',
    targetId: vendor.id,
    ipAddress: params.ipAddress,
    alertTitle: `Admin Modified Vendor Tier / Cap Override (${vendor.store_name})`,
    severity: params.capOverrideUnlimited ? 'CRITICAL' : 'WARNING',
    metadata: {
      vendorHandle: vendor.store_name,
      previousTier: vendor.tier || 'NEW',
      newTier: patch.tier || vendor.tier || 'NEW',
      capOverrideUnlimited:
        typeof params.capOverrideUnlimited === 'boolean'
          ? params.capOverrideUnlimited
          : vendor.cap_override_unlimited || false,
      reason,
    },
    supabaseClient: supabase,
  });

  return {
    success: true,
    statusCode: 200,
    vendor: { ...vendor, ...patch },
  };
}

/**
 * Records a compliance strike on a vendor (e.g. Scenario 6 dispatch failure or policy breach).
 * Strikes automatically demote ESTABLISHED -> NEW (>=1 strike) and suspend vendor at >=3 strikes.
 */
export async function recordVendorComplianceStrike(params: {
  vendorId?: string | null;
  transactionId?: string | null;
  reason: string;
  adminEmail?: string;
  ipAddress?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{
  success: boolean;
  complianceStrikes?: number;
  isSuspended?: boolean;
  tier?: string;
  error?: string;
}> {
  if (!params.vendorId) {
    return { success: false, error: 'Missing vendorId for compliance strike.' };
  }
  const supabase = params.supabaseClient || getServiceSupabase();
  const { data: rawVendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', params.vendorId)
    .maybeSingle();

  const vendor = mergeVendorWithOverlay(rawVendor, params.vendorId);
  if (!vendor) return { success: false, error: 'Vendor not found.' };

  const nowIso = new Date().toISOString();
  const nextStrikes = Number(vendor.compliance_strikes || 0) + 1;
  const shouldSuspend = nextStrikes >= 3 || Boolean(vendor.is_suspended);
  const prevTier = String(vendor.tier || 'NEW').toUpperCase();
  const nextTier = prevTier === 'TRUSTED' && !shouldSuspend ? prevTier : 'NEW';

  const patch: Record<string, any> = {
    compliance_strikes: nextStrikes,
    tier: nextTier,
    tier_updated_at: nowIso,
    updated_at: nowIso,
  };
  if (shouldSuspend) {
    patch.is_suspended = true;
    patch.suspended_at = vendor.suspended_at || nowIso;
    patch.suspension_reason = params.reason || `Reached ${nextStrikes} compliance strikes`;
  }

  const { error: updErr } = await supabase
    .from('vendors')
    .update(patch)
    .eq('id', vendor.id);

  if (updErr && !isSchemaMissingError(updErr)) {
    return { success: false, error: updErr.message };
  }
  setVendorSafetyOverlay(vendor.id, patch);

  await logAndAlertAdminAction({
    adminEmail: params.adminEmail || 'system:compliance_engine',
    action: shouldSuspend ? 'VENDOR_STRIKE_AND_SUSPENDED' : 'VENDOR_COMPLIANCE_STRIKE',
    targetType: 'vendor',
    targetId: vendor.id,
    ipAddress: params.ipAddress,
    alertTitle: shouldSuspend
      ? `Vendor Auto-Suspended (${vendor.store_name}, Strikes: ${nextStrikes})`
      : `Compliance Strike Recorded (${vendor.store_name}, Strikes: ${nextStrikes})`,
    severity: shouldSuspend ? 'CRITICAL' : 'WARNING',
    metadata: {
      vendorHandle: vendor.store_name,
      transactionId: params.transactionId || null,
      complianceStrikes: nextStrikes,
      isSuspended: shouldSuspend,
      newTier: nextTier,
      reason: params.reason,
    },
    supabaseClient: supabase,
  });

  return {
    success: true,
    complianceStrikes: nextStrikes,
    isSuspended: shouldSuspend,
    tier: nextTier,
  };
}

/**
 * Admin-only suspend or restore vendor account with documented reason & audit/email alert.
 */
export async function setVendorSuspensionState(params: {
  vendorId: string;
  suspend: boolean;
  reason: string;
  adminEmail: string;
  ipAddress?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{ success: boolean; statusCode: number; vendor?: Record<string, any>; error?: string }> {
  const cleanReason = String(params.reason || '').trim();
  if (cleanReason.length < 3) {
    return { success: false, statusCode: 400, error: 'A clear reason (at least 3 characters) is required.' };
  }

  const supabase = params.supabaseClient || getServiceSupabase();
  const { data: rawVendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', params.vendorId)
    .maybeSingle();

  const vendor = mergeVendorWithOverlay(rawVendor, params.vendorId);
  if (!vendor) return { success: false, statusCode: 404, error: 'Vendor not found.' };

  const nowIso = new Date().toISOString();
  const patch: Record<string, any> = params.suspend
    ? {
        is_suspended: true,
        suspended_at: nowIso,
        suspension_reason: cleanReason,
        updated_at: nowIso,
      }
    : {
        is_suspended: false,
        suspended_at: null,
        suspension_reason: null,
        updated_at: nowIso,
      };

  const { error: updErr } = await supabase
    .from('vendors')
    .update(patch)
    .eq('id', vendor.id);

  if (updErr && !isSchemaMissingError(updErr)) {
    return { success: false, statusCode: 500, error: updErr.message };
  }
  setVendorSafetyOverlay(vendor.id, patch);

  await logAndAlertAdminAction({
    adminEmail: params.adminEmail,
    action: params.suspend ? 'ADMIN_SUSPEND_VENDOR' : 'ADMIN_RESTORE_VENDOR',
    targetType: 'vendor',
    targetId: vendor.id,
    ipAddress: params.ipAddress,
    alertTitle: params.suspend
      ? `Vendor Suspended (${vendor.store_name})`
      : `Vendor Restored (${vendor.store_name})`,
    severity: params.suspend ? 'CRITICAL' : 'WARNING',
    metadata: {
      vendorHandle: vendor.store_name,
      suspended: params.suspend,
      reason: cleanReason,
    },
    supabaseClient: supabase,
  });

  return { success: true, statusCode: 200, vendor: { ...vendor, ...patch } };
}
