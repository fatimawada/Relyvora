/**
 * Strict Server-Side Admin Authentication & Authorization
 * Phase G2.5 v2 Security Hardening (G2.5 Addendum)
 * 
 * Enforces:
 * 1. Session reading via @supabase/ssr createServerClient or Bearer token
 * 2. Mandatory email confirmation (user.email_confirmed_at must not be null)
 * 3. Service-role blessed administrative role (user.app_metadata.role === 'admin')
 *    - user_metadata.role is strictly IGNORED to prevent client-side privilege escalation
 * 4. Server-only ADMIN_USER_IDS allowlist (user.id must match; email-only allowlisting ignored)
 * 5. Multi-Factor Authentication requirement (AAL2 - Authenticator Assurance Level 2)
 */

import { NextRequest } from 'next/server';
import { getServiceSupabase } from './supabaseServer';
import { createRequestSsrClient, extractRequestBearerToken } from './vendorAuth';
import { getAdminSafetyConfigServer } from './safetyLimits';

export type AdminAuthErrorCode =
  | 'UNAUTHORIZED'
  | 'EMAIL_NOT_CONFIRMED'
  | 'ADMIN_ROLE_REQUIRED'
  | 'ALLOWLIST_REQUIRED'
  | 'MFA_NOT_ENROLLED'
  | 'MFA_AAL2_REQUIRED'
  | 'SESSION_EXPIRED';

export interface AdminAuthResult {
  authorized: boolean;
  code?: AdminAuthErrorCode;
  aal?: string;
  mfaEnrolled?: boolean;
  enrollmentUrl?: string;
  user?: {
    id: string;
    email: string;
    aal?: string;
  };
  error?: string;
  statusCode: number;
}

/**
 * Creates a server-side Supabase client using @supabase/ssr to read incoming request cookies.
 */
export function createAdminSsrClient(request: NextRequest) {
  return createRequestSsrClient(request);
}

/**
 * Extracts Bearer token from Authorization header if present.
 */
function extractBearerToken(request: NextRequest): string | null {
  return extractRequestBearerToken(request);
}

/**
 * Verifies Supabase Auth session and validates all G2.5 Addendum admin constraints:
 * - Session read via @supabase/ssr / getUser()
 * - user.email_confirmed_at present
 * - user.app_metadata.role === 'admin' (user_metadata is ignored)
 * - user.id in ADMIN_USER_IDS server-only list
 * - MFA verified at AAL2 (Authenticator Assurance Level 2)
 */
function decodeJwtPayload(token?: string | null): Record<string, any> | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function decodeJwtAal(token?: string | null): string | undefined {
  const payload = decodeJwtPayload(token);
  return typeof payload?.aal === 'string' ? payload.aal : undefined;
}

export async function verifyAdminIdentityForMfaSetup(
  request: NextRequest,
  supabaseOverride?: any
): Promise<AdminAuthResult> {
  return verifyAdminSession(request, supabaseOverride, { requireAal2: false });
}

export async function verifyAdminSession(
  request: NextRequest,
  supabaseOverride?: any,
  options?: { requireAal2?: boolean }
): Promise<AdminAuthResult> {
  // 1. Obtain Supabase client (using @supabase/ssr or bearer token)
  const ssrClient = supabaseOverride || createAdminSsrClient(request);

  let user: any = null;
  let authError: any = null;

  // Try extracting Bearer token first
  const bearerToken = extractBearerToken(request);
  if (bearerToken) {
    const res = await ssrClient.auth.getUser(bearerToken);
    user = res.data?.user;
    authError = res.error;
  } else {
    // Read session cookies via @supabase/ssr
    const res = await ssrClient.auth.getUser();
    user = res.data?.user;
    authError = res.error;
  }

  if (authError || !user) {
    return {
      authorized: false,
      statusCode: 401,
      error: `Authentication required: ${authError?.message || 'Missing or invalid Supabase Auth session.'}`,
    };
  }

  const userId = user.id;
  const userEmail = (user.email || '').toLowerCase().trim();

  // 3. Mandatory Email Confirmation Check (user.email_confirmed_at)
  if (!user.email_confirmed_at) {
    return {
      authorized: false,
      statusCode: 403,
      error: 'Forbidden: Admin account email address has not been confirmed.',
    };
  }

  // 4. Role Authorization: app_metadata.role must strictly be 'admin'
  // Note: user_metadata is user-editable and NEVER trusted.
  const appRole = user.app_metadata?.role;
  if (appRole !== 'admin') {
    return {
      authorized: false,
      statusCode: 403,
      error: 'Forbidden: Insufficient privileges. Admin role must be set in app_metadata by service role.',
    };
  }

  // 5. Server-Only ADMIN_USER_IDS Allowlist (Email-only allowlisting ignored)
  const rawAdminUserIds = process.env.ADMIN_USER_IDS || '';
  const adminUserIds = rawAdminUserIds
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (adminUserIds.length === 0) {
    return {
      authorized: false,
      statusCode: 403,
      code: 'ALLOWLIST_REQUIRED',
      error: 'Security configuration error: ADMIN_USER_IDS is not configured on the server.',
    };
  }

  if (!adminUserIds.includes(userId)) {
    return {
      authorized: false,
      statusCode: 403,
      error: `Forbidden: User ID "${userId}" is not authorized in server-only ADMIN_USER_IDS allowlist.`,
    };
  }

  // 6. Mandatory Multi-Factor Authentication (MFA / AAL2) Check
  // Never upgrade aalLevel solely from user.factors; require verified AAL2 on active session/JWT.
  const jwtToken = extractBearerToken(request);
  const jwtAal = decodeJwtAal(jwtToken);
  let aalLevel: string = (user as any).aal || jwtAal || user.app_metadata?.aal || 'aal1';

  let mfaEnrolled = Array.isArray(user.factors)
    ? user.factors.some((f: any) => f.status === 'verified')
    : false;

  // Check if ssrClient has MFA assurance check (authoritative when cookie session is active)
  if (ssrClient.auth?.mfa?.getAuthenticatorAssuranceLevel) {
    try {
      const aalRes = await ssrClient.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalRes.data?.currentLevel) {
        aalLevel = aalRes.data.currentLevel;
      }
      if (aalRes.data?.nextLevel === 'aal2') {
        mfaEnrolled = true;
      }
    } catch {
      // ignore
    }
  }

  if (!mfaEnrolled && ssrClient.auth?.mfa?.listFactors) {
    try {
      const factorsRes = await ssrClient.auth.mfa.listFactors();
      const verifiedFactors = [
        ...(Array.isArray(factorsRes?.data?.totp) ? factorsRes.data.totp : []),
        ...(Array.isArray(factorsRes?.data?.all) ? factorsRes.data.all : []),
      ];
      if (verifiedFactors.some((f: any) => f.status === 'verified')) {
        mfaEnrolled = true;
      }
    } catch {
      // ignore
    }
  }

  if (aalLevel === 'aal2') {
    mfaEnrolled = true;
  }

  if (options?.requireAal2 === false) {
    return {
      authorized: true,
      statusCode: 200,
      aal: aalLevel,
      mfaEnrolled,
      enrollmentUrl: '/admin/security',
      user: {
        id: user.id,
        email: user.email || '',
        aal: aalLevel,
      },
    };
  }

  if (aalLevel !== 'aal2') {
    const code: AdminAuthErrorCode = mfaEnrolled ? 'MFA_AAL2_REQUIRED' : 'MFA_NOT_ENROLLED';
    return {
      authorized: false,
      statusCode: 403,
      code,
      aal: aalLevel,
      mfaEnrolled,
      enrollmentUrl: '/admin/security',
      user: {
        id: user.id,
        email: user.email || '',
        aal: aalLevel,
      },
      error: mfaEnrolled
        ? 'Forbidden: MFA verification (AAL2) is required. Please verify your TOTP code at /admin/security.'
        : 'Forbidden: TOTP MFA enrollment is required. Please enroll an authenticator app at /admin/security.',
    };
  }

  // 7. Short Admin Session Freshness Enforcement (configurable session_max_age_minutes)
  let sessionJwtPayload = decodeJwtPayload(jwtToken);
  if (!sessionJwtPayload && ssrClient.auth?.getSession) {
    try {
      const sessRes = await ssrClient.auth.getSession();
      sessionJwtPayload = decodeJwtPayload(sessRes?.data?.session?.access_token);
    } catch {
      // ignore session lookup failure
    }
  }
  const issuedAtSec =
    typeof (user as any).session_issued_at === 'number'
      ? (user as any).session_issued_at
      : typeof sessionJwtPayload?.iat === 'number'
        ? sessionJwtPayload.iat
        : undefined;

  if (typeof issuedAtSec === 'number' && Number.isFinite(issuedAtSec)) {
    const adminSafety = await getAdminSafetyConfigServer();
    const maxAgeSec = Math.max(60, Math.round(adminSafety.session_max_age_minutes * 60));
    const ageSec = Math.floor(Date.now() / 1000) - issuedAtSec;
    if (ageSec > maxAgeSec) {
      return {
        authorized: false,
        statusCode: 401,
        code: 'SESSION_EXPIRED',
        aal: aalLevel,
        mfaEnrolled,
        user: {
          id: userId,
          email: userEmail,
          aal: aalLevel,
        },
        error: `Admin session exceeded the ${adminSafety.session_max_age_minutes}-minute maximum age. Please re-authenticate and verify MFA.`,
      };
    }
  }

  return {
    authorized: true,
    statusCode: 200,
    aal: aalLevel,
    mfaEnrolled,
    user: {
      id: userId,
      email: userEmail,
      aal: aalLevel,
    },
  };
}
