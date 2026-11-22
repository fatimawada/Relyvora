import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get('host') || '';
  const pathname = url.pathname;

  // 0. Never intercept any /api/* routes (webhooks, health checks, cron, escrow, vendor)
  //    or /auth/callback with domain/geo/auth rewrites or redirects
  if (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/auth/callback' ||
    pathname.startsWith('/auth/callback/')
  ) {
    return NextResponse.next();
  }

  // 0b. If Supabase redirects an email confirmation link to /?code=... (or /ng?code=...),
  //     forward it to /auth/callback so the PKCE code is exchanged for a session
  if (
    (pathname === '/' || pathname === '/ng') &&
    (url.searchParams.has('code') || url.searchParams.has('token_hash'))
  ) {
    url.pathname = '/auth/callback';
    return NextResponse.redirect(url);
  }

  // 1. Detect if request is targeted at the Foundation subdomain (foundation.relyvora.com)
  const isFoundationDomain = host.startsWith('foundation.');

  // Handle Foundation Subdomain (foundation.relyvora.com)
  if (isFoundationDomain) {
    // If accessing root of foundation.relyvora.com, rewrite to the dedicated Foundation portal (/foundation)
    if (pathname === '/') {
      url.pathname = '/foundation';
      return NextResponse.rewrite(url);
    }
    // Allow direct subpaths under foundation to pass through
    return NextResponse.next();
  }

  // 2. Detect if request is targeted at the Nigerian market app subdomain (ng.relyvora.com or staging.relyvora.com)
  const isNgDomain = host.startsWith('ng.') || host.startsWith('staging.');

  // 3. Handle Nigerian / Staging Subdomain (ng.relyvora.com & staging.relyvora.com)
  if (isNgDomain) {
    // If accessing root of ng.relyvora.com or staging.relyvora.com, rewrite to the dedicated Nigerian portal (/ng)
    if (pathname === '/') {
      url.pathname = '/ng';
      return NextResponse.rewrite(url);
    }
    // Allow /vendor, /pay/[id], /order/[id], and all internal routes to pass through directly on the same host
    return NextResponse.next();
  }

  // 3. Handle Global Corporate Domain (relyvora.com or standard localhost)
  // Root path '/' serves the Global Corporate Homepage (app/page.tsx)
  if (pathname === '/') {
    return NextResponse.next();
  }

  // If someone visits /ng or transaction routes on the root corporate domain,
  // redirect them to the dedicated ng.relyvora.com subdomain in production
  const isAppRoute = 
    pathname === '/ng' ||
    pathname.startsWith('/vendor') || 
    pathname.startsWith('/pay') || 
    pathname.startsWith('/order');

  const isCorporateRootDomain =
    host === 'relyvora.com' ||
    host === 'www.relyvora.com' ||
    host.startsWith('relyvora.com:') ||
    host.startsWith('www.relyvora.com:');

  if (isAppRoute && process.env.NODE_ENV === 'production' && isCorporateRootDomain) {
    const ngRedirectUrl = new URL(request.url);
    ngRedirectUrl.host = 'ng.relyvora.com';
    if (pathname === '/ng') {
      ngRedirectUrl.pathname = '/';
    }
    return NextResponse.redirect(ngRedirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt
     * - api/* (all API routes including webhooks, health, cron must bypass all domain/geo/auth routing)
     * - auth/callback* (Supabase PKCE callback must never be rewritten/redirected)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|api/|api$|auth/callback).*)',
  ],
};
