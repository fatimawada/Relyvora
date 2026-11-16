/**
 * Risk Scoring & Self-Dealing / Anomaly Detection Engine
 * - All thresholds, windows, IP retention hours, and weights live in system_settings['risk_engine_config'].
 * - Privacy-preserving salted HMAC hashes for IP, User-Agent, Device, and Phone (no raw IPs stored).
 * - Low (< review_hold_threshold): ALLOW
 * - Medium/High (review_hold_threshold .. block_threshold - 1): HOLD_PAYOUT (review_hold = true) + alert
 * - Critical (>= block_threshold): BLOCK (order_blocked = true, review_hold = true) + immediate alert
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getServiceSupabase } from './supabaseServer';
import {
  getPayoutSafetyConfigServer,
  getRiskEngineConfigServer,
  getTier1OrderLimitNgnServer,
  getTierConfigServer,
  getTierUpgradeThresholdServer,
  getMaxOrderNgnServer,
  getMaxDailyVendorVolumeNgnServer,
  computeVendorEffectiveTierLimits,
} from './safetyLimits';
import { computeNameSimilarityScore } from './payoutSafety';
import { isSchemaMissingError, normalizeWhatsappPhone } from './whatsapp';
import { isLiveMode } from './paymentsMode';
import { sendSystemAlert } from './alerts';

export interface RiskSignalHit {
  code: string;
  weight: number;
  detail: string;
}

export interface RiskEvaluationResult {
  score: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actionTaken: 'ALLOW' | 'FLAG_REVIEW' | 'HOLD_PAYOUT' | 'BLOCK';
  reviewHold: boolean;
  orderBlocked: boolean;
  signals: RiskSignalHit[];
  reason: string | null;
}

export interface RiskFlagFallbackRecord {
  id: string;
  transaction_id: string | null;
  vendor_id: string | null;
  score: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  action_taken: 'ALLOW' | 'FLAG_REVIEW' | 'HOLD_PAYOUT' | 'BLOCK';
  signals: RiskSignalHit[];
  status: 'OPEN' | 'CLEARED' | 'BLOCKED';
  cleared_by: string | null;
  cleared_reason: string | null;
  cleared_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

const globalForRisk = globalThis as unknown as {
  __relyvoraRiskFallbackStore?: {
    txRisk: Map<
      string,
      {
        risk_score: number;
        risk_signals: RiskSignalHit[];
        review_hold: boolean;
        review_hold_reason: string | null;
        order_blocked: boolean;
        order_block_reason: string | null;
        creator_ip_hash?: string | null;
        creator_ip_expires_at?: string | null;
        creator_ua_hash?: string | null;
        creator_device_hash?: string | null;
        buyer_phone_hash?: string | null;
      }
    >;
    riskFlags: RiskFlagFallbackRecord[];
  };
};

function getRiskFallbackStore() {
  if (!globalForRisk.__relyvoraRiskFallbackStore) {
    globalForRisk.__relyvoraRiskFallbackStore = {
      txRisk: new Map(),
      riskFlags: [],
    };
  }
  return globalForRisk.__relyvoraRiskFallbackStore;
}

export function resetRiskFallbackStoreForTests(): void {
  const store = getRiskFallbackStore();
  store.txRisk.clear();
  store.riskFlags = [];
}

export function getTxRiskFallback(txId: string) {
  return getRiskFallbackStore().txRisk.get(txId);
}

function getRiskHashSalt(): string {
  return (
    process.env.RISK_HASH_SALT ||
    process.env.RELEASE_CODE_HMAC_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'relyvora_risk_signal_default_salt'
  );
}

export function hashSignalWithSalt(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return crypto
    .createHmac('sha256', getRiskHashSalt())
    .update(raw.toLowerCase())
    .digest('hex');
}

export function hashPhoneSignal(phone?: string | null): string | null {
  const normalized = normalizeWhatsappPhone(phone || '') || String(phone || '').trim();
  if (!normalized) return null;
  return hashSignalWithSalt(normalized);
}

export async function extractRequestDeviceFingerprints(
  request: NextRequest | { headers: Headers },
  explicitDeviceId?: string | null
): Promise<{
  ipHash: string | null;
  ipExpiresAt: string | null;
  uaHash: string | null;
  deviceHash: string | null;
}> {
  const riskCfg = await getRiskEngineConfigServer();
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const realIp = request.headers.get('x-real-ip') || '';
  const rawIp = forwarded.split(',')[0]?.trim() || realIp.trim() || '';
  const ua = request.headers.get('user-agent') || '';
  const deviceToken =
    explicitDeviceId ||
    request.headers.get('x-device-fingerprint') ||
    request.headers.get('x-device-id') ||
    '';

  const ipHash = rawIp ? hashSignalWithSalt(rawIp) : null;
  const uaHash = ua ? hashSignalWithSalt(ua) : null;
  const deviceHash = deviceToken ? hashSignalWithSalt(deviceToken) : null;
  const ipExpiresAt = ipHash
    ? new Date(Date.now() + riskCfg.ip_hash_retention_hours * 3600_000).toISOString()
    : null;

  return { ipHash, ipExpiresAt, uaHash, deviceHash };
}

function finalizeEvaluation(
  signals: RiskSignalHit[],
  reviewHoldThreshold: number,
  blockThreshold: number
): RiskEvaluationResult {
  const score = signals.reduce((sum, s) => sum + s.weight, 0);

  if (score >= blockThreshold) {
    return {
      score,
      severity: 'CRITICAL',
      actionTaken: 'BLOCK',
      reviewHold: true,
      orderBlocked: true,
      signals,
      reason: signals.map((s) => s.detail).join(' | '),
    };
  }

  if (score >= reviewHoldThreshold) {
    return {
      score,
      severity: score >= Math.round((reviewHoldThreshold + blockThreshold) / 2) ? 'HIGH' : 'MEDIUM',
      actionTaken: 'HOLD_PAYOUT',
      reviewHold: true,
      orderBlocked: false,
      signals,
      reason: signals.map((s) => s.detail).join(' | '),
    };
  }

  return {
    score,
    severity: 'LOW',
    actionTaken: 'ALLOW',
    reviewHold: false,
    orderBlocked: false,
    signals,
    reason: null,
  };
}

export async function evaluateOrderCreationRisk(params: {
  vendor: Record<string, any>;
  totalAmount: number;
  buyerPhone?: string | null;
  creatorIpHash?: string | null;
  creatorUaHash?: string | null;
  creatorDeviceHash?: string | null;
  buyerIpHash?: string | null;
  buyerUaHash?: string | null;
  buyerDeviceHash?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<RiskEvaluationResult> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const riskCfg = await getRiskEngineConfigServer();
  const tierCfg = await getTierConfigServer();
  const globalMaxOrder = await getMaxOrderNgnServer();
  const globalMaxDaily = await getMaxDailyVendorVolumeNgnServer();
  const limits = computeVendorEffectiveTierLimits({
    tier: params.vendor.tier,
    capOverrideUnlimited: params.vendor.cap_override_unlimited,
    tierConfig: tierCfg,
    globalMaxOrderNgn: globalMaxOrder,
    globalMaxDailyNgn: globalMaxDaily,
  });

  const weights = riskCfg.weights;
  const signals: RiskSignalHit[] = [];
  const now = new Date();
  const buyerPhoneHash = hashPhoneSignal(params.buyerPhone);
  const vendorPhoneHash =
    params.vendor.phone_hash || hashPhoneSignal(params.vendor.phone_number);

  // 1. High-value review threshold (₦500,000 for NEW vendors)
  if (limits.tier === 'NEW' && params.totalAmount >= riskCfg.amount_review_threshold_ngn) {
    signals.push({
      code: 'ABOVE_REVIEW_AMOUNT',
      weight: weights.ABOVE_REVIEW_AMOUNT ?? 2,
      detail: `Order amount ₦${params.totalAmount.toLocaleString()} meets/exceeds review threshold for NEW vendor (₦${riskCfg.amount_review_threshold_ngn.toLocaleString()}).`,
    });
  }

  // 2. Vendor on settlement account change hold window
  if (params.vendor.payout_hold_until && new Date(params.vendor.payout_hold_until) > now) {
    signals.push({
      code: 'SETTLEMENT_HOLD_ACTIVE',
      weight: weights.SETTLEMENT_HOLD_ACTIVE ?? 3,
      detail: `Vendor is in settlement account change hold until ${params.vendor.payout_hold_until}.`,
    });
  }

  // 3. Buyer & vendor sharing phone number (self-dealing)
  if (buyerPhoneHash && vendorPhoneHash && buyerPhoneHash === vendorPhoneHash) {
    signals.push({
      code: 'SHARED_PHONE_VENDOR_BUYER',
      weight: weights.SHARED_PHONE_VENDOR_BUYER ?? 6,
      detail: 'Buyer phone number matches vendor registered phone number (self-dealing).',
    });
  }

  // 4. Shared device or non-expired IP hash between buyer and vendor
  const vendorIpActive =
    params.vendor.signup_ip_hash &&
    (!params.vendor.signup_ip_expires_at || new Date(params.vendor.signup_ip_expires_at) > now);

  const sharedIp =
    Boolean(params.buyerIpHash) &&
    ((vendorIpActive && params.buyerIpHash === params.vendor.signup_ip_hash) ||
      (Boolean(params.creatorIpHash) && params.buyerIpHash === params.creatorIpHash));

  const sharedDevice =
    Boolean(params.buyerDeviceHash) &&
    ((Boolean(params.vendor.signup_device_hash) &&
      params.buyerDeviceHash === params.vendor.signup_device_hash) ||
      (Boolean(params.creatorDeviceHash) && params.buyerDeviceHash === params.creatorDeviceHash));

  if (sharedIp || sharedDevice) {
    signals.push({
      code: 'SHARED_DEVICE_OR_IP',
      weight: weights.SHARED_DEVICE_OR_IP ?? 3,
      detail: 'Buyer and vendor share device fingerprint or active IP hash.',
    });
  }

  // 5. Recent vendor orders: velocity, repeated pairs, structuring near cap, sudden spike
  try {
    const maxLookbackHours = Math.max(riskCfg.repeat_pair_window_hours, 24);
    const lookbackIso = new Date(now.getTime() - maxLookbackHours * 3600_000).toISOString();

    const { data: recentOrders } = await supabase
      .from('transactions')
      .select('id, total_amount, buyer_phone, created_at')
      .eq('vendor_id', params.vendor.id)
      .gte('created_at', lookbackIso)
      .order('created_at', { ascending: false })
      .limit(100);

    const rows = Array.isArray(recentOrders) ? recentOrders : [];
    const velocityCutoffMs = now.getTime() - riskCfg.velocity_window_minutes * 60_000;
    const recentVelocityCount = rows.filter(
      (r) => new Date(r.created_at).getTime() >= velocityCutoffMs
    ).length;

    if (recentVelocityCount >= riskCfg.velocity_max_orders) {
      signals.push({
        code: 'HIGH_VELOCITY_VENDOR',
        weight: weights.HIGH_VELOCITY_VENDOR ?? 2,
        detail: `Vendor created ${recentVelocityCount} orders in ${riskCfg.velocity_window_minutes} minutes (threshold ${riskCfg.velocity_max_orders}).`,
      });
    }

    if (buyerPhoneHash) {
      const pairCutoffMs = now.getTime() - riskCfg.repeat_pair_window_hours * 3600_000;
      const samePairCount = rows.filter((r) => {
        if (new Date(r.created_at).getTime() < pairCutoffMs) return false;
        const rowHash = hashPhoneSignal(r.buyer_phone);
        return rowHash === buyerPhoneHash;
      }).length;

      if (samePairCount >= riskCfg.repeat_pair_max_orders) {
        signals.push({
          code: 'REPEATED_BUYER_VENDOR_PAIR',
          weight: weights.REPEATED_BUYER_VENDOR_PAIR ?? 2,
          detail: `Same buyer/vendor phone pair has ${samePairCount} recent orders within ${riskCfg.repeat_pair_window_hours}h.`,
        });
      }
    }

    if (limits.perOrderCapNgn !== null) {
      const nearCapFloor = limits.perOrderCapNgn * riskCfg.near_cap_ratio_min;
      if (params.totalAmount >= nearCapFloor) {
        const recentNearCap = rows.filter(
          (r) => Number(r.total_amount || 0) >= nearCapFloor
        ).length;
        if (recentNearCap >= 2) {
          signals.push({
            code: 'REPEATED_NEAR_CAP_ORDER',
            weight: weights.REPEATED_NEAR_CAP_ORDER ?? 2,
            detail: `Multiple orders (>= ${Math.round(riskCfg.near_cap_ratio_min * 100)}% of tier cap) repeated cleanly under ₦${limits.perOrderCapNgn.toLocaleString()}.`,
          });
        }
      }
    }

    // Sudden spike vs vendor historical average
    const { data: historyRows } = await supabase
      .from('transactions')
      .select('total_amount')
      .eq('vendor_id', params.vendor.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (Array.isArray(historyRows) && historyRows.length >= 2) {
      const avg =
        historyRows.reduce((s, r) => s + Number(r.total_amount || 0), 0) / historyRows.length;
      if (
        avg > 0 &&
        params.totalAmount >= riskCfg.spike_min_baseline_ngn &&
        params.totalAmount >= avg * riskCfg.spike_multiplier
      ) {
        signals.push({
          code: 'SUDDEN_AMOUNT_SPIKE',
          weight: weights.SUDDEN_AMOUNT_SPIKE ?? 2,
          detail: `Order amount ₦${params.totalAmount.toLocaleString()} is ${(params.totalAmount / avg).toFixed(1)}x vendor's recent average (₦${Math.round(avg).toLocaleString()}).`,
        });
      }
    }
  } catch (err) {
    console.warn('Risk query history warning:', (err as Error)?.message);
  }

  return finalizeEvaluation(signals, riskCfg.review_hold_threshold, riskCfg.block_threshold);
}

/**
 * Deposit-time risk & cap check inside Anchor webhook:
 * - Enforces vendor tier cap on deposited amount (never releases over-cap deposit)
 * - Detects self-dealing via sender bank account number or sender name vs vendor KYC / settlement name
 * - Flags missing sender_name in live mode for manual review
 */
export async function evaluateDepositWebhookRisk(params: {
  transactionId: string;
  vendorId?: string | null;
  totalDepositedNgn: number;
  senderAccountNumber?: string | null;
  senderBankCode?: string | null;
  senderName?: string | null;
  buyerIpHash?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<RiskEvaluationResult> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const riskCfg = await getRiskEngineConfigServer();
  const payoutSafetyCfg = await getPayoutSafetyConfigServer();
  const tierCfg = await getTierConfigServer();
  const globalMaxOrder = await getMaxOrderNgnServer();
  const globalMaxDaily = await getMaxDailyVendorVolumeNgnServer();
  const tierUpgradeThreshold = await getTierUpgradeThresholdServer();
  const tier1OrderLimitNgn = await getTier1OrderLimitNgnServer();
  const weights = riskCfg.weights;
  const signals: RiskSignalHit[] = [];

  let vendor: Record<string, any> | null = null;
  if (params.vendorId) {
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', params.vendorId)
      .maybeSingle();
    const overlay =
      ((globalThis as any).__relyvoraVendorSafetyOverlay as Map<string, any> | undefined)?.get(
        params.vendorId
      ) || {};
    if (data) {
      vendor = {
        ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
        ...overlay,
      };
    } else if (Object.keys(overlay).length > 0) {
      vendor = overlay;
    }
  }

  if (vendor) {
    const limits = computeVendorEffectiveTierLimits({
      tier: vendor.tier,
      capOverrideUnlimited: vendor.cap_override_unlimited,
      successfulSalesCount: vendor.successful_sales_count,
      completedOrdersCount: vendor.completed_orders_count,
      disputesCount: vendor.disputes_count,
      tierUpgradeThreshold,
      tier1OrderLimitNgn,
      tierConfig: tierCfg,
      globalMaxOrderNgn: globalMaxOrder,
      globalMaxDailyNgn: globalMaxDaily,
    });

    // 1. Deposit above vendor tier order cap or daily volume cap -> HOLD + alert, never auto-release
    let exceedsOrderCap = false;
    let exceedsDailyCap = false;
    let existingDailyVolume = 0;

    if (limits.perOrderCapNgn !== null && params.totalDepositedNgn > limits.perOrderCapNgn) {
      exceedsOrderCap = true;
    }

    if (!exceedsOrderCap && limits.dailyVolumeCapNgn !== null && params.vendorId) {
      const now = new Date();
      const startOfUtcDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const resetAtMs = vendor.daily_volume_reset_at ? new Date(vendor.daily_volume_reset_at).getTime() : 0;
      const startIso = new Date(Math.max(startOfUtcDayMs, resetAtMs)).toISOString();
      const { data: todayTxs } = await supabase
        .from('transactions')
        .select('id, total_amount, resolution_notes')
        .eq('vendor_id', params.vendorId)
        .neq('id', params.transactionId)
        .gte('created_at', startIso)
        .neq('status', 'CANCELLED')
        .neq('status', 'REFUNDED');
      existingDailyVolume = (todayTxs || [])
        .filter((row: any) => String(row.resolution_notes || '').toUpperCase() !== 'TEST')
        .reduce((acc: number, row: any) => acc + Number(row.total_amount || 0), 0);
      if (existingDailyVolume + params.totalDepositedNgn > limits.dailyVolumeCapNgn) {
        exceedsDailyCap = true;
      }
    }

    if (exceedsOrderCap || exceedsDailyCap) {
      signals.push({
        code: 'DEPOSIT_EXCEEDS_TIER_CAP',
        weight: weights.DEPOSIT_EXCEEDS_TIER_CAP ?? 3,
        detail: exceedsOrderCap
          ? `Deposit of ₦${params.totalDepositedNgn.toLocaleString()} exceeds vendor tier ${limits.tier} per-order cap of ₦${limits.perOrderCapNgn?.toLocaleString()}. Payout held for manual review.`
          : `Deposit of ₦${params.totalDepositedNgn.toLocaleString()} brings daily volume to ₦${(existingDailyVolume + params.totalDepositedNgn).toLocaleString()}, exceeding vendor tier ${limits.tier} daily cap of ₦${limits.dailyVolumeCapNgn?.toLocaleString()}. Payout held for manual review.`,
      });
    }

    // 2. Self-dealing: sender bank account equals vendor's own settlement account number
    const cleanSenderAcct = String(params.senderAccountNumber || '').trim();
    const cleanVendorAcct = String(vendor.settlement_account_number || '').trim();
    if (cleanSenderAcct && cleanVendorAcct && cleanSenderAcct === cleanVendorAcct) {
      signals.push({
        code: 'SELF_DEALING_ACCOUNT_MATCH',
        weight: weights.SELF_DEALING_ACCOUNT_MATCH ?? 6,
        detail: `Depositor account (****${cleanSenderAcct.slice(-4)}) matches vendor settlement account.`,
      });
    }

    // 3. Self-dealing: depositor sender_name matches vendor legal or settlement name
    const cleanSenderName = String(params.senderName || '').trim();
    const vendorKycName = [vendor.legal_first_name || '', vendor.legal_last_name || '']
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ');
    const vendorSettlementName = String(vendor.settlement_account_name || '').trim();

    if (cleanSenderName) {
      const kycMatch = vendorKycName
        ? computeNameSimilarityScore(cleanSenderName, vendorKycName)
        : { score: 0 };
      const settleMatch = vendorSettlementName
        ? computeNameSimilarityScore(cleanSenderName, vendorSettlementName)
        : { score: 0 };

      const maxSelfScore = Math.max(kycMatch.score, settleMatch.score);
      if (maxSelfScore >= payoutSafetyCfg.name_match_min_score) {
        signals.push({
          code: 'SELF_DEALING_NAME_MATCH',
          weight: weights.SELF_DEALING_NAME_MATCH ?? 6,
          detail: `Depositor name "${cleanSenderName}" matches vendor KYC/settlement name (score ${maxSelfScore}). Possible self-dealing blocked.`,
        });
      }
    } else if (isLiveMode() || process.env.FLAG_MISSING_SENDER_NAME === 'true') {
      signals.push({
        code: 'MISSING_DEPOSIT_SENDER_NAME',
        weight: weights.MISSING_DEPOSIT_SENDER_NAME ?? 3,
        detail: 'Deposit webhook omitted sender accountName; held for self-dealing & origin verification.',
      });
    }
  } else if (!params.senderName && (isLiveMode() || process.env.FLAG_MISSING_SENDER_NAME === 'true')) {
    signals.push({
      code: 'MISSING_DEPOSIT_SENDER_NAME',
      weight: weights.MISSING_DEPOSIT_SENDER_NAME ?? 3,
      detail: 'Deposit webhook omitted sender accountName; held for manual verification.',
    });
  }

  return finalizeEvaluation(signals, riskCfg.review_hold_threshold, riskCfg.block_threshold);
}

export async function persistRiskEvaluation(params: {
  transactionId?: string | null;
  vendorId?: string | null;
  vendorHandle?: string | null;
  evaluation: RiskEvaluationResult;
  extraTxPatch?: Record<string, any>;
  metadata?: Record<string, any>;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<void> {
  const supabase = params.supabaseClient || getServiceSupabase();
  const { evaluation } = params;
  const nowIso = new Date().toISOString();

  if (params.transactionId) {
    const store = getRiskFallbackStore();
    const prevTx = store.txRisk.get(params.transactionId);
    const mergedReviewHold = Boolean(prevTx?.review_hold) || evaluation.reviewHold;
    const mergedBlocked = Boolean(prevTx?.order_blocked) || evaluation.orderBlocked;
    const mergedSignals = [...(prevTx?.risk_signals || []), ...evaluation.signals];
    const mergedScore = Math.max(prevTx?.risk_score || 0, evaluation.score);
    const mergedReason = [prevTx?.review_hold_reason, evaluation.reason].filter(Boolean).join(' | ') || null;

    const txPatch: Record<string, any> = {
      ...(params.extraTxPatch || {}),
      risk_score: mergedScore,
      risk_signals: mergedSignals,
      review_hold: mergedReviewHold,
      review_hold_reason: mergedReason,
      order_blocked: mergedBlocked,
      order_block_reason: mergedBlocked ? mergedReason : null,
      updated_at: nowIso,
    };

    store.txRisk.set(params.transactionId, {
      ...(prevTx || {}),
      risk_score: mergedScore,
      risk_signals: mergedSignals,
      review_hold: mergedReviewHold,
      review_hold_reason: mergedReason,
      order_blocked: mergedBlocked,
      order_block_reason: mergedBlocked ? mergedReason : null,
    });

    const { error } = await supabase
      .from('transactions')
      .update(txPatch)
      .eq('id', params.transactionId);

    if (error && !isSchemaMissingError(error)) {
      console.warn('Risk tx update error:', error.message);
    }
  }

  if (evaluation.signals.length > 0 && evaluation.actionTaken !== 'ALLOW') {
    const flagStatus = evaluation.orderBlocked ? 'BLOCKED' : 'OPEN';
    const flagRecord: RiskFlagFallbackRecord = {
      id: `rf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      transaction_id: params.transactionId || null,
      vendor_id: params.vendorId || null,
      score: evaluation.score,
      severity: evaluation.severity,
      action_taken: evaluation.actionTaken,
      signals: evaluation.signals,
      status: flagStatus,
      cleared_by: null,
      cleared_reason: null,
      cleared_at: null,
      metadata: params.metadata || {},
      created_at: nowIso,
    };

    const store = getRiskFallbackStore();
    store.riskFlags.unshift(flagRecord);
    if (store.riskFlags.length > 200) store.riskFlags.length = 200;

    try {
      await supabase.from('risk_flags').insert({
        transaction_id: flagRecord.transaction_id,
        vendor_id: flagRecord.vendor_id,
        score: flagRecord.score,
        severity: flagRecord.severity,
        action_taken: flagRecord.action_taken,
        signals: flagRecord.signals,
        status: flagRecord.status,
        metadata: flagRecord.metadata,
        created_at: nowIso,
        updated_at: nowIso,
      });
    } catch {
      // schema fallback preserved in memory store
    }

    await sendSystemAlert({
      type: evaluation.orderBlocked ? 'ORDER_BLOCKED' : 'RISK_HOLD',
      severity: evaluation.orderBlocked || evaluation.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
      title: evaluation.orderBlocked
        ? `Order Blocked by Risk Engine (Score ${evaluation.score})`
        : `Order Held for Risk Review (Score ${evaluation.score})`,
      transactionId: params.transactionId || undefined,
      vendorHandle: params.vendorHandle || undefined,
      details: {
        score: evaluation.score,
        severity: evaluation.severity,
        actionTaken: evaluation.actionTaken,
        signals: evaluation.signals.map((s) => `${s.code} (+${s.weight}): ${s.detail}`),
      },
    }).catch(() => {});
  }
}

export async function listRiskFlagsAndHolds(
  supabaseClient?: ReturnType<typeof getServiceSupabase>
): Promise<RiskFlagFallbackRecord[]> {
  const supabase = supabaseClient || getServiceSupabase();
  try {
    const { data, error } = await supabase
      .from('risk_flags')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && Array.isArray(data)) {
      return data as RiskFlagFallbackRecord[];
    }
  } catch {
    // fallback below
  }

  return [...getRiskFallbackStore().riskFlags];
}

export async function clearTransactionRiskHold(params: {
  transactionId: string;
  adminEmail: string;
  reason: string;
  unblock?: boolean;
  ipAddress?: string | null;
  supabaseClient?: ReturnType<typeof getServiceSupabase>;
}): Promise<{ success: boolean; statusCode: number; error?: string; clearedFlagsCount?: number }> {
  const reason = String(params.reason || '').trim();
  if (!reason) {
    return {
      success: false,
      statusCode: 400,
      error: 'A non-empty reason is required to clear a risk review hold.',
    };
  }

  const supabase = params.supabaseClient || getServiceSupabase();
  const nowIso = new Date().toISOString();

  // Attempt atomic DB RPC first
  try {
    const { data, error } = await supabase.rpc('rpc_admin_clear_risk_hold', {
      p_transaction_id: params.transactionId,
      p_admin_email: params.adminEmail,
      p_reason: reason,
      p_unblock: Boolean(params.unblock),
      p_ip_address: params.ipAddress || null,
    });

    if (!error && data) {
      const store = getRiskFallbackStore();
      const prev = store.txRisk.get(params.transactionId);
      if (prev) {
        prev.review_hold = false;
        if (params.unblock) prev.order_blocked = false;
      }
      for (const rf of store.riskFlags) {
        if (rf.transaction_id === params.transactionId && (rf.status === 'OPEN' || rf.status === 'BLOCKED')) {
          rf.status = 'CLEARED';
          rf.cleared_by = params.adminEmail;
          rf.cleared_reason = reason;
          rf.cleared_at = nowIso;
        }
      }
      return {
        success: Boolean(data.success),
        statusCode: data.status_code || (data.success ? 200 : 400),
        error: data.error,
        clearedFlagsCount: data.cleared_flags_count || 0,
      };
    }

    if (error && !isSchemaMissingError(error) && !String(error.message || '').includes('function public.rpc_admin_clear_risk_hold')) {
      return { success: false, statusCode: 500, error: error.message };
    }
  } catch {
    // fallback if RPC not yet applied on Staging
  }

  // Fallback path for unmigrated Staging DB
  const store = getRiskFallbackStore();
  const prev = store.txRisk.get(params.transactionId);
  if (prev) {
    prev.review_hold = false;
    prev.review_hold_reason = null;
    if (params.unblock) {
      prev.order_blocked = false;
      prev.order_block_reason = null;
    }
  }
  let clearedCount = 0;
  for (const rf of store.riskFlags) {
    if (rf.transaction_id === params.transactionId && (rf.status === 'OPEN' || rf.status === 'BLOCKED')) {
      rf.status = 'CLEARED';
      rf.cleared_by = params.adminEmail;
      rf.cleared_reason = reason;
      rf.cleared_at = nowIso;
      clearedCount += 1;
    }
  }

  return { success: true, statusCode: 200, clearedFlagsCount: clearedCount };
}
