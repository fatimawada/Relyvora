/**
 * Strict Server-Side Order & Vendor Session Authorization Resolver
 *
 * Rules:
 * 1. Never trust ?viewer=, ?viewerRole=, headers, or body role fields.
 * 2. Actor identity is derived exclusively from:
 *    - AAL2 Admin Session (`verifyAdminSession`),
 *    - Confirmed Supabase Vendor Session matched to `vendors.user_id === user.id` and `tx.vendor_id === vendor.id`, OR
 *    - Signed HttpOnly Buyer Session Cookie (`verifyBuyerSessionForOrder`) bound to `tx.id` + `tx.buyer_phone`.
 * 3. Fails closed on missing tables, columns, or database lookup errors.
 */

import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { createRequestSsrClient, extractRequestBearerToken, verifyVendorOnboardingSession } from '@/lib/vendorAuth';
import { verifyBuyerSessionForOrder } from '@/lib/buyerSession';
import { getVendorAllowlistModeServer } from '@/lib/safetyLimits';
import { sendSystemAlert } from '@/lib/alerts';
import { maskWhatsappNumber } from '@/lib/whatsapp';

export type AuthenticatedOrderActorRole = 'ADMIN' | 'VENDOR' | 'BUYER';

export interface ResolvedOrderActor {
  authenticated: boolean;
  role: AuthenticatedOrderActorRole | null;
  statusCode: number;
  code?: string;
  error?: string;
  adminUserId?: string;
  vendorId?: string;
  vendorUserId?: string;
  buyerPhoneMasked?: string;
}

export interface VendorWriteSessionResult {
  authorized: boolean;
  statusCode: number;
  code?: string;
  error?: string;
  user?: {
    id: string;
    email: string;
    email_confirmed_at: string;
  };
  vendor?: {
    id: string;
    user_id: string | null;
    email: string | null;
    store_name: string;
    kyc_status: string;
    payout_account_verified: boolean;
    settlement_account_name_matched: boolean;
    is_allowlisted: boolean;
    is_suspended: boolean;
    tier: string;
    successful_sales_count: number;
    completed_orders_count: number;
    disputes_count: number;
    first_order_at: string | null;
    cap_override_unlimited: boolean;
    payout_hold_until: string | null;
    phone_number: string | null;
    phone_hash: string | null;
    phone_verified: boolean | null;
    legal_first_name: string | null;
    legal_last_name: string | null;
  };
}

function getAllowlistedAdminIds(): string[] {
  return (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Resolves the authenticated Supabase Vendor profile owned by the signed-in user.
 */
export async function resolveVendorSessionForWrite(
  request: NextRequest,
  supabaseClient?: SupabaseClient
): Promise<VendorWriteSessionResult> {
  const session = await verifyVendorOnboardingSession(request);
  if (!session.authorized || !session.user) {
    return {
      authorized: false,
      statusCode: session.statusCode,
      code: session.code || 'UNAUTHORIZED',
      error: session.error || 'Vendor authentication required.',
    };
  }

  const supabase = supabaseClient || getServiceSupabase();
  const { data: vendor, error } = await supabase
    .from('vendors')
    .select(
      'id, user_id, email, store_name, kyc_status, payout_account_verified, settlement_account_name_matched, is_allowlisted, is_suspended, tier, successful_sales_count, completed_orders_count, disputes_count, first_order_at, cap_override_unlimited, payout_hold_until, phone_number, phone_hash, phone_verified, legal_first_name, legal_last_name'
    )
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Vendor Lookup Failed in Session Resolver (Fail Closed)',
      details: { userId: session.user.id, error: error.message },
    }).catch(() => {});
    throw new Error(`Vendor lookup failed: ${error.message}`);
  }

  if (!vendor) {
    return {
      authorized: false,
      statusCode: 403,
      code: 'VENDOR_NOT_ONBOARDED',
      error: 'No Relyvora vendor profile is linked to this account. Complete onboarding first.',
    };
  }

  if (vendor.is_suspended) {
    return {
      authorized: false,
      statusCode: 403,
      code: 'VENDOR_SUSPENDED',
      error: 'Vendor account is currently suspended.',
    };
  }

  const allowlistMode = await getVendorAllowlistModeServer();
  if (allowlistMode && !vendor.is_allowlisted) {
    return {
      authorized: false,
      statusCode: 403,
      code: 'VENDOR_NOT_ALLOWLISTED',
      error: 'Vendor allowlist mode is currently active and your account is not allowlisted.',
    };
  }

  return {
    authorized: true,
    statusCode: 200,
    user: session.user,
    vendor: vendor as any,
  };
}

/**
 * Strictly determines whether the incoming request acts as ADMIN, owning VENDOR, or BUYER for `tx`.
 * Never reads client-supplied role parameters.
 */
export async function resolveOrderActor(
  request: NextRequest,
  tx: {
    id: string;
    vendor_id?: string | null;
    vendor_handle?: string | null;
    buyer_phone?: string | null;
    buyer_phone_verified?: boolean | null;
    whatsapp_blocked?: boolean | null;
  },
  supabaseClient?: SupabaseClient
): Promise<ResolvedOrderActor> {
  const supabase = supabaseClient || getServiceSupabase();

  // 1. Check if a Supabase Auth session is present (Bearer or SSR cookie)
  let supabaseUser: any = null;
  const ssrClient = createRequestSsrClient(request);
  const bearerToken = extractRequestBearerToken(request);
  try {
    const userRes = bearerToken
      ? await ssrClient.auth.getUser(bearerToken)
      : await ssrClient.auth.getUser();
    if (!userRes?.error && userRes?.data?.user) {
      supabaseUser = userRes.data.user;
    } else if (bearerToken) {
      // Explicit Bearer header failed verification -> do not ignore invalid Bearer credentials
      return {
        authenticated: false,
        role: null,
        statusCode: 401,
        code: 'INVALID_AUTH_TOKEN',
        error: 'Invalid or expired authentication token.',
      };
    }
  } catch {
    if (bearerToken) {
      return {
        authenticated: false,
        role: null,
        statusCode: 401,
        code: 'INVALID_AUTH_TOKEN',
        error: 'Authentication token verification failed.',
      };
    }
  }

  if (supabaseUser) {
    if (!supabaseUser.email_confirmed_at) {
      return {
        authenticated: false,
        role: null,
        statusCode: 403,
        code: 'EMAIL_NOT_CONFIRMED',
        error: 'Email address must be confirmed before accessing order actions.',
      };
    }

    const isAdminUser =
      supabaseUser.app_metadata?.role === 'admin' &&
      getAllowlistedAdminIds().includes(String(supabaseUser.id));

    if (isAdminUser) {
      const adminRes = await verifyAdminSession(request);
      if (adminRes.authorized) {
        return {
          authenticated: true,
          role: 'ADMIN',
          statusCode: 200,
          adminUserId: adminRes.user?.id || String(supabaseUser.id),
        };
      }
      return {
        authenticated: false,
        role: null,
        statusCode: adminRes.statusCode || 403,
        code: adminRes.code || 'MFA_AAL2_REQUIRED',
        error: adminRes.error || 'Admin multi-factor authentication (AAL2) required.',
      };
    }

    // Check Vendor ownership strictly by vendors.user_id === supabaseUser.id AND tx.vendor_id === vendor.id
    const { data: vendorRow, error: vendorErr } = await supabase
      .from('vendors')
      .select('id, user_id, is_suspended')
      .eq('user_id', supabaseUser.id)
      .maybeSingle();

    if (vendorErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Vendor Ownership Lookup Failed in Order Auth (Fail Closed)',
        transactionId: tx.id,
        details: { userId: supabaseUser.id, error: vendorErr.message },
      }).catch(() => {});
      throw new Error(`Vendor ownership lookup failed: ${vendorErr.message}`);
    }

    if (vendorRow && tx.vendor_id && vendorRow.id === tx.vendor_id) {
      return {
        authenticated: true,
        role: 'VENDOR',
        statusCode: 200,
        vendorId: vendorRow.id,
        vendorUserId: String(supabaseUser.id),
      };
    }

    // Signed-in non-owner Supabase user may STILL possess a valid Buyer Session cookie for this order
    const buyerFallback = await verifyBuyerSessionForOrder(request, tx, supabase);
    if (buyerFallback.valid) {
      return {
        authenticated: true,
        role: 'BUYER',
        statusCode: 200,
        buyerPhoneMasked: buyerFallback.maskedPhone || maskWhatsappNumber(tx.buyer_phone),
      };
    }
    if (buyerFallback.present) {
      return {
        authenticated: false,
        role: null,
        statusCode: buyerFallback.statusCode,
        code: buyerFallback.code,
        error: buyerFallback.error,
      };
    }

    return {
      authenticated: false,
      role: null,
      statusCode: 403,
      code: 'FORBIDDEN_ORDER_ACCESS',
      error: 'Forbidden: Your account is neither the owning vendor nor the verified buyer for this order.',
    };
  }

  // 3. Buyer HttpOnly Session Cookie
  const buyerRes = await verifyBuyerSessionForOrder(request, tx, supabase);
  if (buyerRes.valid) {
    return {
      authenticated: true,
      role: 'BUYER',
      statusCode: 200,
      buyerPhoneMasked: buyerRes.maskedPhone || maskWhatsappNumber(tx.buyer_phone),
    };
  }

  if (buyerRes.present) {
    return {
      authenticated: false,
      role: null,
      statusCode: buyerRes.statusCode,
      code: buyerRes.code,
      error: buyerRes.error,
    };
  }

  return {
    authenticated: false,
    role: null,
    statusCode: 401,
    code: 'AUTH_REQUIRED',
    error: 'Authentication required. Sign in as the buyer (via WhatsApp OTP) or the owning vendor.',
  };
}
