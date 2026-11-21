/**
 * Mode Mismatch, Trusted IP Startup/Health Checks, Multi-IP Rate-Limit Buckets
 * & WHATSAPP_ALLOWED_RECIPIENTS Production/Staging Verification Suite.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { NextRequest } from 'next/server';
import { getServiceSupabase } from '../lib/supabaseServer';
import {
  assertPaymentsModeConsistency,
  checkPaymentsModeConsistency,
} from '../lib/paymentsMode';
import { checkSharedRateLimit, getClientIp, inspectTrustedClientIp } from '../lib/rateLimit';
import { runServerStartupChecks } from '../lib/startupChecks';
import { evaluateWhatsappRecipientPolicy, getWhatsappRecipientFilterStatus } from '../lib/whatsapp';
import { GET as healthGet } from '../app/api/health/route';
import { GET as authCallbackGet } from '../app/auth/callback/route';
import { middleware, config as middlewareConfig } from '../middleware';
import { getNigeriaAppHref } from '../lib/appUrls';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${message}`);
  } else {
    failed++;
    console.error(`[FAIL] ${message}`);
  }
}

async function runSuite() {
  const origFetch = globalThis.fetch;
  const origNodeEnv = process.env.NODE_ENV;
  const origVercel = process.env.VERCEL;
  const origVercelEnv = process.env.VERCEL_ENV;
  const origPaymentsMode = process.env.PAYMENTS_MODE;
  const origPublicMode = process.env.NEXT_PUBLIC_PAYMENTS_MODE;
  const origResendKey = process.env.RESEND_API_KEY;
  const origWaAllowlist = process.env.WHATSAPP_ALLOWED_RECIPIENTS;

  const capturedAlerts: Array<{ subject: string; html: string }> = [];
  const capturedLogs: string[] = [];
  const origConsoleError = console.error;
  const origConsoleWarn = console.warn;

  const tag = Date.now().toString();
  const ip1 = `102.89.10.${Number(tag.slice(-2)) % 200 + 10}`;
  const ip2 = `102.89.20.${Number(tag.slice(-2)) % 200 + 10}`;
  const spoofedXff = '8.8.8.8, 1.1.1.1';
  const bucketSuffix = `preview_bucket_test_${tag}`;

  process.env.RESEND_API_KEY = 're_test_alert_capture_key';

  console.error = (...args: unknown[]) => {
    const line = args.map((a) => String(a)).join(' ');
    capturedLogs.push(line);
    origConsoleError(...args);
  };
  console.warn = (...args: unknown[]) => {
    const line = args.map((a) => String(a)).join(' ');
    capturedLogs.push(line);
    origConsoleWarn(...args);
  };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes('api.resend.com/emails')) {
      const body = JSON.parse(String(init?.body || '{}'));
      capturedAlerts.push({ subject: String(body.subject || ''), html: String(body.html || '') });
      return new Response(JSON.stringify({ id: `email_probe_${Date.now()}` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return origFetch(input as any, init);
  };

  const supabase = getServiceSupabase();

  try {
    console.log('\n======================================================================');
    console.log('IP HANDLING, MODE MISMATCH, STARTUP/HEALTH & WHATSAPP FILTER SUITE');
    console.log('======================================================================\n');

    // -------------------------------------------------------------------------
    // 1. PAYMENTS_MODE vs NEXT_PUBLIC_PAYMENTS_MODE MISMATCH (Build & Health)
    // -------------------------------------------------------------------------
    console.log('--- 1. PAYMENTS_MODE vs NEXT_PUBLIC_PAYMENTS_MODE MISMATCH ---');
    const matchUnset = checkPaymentsModeConsistency({});
    const matchLive = checkPaymentsModeConsistency({ PAYMENTS_MODE: 'live', NEXT_PUBLIC_PAYMENTS_MODE: 'live' });
    const mismatchLiveVsSandbox = checkPaymentsModeConsistency({
      PAYMENTS_MODE: 'live',
      NEXT_PUBLIC_PAYMENTS_MODE: 'sandbox',
    });
    const mismatchLiveVsUnset = checkPaymentsModeConsistency({ PAYMENTS_MODE: 'live' });
    const mismatchUnsetVsLive = checkPaymentsModeConsistency({ NEXT_PUBLIC_PAYMENTS_MODE: 'live' });
    const invalidMode = checkPaymentsModeConsistency({
      PAYMENTS_MODE: 'invalid',
      NEXT_PUBLIC_PAYMENTS_MODE: 'sandbox',
    });

    let assertThrewOnMismatch = false;
    try {
      assertPaymentsModeConsistency({ PAYMENTS_MODE: 'sandbox', NEXT_PUBLIC_PAYMENTS_MODE: 'live' });
    } catch {
      assertThrewOnMismatch = true;
    }

    assert(
      matchUnset.ok &&
        matchLive.ok &&
        !mismatchLiveVsSandbox.ok &&
        !mismatchLiveVsUnset.ok &&
        !mismatchUnsetVsLive.ok &&
        !invalidMode.ok &&
        assertThrewOnMismatch,
      'Mode consistency helper accepts matching modes and rejects every mismatch/invalid pair'
    );

    // Real Next.js `next build` invocation must fail immediately via next.config.mjs on mismatch
    const nextBin = path.resolve(process.cwd(), 'node_modules/next/dist/bin/next');
    const buildMismatchRun = spawnSync(process.execPath, [nextBin, 'build'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PAYMENTS_MODE: 'live',
        NEXT_PUBLIC_PAYMENTS_MODE: 'sandbox',
      },
      timeout: 30000,
    });
    const buildOutput = `${buildMismatchRun.stdout || ''}\n${buildMismatchRun.stderr || ''}`;
    assert(
      buildMismatchRun.status !== 0 && buildOutput.includes('Mode mismatch'),
      `next build fails cleanly (exit=${buildMismatchRun.status}) when PAYMENTS_MODE=live & NEXT_PUBLIC_PAYMENTS_MODE=sandbox`
    );

    // Health endpoint returns 503 + triggers CRITICAL alert when modes differ
    process.env.PAYMENTS_MODE = 'live';
    process.env.NEXT_PUBLIC_PAYMENTS_MODE = 'sandbox';
    const alertsBeforeModeHealth = capturedAlerts.length;
    const mismatchHealthRes = await healthGet(
      new NextRequest('http://localhost/api/health', {
        headers: { 'x-vercel-forwarded-for': ip1 },
      })
    );
    const mismatchHealthJson = await mismatchHealthRes.json();
    assert(
      mismatchHealthRes.status === 503 &&
        mismatchHealthJson.ok === false &&
        mismatchHealthJson.status === 'degraded' &&
        mismatchHealthJson.modeConsistency?.ok === false &&
        capturedAlerts.length > alertsBeforeModeHealth,
      `GET /api/health returns HTTP ${mismatchHealthRes.status} (ok=false) and alerts ops on mode mismatch`
    );

    // Reset modes to matching sandbox
    process.env.PAYMENTS_MODE = 'sandbox';
    process.env.NEXT_PUBLIC_PAYMENTS_MODE = 'sandbox';

    // -------------------------------------------------------------------------
    // 2. STARTUP & HEALTH CHECK: MISSING TRUSTED IP HEADER IN PRODUCTION
    // -------------------------------------------------------------------------
    console.log('\n--- 2. TRUSTED IP HEADER STARTUP & HEALTH CHECK IN PRODUCTION ---');
    (process.env as any).NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    delete process.env.VERCEL;
    delete process.env.WHATSAPP_ALLOWED_RECIPIENTS;

    const alertsBeforeStartupIp = capturedAlerts.length;
    const logsBeforeStartupIp = capturedLogs.length;
    const startupResult = await runServerStartupChecks({
      env: {
        ...process.env,
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        VERCEL: undefined,
      },
      sendAlerts: true,
    });
    const startupLoggedMissingIp = capturedLogs
      .slice(logsBeforeStartupIp)
      .some((l) => l.includes('STARTUP_TRUSTED_IP_HEADER_MISSING_IN_PRODUCTION'));
    const startupAlertedMissingIp = capturedAlerts
      .slice(alertsBeforeStartupIp)
      .some((a) => a.subject.includes('Trusted Client IP Header Missing in Production'));

    assert(
      startupResult.trustedIpReady === false && startupLoggedMissingIp && startupAlertedMissingIp,
      'runServerStartupChecks logs and alerts ops when trusted IP runtime is missing in production'
    );

    // Health check in production WITHOUT x-vercel-forwarded-for (even with spoofed x-forwarded-for)
    const alertsBeforeHealthIp = capturedAlerts.length;
    const logsBeforeHealthIp = capturedLogs.length;
    const prodNoTrustedIpHealthRes = await healthGet(
      new NextRequest('http://localhost/api/health', {
        headers: { 'x-forwarded-for': spoofedXff, 'x-real-ip': '1.2.3.4' },
      })
    );
    const prodNoTrustedIpJson = await prodNoTrustedIpHealthRes.json();
    const healthLoggedMissingIp = capturedLogs
      .slice(logsBeforeHealthIp)
      .some((l) => l.includes('TRUSTED_IP_HEADER_MISSING_IN_PRODUCTION'));
    const healthAlertedMissingIp = capturedAlerts
      .slice(alertsBeforeHealthIp)
      .some((a) => a.subject.includes('Trusted Client IP Header Missing in Production'));

    assert(
      prodNoTrustedIpHealthRes.status === 200 &&
        prodNoTrustedIpJson.ok === true &&
        prodNoTrustedIpJson.trustedIpHeader?.present === false &&
        prodNoTrustedIpJson.trustedIpHeader?.alertedMissingInProd === true &&
        healthLoggedMissingIp &&
        healthAlertedMissingIp,
      'GET /api/health in production logs and sends Resend alert when x-vercel-forwarded-for is missing (even if spoofed XFF is present)'
    );

    // Health check in production WITH x-vercel-forwarded-for
    const alertsBeforeGoodIp = capturedAlerts.length;
    const prodWithTrustedIpRes = await healthGet(
      new NextRequest('http://localhost/api/health', {
        headers: { 'x-vercel-forwarded-for': ip1 },
      })
    );
    const prodWithTrustedIpJson = await prodWithTrustedIpRes.json();
    assert(
      prodWithTrustedIpRes.status === 200 &&
        prodWithTrustedIpJson.trustedIpHeader?.present === true &&
        prodWithTrustedIpJson.trustedIpHeader?.source === 'x-vercel-forwarded-for' &&
        capturedAlerts.length === alertsBeforeGoodIp,
      'GET /api/health in production with x-vercel-forwarded-for detects IP cleanly without alerting'
    );

    // -------------------------------------------------------------------------
    // 3. TWO DIFFERENT CLIENT IPs RECEIVE DISTINCT RATE-LIMIT BUCKETS
    // -------------------------------------------------------------------------
    console.log('\n--- 3. DISTINCT RATE-LIMIT BUCKETS FOR TWO CLIENT IPs ---');
    const reqIp1 = new NextRequest('https://staging.relyvora.com/api/escrow/release', {
      method: 'POST',
      headers: { 'x-vercel-forwarded-for': ip1, 'x-forwarded-for': spoofedXff },
    });
    const reqIp2 = new NextRequest('https://staging.relyvora.com/api/escrow/release', {
      method: 'POST',
      headers: { 'x-vercel-forwarded-for': ip2, 'x-forwarded-for': spoofedXff },
    });

    const derivedIp1 = getClientIp(reqIp1);
    const derivedIp2 = getClientIp(reqIp2);
    const key1 = `${derivedIp1}:${bucketSuffix}`;
    const key2 = `${derivedIp2}:${bucketSuffix}`;

    const ip1Call1 = await checkSharedRateLimit(key1, 2, 60_000, supabase);
    const ip1Call2 = await checkSharedRateLimit(key1, 2, 60_000, supabase);
    const ip1Call3Blocked = await checkSharedRateLimit(key1, 2, 60_000, supabase);
    const ip2Call1 = await checkSharedRateLimit(key2, 2, 60_000, supabase);

    const { data: dbBuckets, error: dbBucketsErr } = await supabase
      .from('rate_limit_buckets')
      .select('key, count')
      .in('key', [key1, key2]);

    assert(
      !dbBucketsErr &&
        derivedIp1 === ip1 &&
        derivedIp2 === ip2 &&
        ip1Call1.allowed &&
        ip1Call2.allowed &&
        !ip1Call3Blocked.allowed &&
        ip2Call1.allowed &&
        ip2Call1.remaining === 1 &&
        (dbBuckets || []).length === 2 &&
        (dbBuckets || []).some((b: any) => b.key === key1 && b.count === 3) &&
        (dbBuckets || []).some((b: any) => b.key === key2 && b.count === 1),
      `Two different client IPs (${ip1} vs ${ip2}, identical spoofed XFF) get separate Staging Postgres rate_limit_buckets rows (count=3 vs count=1)`
    );

    // Optional live Vercel preview probe when VERCEL_PREVIEW_URL + bypass headers are supplied
    const previewUrl = (process.env.VERCEL_PREVIEW_URL || 'https://staging.relyvora.com').trim().replace(/\/+$/, '');
    const previewBypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
    const previewRes = await origFetch(`${previewUrl}/api/health`, {
      redirect: 'manual',
      headers: previewBypass ? { 'x-vercel-protection-bypass': previewBypass } : undefined,
    }).catch((err: any) => ({ status: 0, error: err?.message }));

    if ('status' in previewRes && previewRes.status === 302) {
      console.log(`[INFO] Live Vercel preview (${previewUrl}) is protected by Vercel SSO (HTTP 302) — cannot invoke unauthenticated remote requests without bypass secret; deployment of release-candidate is withheld per Staging-only instruction.`);
    } else if ('status' in previewRes && previewRes.status === 200) {
      const previewJson = await (previewRes as Response).json().catch(() => ({}));
      console.log(`[INFO] Live Vercel preview (${previewUrl}/api/health) responded HTTP 200:`, previewJson);
    } else {
      console.log(`[INFO] Live Vercel preview (${previewUrl}) check status:`, previewRes);
    }

    // -------------------------------------------------------------------------
    // 4. WHATSAPP_ALLOWED_RECIPIENTS BEHAVIOR (UNSET, EMPTY, SET IN STAGING vs PROD)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. WHATSAPP_ALLOWED_RECIPIENTS POLICY MATRIX ---');
    const stUnset = evaluateWhatsappRecipientPolicy('+2348012345678', { VERCEL_ENV: 'preview' });
    const stEmpty = evaluateWhatsappRecipientPolicy('+2348012345678', {
      VERCEL_ENV: 'preview',
      WHATSAPP_ALLOWED_RECIPIENTS: '   ',
    });
    const stSetAllow = evaluateWhatsappRecipientPolicy('+2348012345678', {
      VERCEL_ENV: 'preview',
      WHATSAPP_ALLOWED_RECIPIENTS: '+2348012345678,+2348099999999',
    });
    const stSetBlock = evaluateWhatsappRecipientPolicy('+2348055550000', {
      VERCEL_ENV: 'preview',
      WHATSAPP_ALLOWED_RECIPIENTS: '+2348012345678,+2348099999999',
    });
    const stInvalid = evaluateWhatsappRecipientPolicy('+2348012345678', {
      VERCEL_ENV: 'preview',
      WHATSAPP_ALLOWED_RECIPIENTS: 'invalid-text-no-phone',
    });

    const prUnset = evaluateWhatsappRecipientPolicy('+2348055550000', { VERCEL_ENV: 'production' });
    const prEmpty = evaluateWhatsappRecipientPolicy('+2348055550000', {
      VERCEL_ENV: 'production',
      WHATSAPP_ALLOWED_RECIPIENTS: '',
    });
    const alertsBeforeWaProd = capturedAlerts.length;
    const prSetOther = evaluateWhatsappRecipientPolicy('+2348055550000', {
      VERCEL_ENV: 'production',
      WHATSAPP_ALLOWED_RECIPIENTS: '+2348012345678',
    });
    const prStatus = getWhatsappRecipientFilterStatus({
      VERCEL_ENV: 'production',
      WHATSAPP_ALLOWED_RECIPIENTS: '+2348012345678',
    });

    assert(
      stUnset.allowed === true &&
        stUnset.status.state === 'unset' &&
        stEmpty.allowed === true &&
        stEmpty.status.state === 'empty' &&
        stSetAllow.allowed === true &&
        stSetAllow.status.state === 'enforced' &&
        stSetBlock.allowed === false &&
        stInvalid.allowed === false &&
        prUnset.allowed === true &&
        prEmpty.allowed === true &&
        prSetOther.allowed === true &&
        prStatus.state === 'set_ignored_in_production' &&
        capturedAlerts.length > alertsBeforeWaProd,
      'WHATSAPP_ALLOWED_RECIPIENTS: staging enforces set list & allows unset/empty; production never silently blocks any message and alerts if set'
    );

    // -------------------------------------------------------------------------
    // 5. MIDDLEWARE BYPASS FOR /api/webhooks/*, /api/health, /api/cron/*
    // -------------------------------------------------------------------------
    console.log('\n--- 5. MIDDLEWARE BYPASS FOR WEBHOOKS, HEALTH & CRON ---');
    (process.env as any).NODE_ENV = 'production';
    const matcherSrc = String(middlewareConfig.matcher[0] || '');
    const matcherRegex = new RegExp(`^${matcherSrc}$`);
    const bypassPaths = [
      '/api/webhooks/whatsapp',
      '/api/webhooks/anchor',
      '/api/health',
      '/api/cron/reconcile',
    ];
    const hostsToCheck = [
      'staging.relyvora.com',
      'relyvora.com',
      'ng.relyvora.com',
      'foundation.relyvora.com',
    ];

    let allBypassClean = true;
    for (const bypassPath of bypassPaths) {
      if (matcherRegex.test(bypassPath)) {
        allBypassClean = false;
      }
      for (const host of hostsToCheck) {
        const mwReq = new NextRequest(`https://${host}${bypassPath}`, {
          method: 'GET',
          headers: {
            host,
            'user-agent': 'facebookplatform/1.0',
            'x-vercel-ip-country': 'US',
          },
        });
        const mwRes = middleware(mwReq);
        if (mwRes.headers.get('location') !== null || mwRes.status !== 200) {
          allBypassClean = false;
        }
      }
    }

    assert(
      allBypassClean &&
        matcherSrc.includes('api/webhooks') &&
        matcherSrc.includes('api/health') &&
        matcherSrc.includes('api/cron'),
      '/api/webhooks/*, /api/health, and /api/cron/* completely bypass middleware matcher and geo/domain redirects across all hosts for US / facebookplatform/1.0'
    );

    const stagingRootReq = new NextRequest('https://staging.relyvora.com/', {
      method: 'GET',
      headers: { host: 'staging.relyvora.com' },
    });
    const stagingRootRes = middleware(stagingRootReq);
    const stagingRootRewrite = stagingRootRes.headers.get('x-middleware-rewrite') || '';

    const stagingInternalPaths = [
      '/vendor',
      '/vendor/onboarding',
      '/pay/test-order-123',
      '/order/test-order-123',
      '/ng',
      '/terms',
      '/privacy',
      '/disputes',
      '/prohibited-items',
      '/foundation',
      '/how-it-works',
    ];
    let allStagingPathsStayOnStaging = true;
    for (const internalPath of stagingInternalPaths) {
      const req = new NextRequest(`https://staging.relyvora.com${internalPath}`, {
        method: 'GET',
        headers: { host: 'staging.relyvora.com' },
      });
      const res = middleware(req);
      if (res.headers.get('location') !== null || res.status !== 200) {
        allStagingPathsStayOnStaging = false;
      }
    }

    const corpVendorReq = new NextRequest('https://relyvora.com/vendor', {
      method: 'GET',
      headers: { host: 'relyvora.com' },
    });
    const corpVendorRes = middleware(corpVendorReq);
    const corpVendorLocation = corpVendorRes.headers.get('location') || '';

    const origAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.relyvora.com';
    const stagingHrefFromEnv = getNigeriaAppHref();
    process.env.NEXT_PUBLIC_APP_URL = 'https://ng.relyvora.com';
    const stagingHrefFromHost = getNigeriaAppHref('staging.relyvora.com');
    const corpHrefInProd = getNigeriaAppHref('relyvora.com');
    if (origAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = origAppUrl;

    assert(
      stagingRootRes.status === 200 &&
        stagingRootRes.headers.get('location') === null &&
        stagingRootRewrite.endsWith('/ng') &&
        allStagingPathsStayOnStaging &&
        corpVendorLocation === 'https://ng.relyvora.com/vendor' &&
        stagingHrefFromEnv === '/' &&
        stagingHrefFromHost === '/' &&
        corpHrefInProd === 'https://ng.relyvora.com',
      'staging.relyvora.com rewrites / directly to /ng (Nigeria product app) and keeps all internal routes and links on staging.relyvora.com without redirecting or linking out to ng.relyvora.com'
    );

    const turnstileWidgetSrc = fs.readFileSync('components/common/TurnstileWidget.tsx', 'utf8');
    const vendorPageSrc = fs.readFileSync('app/(app)/vendor/page.tsx', 'utf8');
    const onboardingFlowSrc = fs.readFileSync('components/vendor/VendorOnboardingFlow.tsx', 'utf8');

    assert(
      turnstileWidgetSrc.includes('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit') &&
        turnstileWidgetSrc.includes('NEXT_PUBLIC_TURNSTILE_SITE_KEY') &&
        vendorPageSrc.includes('<TurnstileWidget') &&
        vendorPageSrc.includes('captchaToken: loginCaptchaToken.trim()') &&
        onboardingFlowSrc.includes('<TurnstileWidget') &&
        onboardingFlowSrc.includes('captchaToken: currentCaptchaToken') &&
        !onboardingFlowSrc.includes('Paste verified CAPTCHA challenge response token'),
      'Cloudflare Turnstile widget renders on /vendor sign-in and /vendor/onboarding and passes captchaToken into supabase.auth.signInWithPassword / signUp options'
    );

    const authCallbackSrc = fs.readFileSync('app/auth/callback/route.ts', 'utf8');
    const rootPkceReq = new NextRequest('https://staging.relyvora.com/?code=pkce-test-code-123', {
      method: 'GET',
      headers: { host: 'staging.relyvora.com' },
    });
    const rootPkceRes = middleware(rootPkceReq);
    const rootPkceLocation = rootPkceRes.headers.get('location') || '';

    const callbackReq = new NextRequest('https://staging.relyvora.com/auth/callback?code=pkce-test-code-123', {
      method: 'GET',
      headers: { host: 'staging.relyvora.com' },
    });
    const callbackRes = await authCallbackGet(callbackReq);
    const callbackLocation = callbackRes.headers.get('location') || '';

    assert(
      authCallbackSrc.includes('exchangeCodeForSession(code)') &&
        onboardingFlowSrc.includes('emailRedirectTo: `${window.location.origin}/auth/callback`') &&
        rootPkceLocation === 'https://staging.relyvora.com/auth/callback?code=pkce-test-code-123' &&
        callbackLocation === 'https://staging.relyvora.com/vendor/onboarding?confirmed=1',
      '/auth/callback exchanges PKCE code via supabase.auth.exchangeCodeForSession(code), middleware forwards /?code=... to /auth/callback, and signUp passes emailRedirectTo'
    );

    const demoBannerSrc = fs.readFileSync('components/DemoBanner.tsx', 'utf8');
    const navbarSrc = fs.readFileSync('components/Navbar.tsx', 'utf8');
    const prohibitedItemsSrc = fs.readFileSync('app/prohibited-items/page.tsx', 'utf8');

    assert(
      demoBannerSrc.includes("isLiveMode() || process.env.NODE_ENV === 'production'") &&
        navbarSrc.includes("isLiveMode() || process.env.NODE_ENV === 'production'") &&
        !vendorPageSrc.includes('@LagosHairPlug') &&
        !vendorPageSrc.includes('Simulated Verified Vendor') &&
        vendorPageSrc.includes('{!isProductionOrLive && (') &&
        !prohibitedItemsSrc.includes('Draft Policy'),
      'Demo/testing UI (DEMO MODE banner, Simulated Escrow pill, @LagosHairPlug / Simulated Verified Vendor fallback, Sandbox Testing Tip) is hidden in live/production and Draft Policy banner is removed from /prohibited-items'
    );
    void inspectTrustedClientIp;
  } finally {
    globalThis.fetch = origFetch;
    console.error = origConsoleError;
    console.warn = origConsoleWarn;

    if (origNodeEnv === undefined) delete (process.env as any).NODE_ENV;
    else (process.env as any).NODE_ENV = origNodeEnv;
    if (origVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = origVercel;
    if (origVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = origVercelEnv;
    if (origPaymentsMode === undefined) delete process.env.PAYMENTS_MODE;
    else process.env.PAYMENTS_MODE = origPaymentsMode;
    if (origPublicMode === undefined) delete process.env.NEXT_PUBLIC_PAYMENTS_MODE;
    else process.env.NEXT_PUBLIC_PAYMENTS_MODE = origPublicMode;
    if (origResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = origResendKey;
    if (origWaAllowlist === undefined) delete process.env.WHATSAPP_ALLOWED_RECIPIENTS;
    else process.env.WHATSAPP_ALLOWED_RECIPIENTS = origWaAllowlist;

    await supabase.from('rate_limit_buckets').delete().ilike('key', `%${bucketSuffix}%`);
  }

  console.log('\n======================================================================');
  console.log(`IP / MODE / HEALTH / WHATSAPP FILTER SUMMARY: ${passed}/${passed + failed} CHECKS PASSED`);
  console.log('======================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runSuite().catch((err) => {
  console.error('Fatal IP/Mode/Health test error:', err);
  process.exit(1);
});
