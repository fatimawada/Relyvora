/**
 * Strict Server-Side Admin Authentication & Authorization
 * Phase G2.5 Security Hardening
 * 
 * Enforces real Supabase Auth session verification via getUser() and validates
 * that the authenticated user's email is on the server-only ADMIN_EMAIL_ALLOWLIST.
 * Rejects with 401 (Unauthenticated) or 403 (Unauthorized / Not Allowlisted).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from './supabaseServer';

export interface AdminAuthResult {
  authorized: boolean;
  user?: {
    id: string;
    email: string;
  };
  error?: string;
  statusCode: number;
}

/**
 * Extracts session token from Authorization Bearer header or Supabase cookies.
 */
function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }

  const cookieHeader = request.headers.get('cookie') || '';
  // Check common Supabase cookie patterns
  const match = 
    cookieHeader.match(/sb-[a-zA-Z0-9_-]+-auth-token=([^;]+)/) ||
    cookieHeader.match(/sb-access-token=([^;]+)/);

  if (match) {
    try {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.startsWith('[')) {
        const parsed = JSON.parse(decoded);
        return typeof parsed[0] === 'string' ? parsed[0] : null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Verifies Supabase Auth session token and checks admin allowlist.
 */
export async function verifyAdminSession(
  request: NextRequest, 
  supabaseOverride?: any
): Promise<AdminAuthResult> {
  // 1. Allow internal machine / CLI authentication via server-only ADMIN_SECRET_KEY header
  const adminSecretHeader = request.headers.get('x-admin-key');
  const serverAdminKey = process.env.ADMIN_SECRET_KEY;
  if (serverAdminKey && adminSecretHeader && adminSecretHeader.trim() === serverAdminKey.trim()) {
    return {
      authorized: true,
      statusCode: 200,
      user: {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'system-admin@relyvora.com',
      },
    };
  }

  // 2. Extract JWT token
  const token = extractToken(request);
  if (!token) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Authentication required: Missing Supabase session access token.',
    };
  }

  // 3. Verify session cryptographically via Supabase Auth getUser()
  const supabase = supabaseOverride || getServiceSupabase();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user || !data.user.email) {
    return {
      authorized: false,
      statusCode: 401,
      error: `Authentication failed: ${error?.message || 'Invalid or expired session token.'}`,
    };
  }

  const user = data.user;
  const userEmail = user.email.toLowerCase().trim();

  // 4. Server-only allowlist check (never NEXT_PUBLIC_)
  const rawAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST || '';
  const allowlist = rawAllowlist
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) {
    // In production, an empty allowlist must fail closed
    if (process.env.PAYMENTS_MODE === 'live' || process.env.NODE_ENV === 'production') {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Security configuration error: ADMIN_EMAIL_ALLOWLIST is not configured on the server.',
      };
    }
    // In local sandbox / test environment fallback for development
    if (userEmail.endsWith('@relyvora.com')) {
      return {
        authorized: true,
        statusCode: 200,
        user: { id: user.id, email: userEmail },
      };
    }
  }

  if (!allowlist.includes(userEmail)) {
    return {
      authorized: false,
      statusCode: 403,
      error: `Access Denied: Email "${userEmail}" is not authorized for administrator operations.`,
    };
  }

  return {
    authorized: true,
    statusCode: 200,
    user: {
      id: user.id,
      email: userEmail,
    },
  };
}

/**
 * Checks if a test or diagnostic route is accessible.
 * In live or production mode, test routes are blocked with HTTP 403
 * unless authenticated as an allowlisted admin.
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
          error: 'Forbidden: Diagnostic and sandbox test routes are disabled in live production mode.',
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
