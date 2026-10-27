import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get('host') || '';
  const pathname = url.pathname;

  // 1. Detect if request is targeted at the Nigerian market subdomain (ng.relyvora.com)
  // Supports: ng.relyvora.com, ng.localhost:3000, or local dev query param ?market=ng
  const isNgDomain = 
    host.startsWith('ng.') || 
    url.searchParams.get('market') === 'ng';

  // 2. Handle Nigerian Subdomain (ng.relyvora.com)
  if (isNgDomain) {
    // If accessing root of ng.relyvora.com, rewrite to the dedicated Nigerian portal (/ng)
    if (pathname === '/') {
      url.pathname = '/ng';
      return NextResponse.rewrite(url);
    }
    // Allow /vendor, /pay/[id], /order/[id] to pass through directly
    return NextResponse.next();
  }

  // 3. Handle Global Corporate Domain (relyvora.com or standard localhost)
  // Root path '/' serves the Global Corporate Homepage (app/page.tsx)
  if (pathname === '/') {
    return NextResponse.next();
  }

  // In production, if someone visits app transaction routes directly on the root corporate domain,
  // redirect them to the dedicated ng.relyvora.com subdomain
  const isAppRoute = 
    pathname.startsWith('/vendor') || 
    pathname.startsWith('/pay') || 
    pathname.startsWith('/order');

  if (isAppRoute && process.env.NODE_ENV === 'production' && !host.includes('localhost')) {
    const ngRedirectUrl = new URL(request.url);
    ngRedirectUrl.host = 'ng.relyvora.com';
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
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
};
