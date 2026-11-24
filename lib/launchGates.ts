/**
 * Server-Side Live-Launch Gates (Sandbox-Open / Live-Gated)
 *
 * Strictly gates ONLY these 4 live capabilities on BOTH `PAYMENTS_MODE === 'live'` AND `LAUNCH_STATUS === 'live'`:
 *   1) Real money movement (live Anchor collections, NIP/Book transfers, refunds, live deposits)
 *   2) Live Anchor KYC (production Anchor customer creation, TIER_2 verification, counterparty & deposit accounts)
 *   3) Live WhatsApp to real buyers outside `WHATSAPP_ALLOWED_RECIPIENTS`
 *   4) Sending the 6-digit release code via WhatsApp (`release_code_v1`)
 *
 * Everything else runs openly in sandbox (`PAYMENTS_MODE=sandbox`) with ZERO artificial "Early access",
 * "Waitlisted", "Payments open soon", or "Verification opens when payments go live" locks.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaunchStatus } from './feeConfig';
import { getServerPaymentsMode, type PaymentsMode } from './paymentsMode';
import { getHotSettings } from './safetyLimits';
import { getServiceSupabase } from './supabaseServer';

function parseOptionalBool(raw: unknown): boolean | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === 'true' || s === '1' || s === 'enabled' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'disabled' || s === 'no') return false;
  return null;
}

async function readBooleanGateSetting(params: {
  envKeys: string[];
  settingKey: string;
  defaultValue?: boolean;
}): Promise<boolean> {
  for (const key of params.envKeys) {
    const parsedEnv = parseOptionalBool(process.env[key]);
    if (parsedEnv !== null) {
      return parsedEnv;
    }
  }

  try {
    const settings = await getHotSettings();
    if (settings && params.settingKey in settings) {
      const parsedDb = parseOptionalBool(settings[params.settingKey]);
      if (parsedDb !== null) {
        return parsedDb;
      }
    }
  } catch {
    // Fail closed to defaultValue when system_settings is unavailable
  }

  return params.defaultValue ?? false;
}

export function getLaunchStatusServer(): 'launching' | 'live' {
  return getLaunchStatus();
}

export function isLiveLaunchReady(): boolean {
  return getServerPaymentsMode() === 'live' && getLaunchStatusServer() === 'live';
}

export async function isKycEnabledServer(): Promise<boolean> {
  if (getServerPaymentsMode() !== 'live') {
    return true;
  }
  return getLaunchStatusServer() === 'live';
}

export async function isReleaseCodeTemplateApprovedServer(): Promise<boolean> {
  return readBooleanGateSetting({
    envKeys: [
      'RELEASE_CODE_TEMPLATE_APPROVED',
      'WHATSAPP_RELEASE_CODE_TEMPLATE_APPROVED',
      'NEXT_PUBLIC_RELEASE_CODE_TEMPLATE_APPROVED',
    ],
    settingKey: 'release_code_template_approved',
    defaultValue: false,
  });
}

export type LivePaymentGateCode =
  | 'LAUNCH_NOT_LIVE'
  | 'RELEASE_TEMPLATE_UNAPPROVED'
  | 'VENDOR_KYC_REQUIRED'
  | 'VENDOR_SUSPENDED';

export interface LivePaymentGateResult {
  allowed: boolean;
  statusCode: number;
  code?: LivePaymentGateCode;
  error?: string;
}

/**
 * Gate 1: Real money movement gate.
 * - In `PAYMENTS_MODE=sandbox`: real money never moves; sandbox operations run freely (requiring verified KYC when requested).
 * - In `PAYMENTS_MODE=live`: blocked (`403 LAUNCH_NOT_LIVE`) unless `LAUNCH_STATUS=live`, plus verified KYC.
 */
export async function evaluateRealMoneyMovementGateServer(params?: {
  vendorId?: string | null;
  vendor?: {
    id?: string;
    kyc_status?: string | null;
    is_suspended?: boolean | null;
  } | null;
  requireVendorKyc?: boolean;
  supabaseClient?: SupabaseClient;
}): Promise<LivePaymentGateResult> {
  const mode = getServerPaymentsMode();

  if (mode === 'live' && getLaunchStatusServer() !== 'live') {
    return {
      allowed: false,
      statusCode: 403,
      code: 'LAUNCH_NOT_LIVE',
      error: 'Live money movement is gated until both PAYMENTS_MODE=live and LAUNCH_STATUS=live.',
    };
  }

  const requireKyc = params?.requireVendorKyc !== false;
  if (requireKyc) {
    let vendorRecord = params?.vendor ?? null;

    if (!vendorRecord && params?.vendorId) {
      const supabase = params.supabaseClient || getServiceSupabase();
      const { data, error } = await supabase
        .from('vendors')
        .select('id, kyc_status, is_suspended')
        .eq('id', params.vendorId)
        .maybeSingle();

      if (error || !data) {
        return {
          allowed: false,
          statusCode: 403,
          code: 'VENDOR_KYC_REQUIRED',
          error: 'Vendor verification is required before creating or releasing orders.',
        };
      }
      vendorRecord = data;
    }

    if (!vendorRecord) {
      return {
        allowed: false,
        statusCode: 403,
        code: 'VENDOR_KYC_REQUIRED',
        error: 'Vendor verification is required before creating or releasing orders.',
      };
    }

    if (vendorRecord.is_suspended === true) {
      return {
        allowed: false,
        statusCode: 403,
        code: 'VENDOR_SUSPENDED',
        error: 'Vendor account is suspended.',
      };
    }

    if (vendorRecord.kyc_status !== 'verified') {
      return {
        allowed: false,
        statusCode: 403,
        code: 'VENDOR_KYC_REQUIRED',
        error: 'Complete Step 2 vendor verification before creating payment links.',
      };
    }
  }

  return {
    allowed: true,
    statusCode: 200,
  };
}

export const evaluateLivePaymentGateServer = evaluateRealMoneyMovementGateServer;

/**
 * Gate 2: Live Anchor KYC gate.
 * - In `PAYMENTS_MODE=sandbox`: allowed (runs against Anchor Sandbox).
 * - In `PAYMENTS_MODE=live`: blocked (`403 LAUNCH_NOT_LIVE`) unless `LAUNCH_STATUS=live`.
 */
export async function evaluateLiveKycGateServer(): Promise<LivePaymentGateResult> {
  if (getServerPaymentsMode() === 'live' && getLaunchStatusServer() !== 'live') {
    return {
      allowed: false,
      statusCode: 403,
      code: 'LAUNCH_NOT_LIVE',
      error: 'Live Anchor KYC is gated until PAYMENTS_MODE=live and LAUNCH_STATUS=live.',
    };
  }

  return { allowed: true, statusCode: 200 };
}

/**
 * Gate 4: Release code delivery via WhatsApp (`release_code_v1`).
 * - Sent over WhatsApp ONLY when `PAYMENTS_MODE=live` AND `LAUNCH_STATUS=live`.
 * - In sandbox, returns `allowed: false` so the release code displays on screen instead.
 */
export async function evaluateReleaseCodeWhatsappGateServer(): Promise<LivePaymentGateResult> {
  if (!isLiveLaunchReady()) {
    return {
      allowed: false,
      statusCode: 403,
      code: getServerPaymentsMode() === 'live' ? 'LAUNCH_NOT_LIVE' : 'LAUNCH_NOT_LIVE',
      error: 'Release code WhatsApp delivery is gated until PAYMENTS_MODE=live and LAUNCH_STATUS=live.',
    };
  }

  const templateApproved = await isReleaseCodeTemplateApprovedServer();
  if (!templateApproved) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'RELEASE_TEMPLATE_UNAPPROVED',
      error: 'Release code WhatsApp template approval is required in live mode.',
    };
  }

  return { allowed: true, statusCode: 200 };
}

export interface VendorGateSnapshot {
  kycEnabled: boolean;
  paymentsMode: PaymentsMode;
  launchStatus: 'launching' | 'live';
  preLaunch: boolean;
  releaseCodeTemplateApproved: boolean;
  canCreateLinks: boolean;
  paymentsOpenStatus: string;
  liveGates: {
    realMoneyMovement: boolean;
    liveAnchorKyc: boolean;
    liveWhatsappBuyers: boolean;
    releaseCodeWhatsapp: boolean;
  };
}

export async function getVendorGateSnapshotServer(vendor?: {
  kyc_status?: string | null;
  is_suspended?: boolean | null;
  payout_account_verified?: boolean | null;
  settlement_account_name_matched?: boolean | null;
} | null): Promise<VendorGateSnapshot> {
  const [kycEnabled, releaseCodeTemplateApproved] = await Promise.all([
    isKycEnabledServer(),
    isReleaseCodeTemplateApprovedServer(),
  ]);
  const paymentsMode = getServerPaymentsMode();
  const launchStatus = getLaunchStatusServer();
  const liveReady = paymentsMode === 'live' && launchStatus === 'live';

  const kycVerified =
    Boolean(vendor) &&
    vendor?.is_suspended !== true &&
    vendor?.kyc_status === 'verified' &&
    vendor?.payout_account_verified === true &&
    vendor?.settlement_account_name_matched === true;

  const canCreateLinks =
    paymentsMode === 'sandbox'
      ? kycVerified
      : liveReady && kycVerified;

  let paymentsOpenStatus = '';
  if (paymentsMode === 'sandbox') {
    paymentsOpenStatus = kycVerified
      ? 'Test mode active'
      : 'Complete Step 2 verification';
  } else if (liveReady) {
    paymentsOpenStatus = kycVerified
      ? 'Live payments active'
      : 'Complete KYC verification to create payment links';
  } else {
    paymentsOpenStatus = 'Live launch pending';
  }

  return {
    kycEnabled,
    paymentsMode,
    launchStatus,
    preLaunch: paymentsMode === 'live' && launchStatus !== 'live',
    releaseCodeTemplateApproved,
    canCreateLinks,
    paymentsOpenStatus,
    liveGates: {
      realMoneyMovement: liveReady,
      liveAnchorKyc: liveReady,
      liveWhatsappBuyers: liveReady,
      releaseCodeWhatsapp: liveReady && releaseCodeTemplateApproved,
    },
  };
}
