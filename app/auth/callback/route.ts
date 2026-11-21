import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseServer';

const DEFAULT_SUPABASE_URL = 'https://bepvqjqjybhhpsfbblqk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcHZxanFqeWJoaHBzZmJibHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzY2MjUsImV4cCI6MjEwODI1MjYyNX0.odSrmH_vTuWNS4RRwWhGJ7Q5ifGbk2AolWoS-P7_OXQ';

function sanitizeNextPath(rawNext: string | null): string | null {
  if (!rawNext) return null;
  const trimmed = rawNext.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const otpType = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const explicitNext = sanitizeNextPath(requestUrl.searchParams.get('next'));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  const pendingCookies: Array<{ name: string; value: string; options?: Record<string, any> }> = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          pendingCookies.push(cookie);
        }
      },
    },
  });

  let authenticatedEmail: string | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.session?.user?.email) {
      authenticatedEmail = data.session.user.email.trim().toLowerCase();
    }
  } else if (tokenHash && otpType) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (!error && data?.session?.user?.email) {
      authenticatedEmail = data.session.user.email.trim().toLowerCase();
    }
  }

  let targetPath = explicitNext || '/vendor/onboarding';

  if (!explicitNext && authenticatedEmail) {
    try {
      const adminDb = getServiceSupabase();
      const { data: existingVendor } = await adminDb
        .from('vendors')
        .select('id, kyc_status')
        .eq('email', authenticatedEmail)
        .maybeSingle();

      if (existingVendor?.kyc_status === 'VERIFIED') {
        targetPath = '/vendor';
      }
    } catch {
      // Default to /vendor/onboarding if lookup fails
    }
  }

  const redirectUrl = new URL(targetPath, requestUrl.origin);
  if (redirectUrl.pathname === '/vendor/onboarding' && !redirectUrl.searchParams.has('confirmed')) {
    redirectUrl.searchParams.set('confirmed', '1');
  }

  const response = NextResponse.redirect(redirectUrl);
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  return response;
}
