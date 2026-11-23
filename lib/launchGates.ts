/**
 * Server-Side Feature, KYC, Waitlist, and Live Payment Gates (Option B)
 *
 * Fail-closed defaults:
 * - KYC_ENABLED defaults to false (`Verification opens when payments go live.`)
 * - RELEASE_CODE_TEMPLATE_APPROVED defaults to false
 * - Payment actions & link creation require ALL FOUR:
 *   1) PAYMENTS_MODE === 'live'
 *   2) LAUNCH_STATUS === 'live'
 *   3) Vendor KYC is 'verified' (and not suspended)
 *   4) Release code template is approved
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaunchStatus, isPreLaunchFlag } from './feeConfig';
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
    // Fail closed to defaultValue when system_settings is unavailable or pre-migration
  }

  return params.defaultValue ?? false;
}

export async function isKycEnabledServer(): Promise<boolean> {
  return readBooleanGateSetting({
    envKeys: ['KYC_ENABLED', 'NEXT_PUBLIC_KYC_ENABLED'],
    settingKey: 'kyc_enabled',
    defaultValue: false,
  });
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

export function getLaunchStatusServer(): 'launching' | 'live' {
  return getLaunchStatus();
}

export type LivePaymentGateCode =
  | 'PAYMENTS_NOT_LIVE'
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

export async function evaluateLivePaymentGateServer(params?: {
  vendorId?: string | null;
  vendor?: {
    id?: string;
    kyc_status?: string | null;
    is_suspended?: boolean | null;
  } | null;
  requireVendorKyc?: boolean;
  supabaseClient?: SupabaseClient;
}): Promise<LivePaymentGateResult> {
  if (getServerPaymentsMode() !== 'live') {
    return {
      allowed: false,
      statusCode: 403,
      code: 'PAYMENTS_NOT_LIVE',
      error: 'Payments open soon. Payment actions are closed until live payments are active.',
    };
  }

  if (getLaunchStatusServer() !== 'live') {
    return {
      allowed: false,
      statusCode: 403,
      code: 'LAUNCH_NOT_LIVE',
      error: 'Payments open soon. Public payments have not launched yet.',
    };
  }

  const templateApproved = await isReleaseCodeTemplateApprovedServer();
  if (!templateApproved) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'RELEASE_TEMPLATE_UNAPPROVED',
      error: 'Payments open soon. WhatsApp release code template approval is still pending.',
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
          error: 'Vendor verification is required before payment actions are enabled.',
        };
      }
      vendorRecord = data;
    }

    if (!vendorRecord) {
      return {
        allowed: false,
        statusCode: 403,
        code: 'VENDOR_KYC_REQUIRED',
        error: 'Vendor verification is required before payment actions are enabled.',
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
        error: 'Payments open soon. Vendor KYC verification must be verified first.',
      };
    }
  }

  return {
    allowed: true,
    statusCode: 200,
  };
}

export interface VendorGateSnapshot {
  kycEnabled: boolean;
  paymentsMode: PaymentsMode;
  launchStatus: 'launching' | 'live';
  preLaunch: boolean;
  releaseCodeTemplateApproved: boolean;
  canCreateLinks: boolean;
  paymentsOpenStatus: string;
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
  const preLaunch = isPreLaunchFlag();

  const kycVerified =
    Boolean(vendor) &&
    vendor?.is_suspended !== true &&
    vendor?.kyc_status === 'verified' &&
    vendor?.payout_account_verified === true &&
    vendor?.settlement_account_name_matched === true;

  const canCreateLinks =
    paymentsMode === 'live' &&
    launchStatus === 'live' &&
    releaseCodeTemplateApproved &&
    kycVerified;

  let paymentsOpenStatus = 'Payments open soon';
  if (canCreateLinks) {
    paymentsOpenStatus = 'Live payments active';
  } else if (
    paymentsMode === 'live' &&
    launchStatus === 'live' &&
    releaseCodeTemplateApproved &&
    kycEnabled &&
    !kycVerified
  ) {
    paymentsOpenStatus = 'Complete KYC verification to create payment links';
  }

  return {
    kycEnabled,
    paymentsMode,
    launchStatus,
    preLaunch,
    releaseCodeTemplateApproved,
    canCreateLinks,
    paymentsOpenStatus,
  };
}
