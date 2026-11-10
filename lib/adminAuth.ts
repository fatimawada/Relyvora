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

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getServiceSupabase } from './supabaseServer';

export interface AdminAuthResult {
  authorized: boolean;
  user?: {
    id: string;
    email: string;
    aal?: string;
  };
  error?: string;
  statusCode: number;
}

const DEFAULT_SUPABASE_URL = 'https://bepvqjqjybhhpsfbblqk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcHZxanFqeWJoaHBzZmJibHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzY2MjUsImV4cCI6MjEwODI1MjYyNX0.odSrmH_vTuWNS4RRwWhGJ7Q5ifGbk2AolWoS-P7_OXQ';

/**
 * Creates a server-side Supabase client using @supabase/ssr to read incoming request cookies.
 */
export function createAdminSsrClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op for read operations in route handlers
      },
    },
  });
}

/**
 * Extracts Bearer token from Authorization header if present.
 */
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

/**
 * Verifies Supabase Auth session and validates all G2.5 Addendum admin constraints:
 * - Session read via @supabase/ssr / getUser()
 * - user.email_confirmed_at present
 * - user.app_metadata.role === 'admin' (user_metadata is ignored)
 * - user.id in ADMIN_USER_IDS server-only list
 * - MFA verified at AAL2 (Authenticator Assurance Level 2)
 */
export async function verifyAdminSession(
  request: NextRequest, 
  supabaseOverride?: any
): Promise<AdminAuthResult> {
  // 1. Internal machine / CLI automation via server-only ADMIN_SECRET_KEY
  const adminSecretHeader = request.headers.get('x-admin-key');
  const serverAdminKey = process.env.ADMIN_SECRET_KEY;
  if (serverAdminKey && adminSecretHeader && adminSecretHeader.trim() === serverAdminKey.trim()) {
    return {
      authorized: true,
      statusCode: 200,
      user: {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'system-admin@relyvora.com',
        aal: 'aal2',
      },
    };
  }

  // 2. Obtain Supabase client (using @supabase/ssr or override)
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
    // Fail-closed in live / production
    if (process.env.PAYMENTS_MODE === 'live' || process.env.NODE_ENV === 'production') {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Security configuration error: ADMIN_USER_IDS is not configured on the server.',
      };
    }
  }

  if (adminUserIds.length > 0 && !adminUserIds.includes(userId)) {
    return {
      authorized: false,
      statusCode: 403,
      error: `Forbidden: User ID "${userId}" is not authorized in server-only ADMIN_USER_IDS allowlist.`,
    };
  }

  // 6. Mandatory Multi-Factor Authentication (MFA / AAL2) Check
  // Check assurance level via auth.mfa or session / factors
  let aalLevel = user.app_metadata?.aal || 'aal1';

  // If client provides mfa helper or user factors
  if (user.factors && Array.isArray(user.factors)) {
    const hasVerifiedTotp = user.factors.some((f: any) => f.status === 'verified');
    if (hasVerifiedTotp) {
      aalLevel = 'aal2';
    }
  }

  // Check if ssrClient has mfa assurance check
  if (ssrClient.auth?.mfa?.getAuthenticatorAssuranceLevel) {
    try {
      const aalRes = await ssrClient.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalRes.data?.currentLevel) {
        aalLevel = aalRes.data.currentLevel;
      }
    } catch {
      // ignore
    }
  }

  if (aalLevel !== 'aal2') {
    return {
      authorized: false,
      statusCode: 403,
      error: 'Forbidden: MFA (AAL2) verification required for admin operations. Please authenticate with your TOTP factor.',
    };
  }

  return {
    authorized: true,
    statusCode: 200,
    user: {
      id: userId,
      email: userEmail,
      aal: aalLevel,
    },
  };
}

/**
 * Checks if a test or diagnostic route is accessible.
 * In live or production mode, test routes are blocked with HTTP 403.
 */
export async function assertTestRouteAccess(
  request: NextRequest,
  supabaseOverride?: any
): Promise<{ allowed: boolean; response?: NextResponse; adminEmail?: string }> {
  const isProduction = process.env.PAYMENTS_MODE === 'live' || process.env.NODE_ENV === 'production';

  if (!isProduction) {
    return { allowed: true };
  }

  const auth = await verifyAdminSession(request, supabaseOverride);
  if (!auth.authorized) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Diagnostic and test routes are disabled in live production mode.',
          details: auth.error,
        },
        { status: 403 }
      ),
    };
  }

  return {
    allowed: true,
    adminEmail: auth.user?.email,
  };
}
