/**
 * Server-Side Supabase SSR Session & Vendor Onboarding Authentication Helpers
 *
 * Reads authenticated user sessions strictly via @supabase/ssr cookies or verified Bearer JWT,
 * requiring email confirmation before granting access.
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const DEFAULT_SUPABASE_URL = 'https://bepvqjqjybhhpsfbblqk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcHZxanFqeWJoaHBzZmJibHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzY2MjUsImV4cCI6MjEwODI1MjYyNX0.odSrmH_vTuWNS4RRwWhGJ7Q5ifGbk2AolWoS-P7_OXQ';

export type VendorAuthErrorCode =
  | 'UNAUTHORIZED'
  | 'EMAIL_NOT_CONFIRMED'
  | 'EMAIL_MISMATCH'
  | 'VENDOR_NOT_ALLOWLISTED';

export interface VendorSessionResult {
  authorized: boolean;
  statusCode: number;
  code?: VendorAuthErrorCode;
  error?: string;
  user?: {
    id: string;
    email: string;
    email_confirmed_at: string;
  };
}

export function createRequestSsrClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_ANON_KEY;

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

export function extractRequestBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    return token || null;
  }
  return null;
}

/**
 * Verifies an authenticated, email-confirmed Supabase user for vendor onboarding.
 */
export async function verifyVendorOnboardingSession(
  request: NextRequest,
  supabaseOverride?: any
): Promise<VendorSessionResult> {
  const ssrClient = supabaseOverride || createRequestSsrClient(request);
  const bearerToken = extractRequestBearerToken(request);

  let user: any = null;
  try {
    const userRes = bearerToken
      ? await ssrClient.auth.getUser(bearerToken)
      : await ssrClient.auth.getUser();
    if (!userRes?.error && userRes?.data?.user) {
      user = userRes.data.user;
    }
  } catch {
    user = null;
  }

  if (!user || !user.id || !user.email) {
    return {
      authorized: false,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      error: 'Authentication required. Sign in with your verified Relyvora vendor account first.',
    };
  }

  if (!user.email_confirmed_at) {
    return {
      authorized: false,
      statusCode: 403,
      code: 'EMAIL_NOT_CONFIRMED',
      error: 'Forbidden: Your email address must be confirmed before completing vendor onboarding.',
    };
  }

  return {
    authorized: true,
    statusCode: 200,
    user: {
      id: String(user.id),
      email: String(user.email).trim().toLowerCase(),
      email_confirmed_at: String(user.email_confirmed_at),
    },
  };
}
