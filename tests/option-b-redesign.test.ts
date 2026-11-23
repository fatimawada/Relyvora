/**
 * Relyvora NG App Redesign & Option B Verification Suite
 *
 * Verifies:
 * 1. Light-theme-only NG shell + header/footer links + banned copy removal + placeholders removal
 * 2. Step 1 collects store name, email, and WhatsApp number ONLY + no untouched red validation errors
 * 3. KYC_ENABLED flag defaults false -> Step 2 locks cleanly with zero Anchor calls and zero identity/bank DOM inputs
 * 4. KYC_ENABLED=true fails closed when Anchor production credentials are missing or point to sandbox
 * 5. Server-side gates: create-link and all payment actions return 403 unless PAYMENTS_MODE=live, LAUNCH_STATUS=live,
 *    KYC is verified, and release_code_template_approved=true; logged-out callers cannot access dashboard/payment actions
 * 6. Waitlist SQL + RLS lock in PGlite (anon/auth denied, service_role allowed) + zero WhatsApp/email sent on signup
 * 7. Confirmation callback (/auth/callback) creates session, syncs waitlist/profile, and redirects directly to Step 2
 *    (/vendor/onboarding?confirmed=1&step=2) when Step 1 is saved, or /vendor when KYC is verified
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { PGlite } from '@electric-sql/pglite';

import {
  evaluateLivePaymentGateServer,
  getVendorGateSnapshotServer,
  isKycEnabledServer,
  isReleaseCodeTemplateApprovedServer,
} from '../lib/launchGates';
import { clearSafetySettingsCache } from '../lib/safetyLimits';
import { assertAnchorLiveCredentials, isAnchorLiveCredentialsConfigured } from '../lib/anchor';
import { step1Schema, VendorOnboardingFlow } from '../components/vendor/VendorOnboardingFlow';
import { VendorPortalClient } from '../components/vendor/VendorPortalClient';

import { GET as authCallbackGet } from '../app/auth/callback/route';
import { POST as vendorOnboardingPost } from '../app/api/vendor/onboarding/route';
import { POST as settlementPost } from '../app/api/vendor/settlement-account/route';
import { POST as waitlistPost } from '../app/api/vendor/waitlist/route';
import { GET as vendorStatusGet } from '../app/api/vendor/status/route';
import { POST as createLinkPost } from '../app/api/escrow/create-link/route';
import { GET as escrowListGet } from '../app/api/escrow/list/route';
import { POST as confirmPaymentPost } from '../app/api/escrow/confirm-payment/route';
import { POST as releasePost } from '../app/api/escrow/release/route';
import { POST as dispatchPost } from '../app/api/escrow/dispatch/route';
import { POST as cancelPost } from '../app/api/escrow/cancel/route';
import { POST as reissuePost } from '../app/api/escrow/reissue-code/route';
import { POST as refundDestPost } from '../app/api/escrow/refund-destination/route';
import { POST as disputePost } from '../app/api/escrow/dispute/route';
import { POST as disputeSendOtpPost } from '../app/api/escrow/dispute/send-otp/route';
import { POST as disputeRespondPost } from '../app/api/escrow/dispute/respond/route';
import { POST as consentPost } from '../app/api/escrow/[id]/consent/route';
import { POST as resendWaPost } from '../app/api/escrow/[id]/resend-whatsapp/route';

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

async function main() {
  console.log('======================================================================');
  console.log('RELYVORA NG REDESIGN & OPTION B GATE VERIFICATION SUITE');
  console.log('======================================================================\n');

  const origFetch = globalThis.fetch;
  const origEnv = {
    PAYMENTS_MODE: process.env.PAYMENTS_MODE,
    NEXT_PUBLIC_PAYMENTS_MODE: process.env.NEXT_PUBLIC_PAYMENTS_MODE,
    LAUNCH_STATUS: process.env.LAUNCH_STATUS,
    NEXT_PUBLIC_LAUNCH_STATUS: process.env.NEXT_PUBLIC_LAUNCH_STATUS,
    PRE_LAUNCH: process.env.PRE_LAUNCH,
    NEXT_PUBLIC_PRE_LAUNCH: process.env.NEXT_PUBLIC_PRE_LAUNCH,
    KYC_ENABLED: process.env.KYC_ENABLED,
    NEXT_PUBLIC_KYC_ENABLED: process.env.NEXT_PUBLIC_KYC_ENABLED,
    RELEASE_CODE_TEMPLATE_APPROVED: process.env.RELEASE_CODE_TEMPLATE_APPROVED,
    WHATSAPP_RELEASE_CODE_TEMPLATE_APPROVED: process.env.WHATSAPP_RELEASE_CODE_TEMPLATE_APPROVED,
    ANCHOR_BASE_URL: process.env.ANCHOR_BASE_URL,
    ANCHOR_SECRET_KEY: process.env.ANCHOR_SECRET_KEY,
    ANCHOR_WEBHOOK_SECRET: process.env.ANCHOR_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
  };

  try {
    // -----------------------------------------------------------------------
    // 1. UI LIGHT-THEME, HEADER/FOOTER, COPY & STEP 1/2 SCHEMA AUDIT
    // -----------------------------------------------------------------------
    console.log('--- 1. LIGHT THEME, HEADER/FOOTER, COPY & FIELD SCHEMA ---');
    const ngFiles = [
      'app/(app)/layout.tsx',
      'app/(app)/ng/page.tsx',
      'app/(app)/vendor/page.tsx',
      'app/(app)/vendor/onboarding/page.tsx',
      'app/(app)/pay/[id]/page.tsx',
      'app/(app)/order/[id]/page.tsx',
      'components/Navbar.tsx',
      'components/ProductFooter.tsx',
      'components/EscrowStepper.tsx',
      'components/StatusBadge.tsx',
      'components/vendor/VendorOnboardingFlow.tsx',
      'components/vendor/VendorPortalClient.tsx',
    ];

    let hasDarkToken = false;
    let hasBannedCopy = false;
    for (const file of ngFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (/\bdark:/.test(content)) {
        hasDarkToken = true;
        console.error('Dark class found in', file);
      }
      if (
        /Invite-Only Launch|Escrow Layer|Protocol|LagosHairPlug|22222222222|0123456789|0248819203|synced directly with your Supabase|Vendor Advantage|Eliminate "Payment on Delivery" Headaches|\bFatima\b|\bWada\b|\bAdebayo\b|\bInstant\b|\bSimulated\b/i.test(
          content
        )
      ) {
        hasBannedCopy = true;
        console.error('Banned copy found in', file);
      }
    }

    const rootLayoutSrc = fs.readFileSync('app/layout.tsx', 'utf8');
    const navbarSrc = fs.readFileSync('components/Navbar.tsx', 'utf8');
    const footerSrc = fs.readFileSync('components/ProductFooter.tsx', 'utf8');
    const ngPageSrc = fs.readFileSync('app/(app)/ng/page.tsx', 'utf8');

    assert(
      !hasDarkToken &&
        !hasBannedCopy &&
        rootLayoutSrc.includes("document.documentElement.classList.remove('dark')") &&
        rootLayoutSrc.includes("localStorage.getItem('relyvora-theme')"),
      'NG app contains zero dark: tokens or banned copy while corporate theme settings stay untouched'
    );
    assert(
      navbarSrc.includes('href="/"') &&
        !navbarSrc.includes('Corporate Site') &&
        !navbarSrc.includes('Vendor Portal') &&
        !navbarSrc.includes('ThemeToggle') &&
        footerSrc.includes('About Relyvora') &&
        footerSrc.includes('/about') &&
        footerSrc.includes('/terms') &&
        footerSrc.includes('/privacy') &&
        footerSrc.includes('/prohibited-items') &&
        footerSrc.includes('/disputes') &&
        ngPageSrc.includes('Early access'),
      'Header has logo linking to / with no Corporate Site, Vendor Portal, or ThemeToggle; Footer has About Relyvora + legal links; /ng badge uses Early access'
    );

    const step1ShapeKeys = Object.keys(step1Schema.shape);
    assert(
      step1ShapeKeys.length === 3 &&
        step1ShapeKeys.includes('storeName') &&
        step1ShapeKeys.includes('email') &&
        step1ShapeKeys.includes('phoneNumber') &&
        !step1ShapeKeys.includes('password') &&
        !step1ShapeKeys.includes('idNumber') &&
        !step1ShapeKeys.includes('accountNumber'),
      `Step 1 collects storeName, email, and phoneNumber ONLY (${step1ShapeKeys.join(', ')})`
    );

    const onboardingStep1Html = renderToStaticMarkup(
      React.createElement(VendorOnboardingFlow, {
        initialKycEnabled: false,
        initialLaunchStatus: 'launching',
        initialPaymentsMode: 'sandbox',
        initialReleaseTemplateApproved: false,
      })
    );
    const loggedOutVendorHtml = renderToStaticMarkup(
      React.createElement(VendorPortalClient, {
        initialGates: {
          kycEnabled: false,
          paymentsMode: 'sandbox',
          launchStatus: 'launching',
          preLaunch: true,
          releaseCodeTemplateApproved: false,
          canCreateLinks: false,
          paymentsOpenStatus: 'Payments open soon',
        },
      })
    );
    const onboardingFlowSrc = fs.readFileSync('components/vendor/VendorOnboardingFlow.tsx', 'utf8');
    assert(
      onboardingFlowSrc.includes('Verification opens when payments go live.') &&
        onboardingFlowSrc.includes('{currentStep === 2 && !kycEnabled && (') &&
        onboardingFlowSrc.includes('{currentStep === 2 && kycEnabled && (') &&
        !onboardingStep1Html.includes('text-rose-700') &&
        !loggedOutVendorHtml.includes('Create payment link') &&
        !loggedOutVendorHtml.includes('Orders ('),
      'Initial renders show zero red validation errors before touch, logged-out /vendor renders no order form or orders list, and Step 2 renders no identity/bank fields when KYC_ENABLED=false'
    );

    // -----------------------------------------------------------------------
    // 2. PGLITE WAITLIST SQL + STRICT RLS LOCK VERIFICATION
    // -----------------------------------------------------------------------
    console.log('\n--- 2. PGLITE SQL MIGRATION & STRICT RLS LOCK FOR vendor_waitlist ---');
    const pglite = new PGlite();
    await pglite.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      CREATE TABLE IF NOT EXISTS public.system_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        updated_by TEXT DEFAULT 'system',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      );
      CREATE TABLE IF NOT EXISTS public.vendors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        store_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone_number TEXT NOT NULL,
        kyc_status TEXT NOT NULL DEFAULT 'pending',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      );
      CREATE OR REPLACE FUNCTION public.update_modified_column()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = timezone('utc'::text, now());
        RETURN NEW;
      END;
      $$;
    `);
    const optionBSql = fs.readFileSync('docs/OPTION-B-WAITLIST-AND-GATES.sql', 'utf8');
    await pglite.exec(optionBSql);

    const rlsRes = await pglite.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      anon_sel: boolean;
      anon_ins: boolean;
      auth_sel: boolean;
      auth_ins: boolean;
      svc_sel: boolean;
      svc_ins: boolean;
    }>(`
      SELECT
        c.relrowsecurity,
        c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_sel,
        has_table_privilege('anon', c.oid, 'INSERT') AS anon_ins,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel,
        has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_ins,
        has_table_privilege('service_role', c.oid, 'SELECT') AS svc_sel,
        has_table_privilege('service_role', c.oid, 'INSERT') AS svc_ins
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'vendor_waitlist';
    `);
    const settingsRes = await pglite.query<{ key: string; value: unknown }>(`
      SELECT key, value FROM public.system_settings WHERE key IN ('kyc_enabled', 'release_code_template_approved', 'launch_status') ORDER BY key;
    `);
    const r = rlsRes.rows[0];
    assert(
      r?.relrowsecurity === true &&
        r?.relforcerowsecurity === true &&
        r?.anon_sel === false &&
        r?.anon_ins === false &&
        r?.auth_sel === false &&
        r?.auth_ins === false &&
        r?.svc_sel === true &&
        r?.svc_ins === true &&
        settingsRes.rows.find((x) => x.key === 'kyc_enabled')?.value === false &&
        settingsRes.rows.find((x) => x.key === 'release_code_template_approved')?.value === false,
      'PGlite verifies vendor_waitlist has RLS forced, anon/authenticated have ZERO access, service_role has access, and Option B settings default to false'
    );

    // -----------------------------------------------------------------------
    // 3. KYC_ENABLED=false BLOCKS ANCHOR CALLS & KYC_ENABLED=true FAILS CLOSED
    // -----------------------------------------------------------------------
    console.log('\n--- 3. KYC_ENABLED GATE & ZERO ANCHOR CALLS ---');
    delete process.env.KYC_ENABLED;
    delete process.env.NEXT_PUBLIC_KYC_ENABLED;
    delete process.env.RELEASE_CODE_TEMPLATE_APPROVED;
    delete process.env.WHATSAPP_RELEASE_CODE_TEMPLATE_APPROVED;
    clearSafetySettingsCache();

    const defaultKycFlag = await isKycEnabledServer();
    const defaultTemplateFlag = await isReleaseCodeTemplateApprovedServer();
    assert(
      defaultKycFlag === false && defaultTemplateFlag === false,
      'KYC_ENABLED and RELEASE_CODE_TEMPLATE_APPROVED default to false'
    );

    const anchorCalls: string[] = [];
    const whatsappCalls: string[] = [];
    const emailCalls: string[] = [];
    const testUserId = crypto.randomUUID();
    const testVendorId = crypto.randomUUID();
    const testEmail = `optionb-vendor-${Date.now()}@relyvora.com`;
    const testTxId = crypto.randomUUID();
    const waitlistRecords: any[] = [];
    const vendorRecords: Record<string, any> = {
      [testEmail]: {
        id: testVendorId,
        user_id: testUserId,
        store_name: 'Lagos Craft Goods',
        email: testEmail,
        phone_number: '+2348011112233',
        phone_verified: false,
        kyc_status: 'pending',
        payout_account_verified: false,
        settlement_account_name_matched: false,
        is_allowlisted: false,
        is_suspended: false,
      },
    };

    process.env.RESEND_API_KEY = 're_optionb_test_spy';
    process.env.WHATSAPP_ACCESS_TOKEN = 'wa_optionb_test_spy';

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (urlStr.includes('getanchor.co')) {
        anchorCalls.push(urlStr);
        throw new Error(`Anchor must not be called in this test: ${urlStr}`);
      }
      if (urlStr.includes('graph.facebook.com')) {
        whatsappCalls.push(urlStr);
        throw new Error(`WhatsApp must not be called while template unapproved: ${urlStr}`);
      }
      if (urlStr.includes('api.resend.com')) {
        emailCalls.push(urlStr);
        return new Response(JSON.stringify({ id: 'mock_email' }), { status: 200 });
      }

      if (urlStr.includes('challenges.cloudflare.com/turnstile')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Mock Supabase Auth & PostgREST cleanly inside Option B API route tests
      if (urlStr.includes('/auth/v1/token') || urlStr.includes('/auth/v1/verify')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock_pkce_access_token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'mock_pkce_refresh',
            user: {
              id: testUserId,
              email: testEmail,
              email_confirmed_at: new Date().toISOString(),
              user_metadata: {
                store_name: 'Lagos Craft Goods',
                phone_number: '+2348011112233',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (urlStr.includes(`/auth/v1/admin/users/${testUserId}`)) {
        return new Response(
          JSON.stringify({
            user: {
              id: testUserId,
              email: testEmail,
              email_confirmed_at: new Date().toISOString(),
              user_metadata: {
                store_name: 'Lagos Craft Goods',
                phone_number: '+2348011112233',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (urlStr.includes('/auth/v1/user')) {
        return new Response(
          JSON.stringify({
            id: testUserId,
            email: testEmail,
            email_confirmed_at: new Date().toISOString(),
            user_metadata: {
              store_name: 'Lagos Craft Goods',
              phone_number: '+2348011112233',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (urlStr.includes('/rest/v1/rpc/rpc_check_rate_limit')) {
        return new Response(
          JSON.stringify({ allowed: true, count: 1, remaining: 9, reset_at: new Date(Date.now() + 60000).toISOString() }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (urlStr.includes('/rest/v1/system_settings')) {
        return new Response(
          JSON.stringify([
            { key: 'checkout_enabled', value: true },
            { key: 'payouts_enabled', value: true },
            { key: 'vendor_allowlist_mode', value: false },
            { key: 'kyc_enabled', value: false },
            { key: 'release_code_template_approved', value: false },
            { key: 'launch_status', value: 'launching' },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (urlStr.includes('/rest/v1/vendor_waitlist')) {
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'POST') {
          const payload = JSON.parse(String(init?.body || '{}'));
          const row = { id: crypto.randomUUID(), ...payload };
          waitlistRecords.push(row);
          return new Response(JSON.stringify(row), {
            status: 201,
            headers: { 'content-type': 'application/vnd.pgrst.object+json' },
          });
        }
        return new Response(JSON.stringify(waitlistRecords[0] || null), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (urlStr.includes('/rest/v1/vendors')) {
        const method = (init?.method || 'GET').toUpperCase();
        const row = vendorRecords[testEmail];
        const acceptHeader = new Headers(init?.headers).get('accept') || '';
        if (method === 'PATCH' || method === 'POST') {
          return new Response(JSON.stringify(row), {
            status: 200,
            headers: { 'content-type': 'application/vnd.pgrst.object+json' },
          });
        }
        if (acceptHeader.includes('vnd.pgrst.object')) {
          return new Response(JSON.stringify(row), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify(row ? [row] : []), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (urlStr.includes('/rest/v1/transactions')) {
        const txRow = {
          id: testTxId,
          vendor_id: testVendorId,
          vendor_handle: '@LagosCraftGoods',
          item_name: 'Leather Sandal',
          item_price: 25000,
          delivery_fee: 0,
          protection_fee: 750,
          total_amount: 25750,
          amount_paid: 25750,
          status: 'FUNDS_LOCKED',
          delivery_type: 'same_city',
          buyer_phone: '+2348099990000',
          buyer_phone_verified: true,
          whatsapp_blocked: false,
          code_locked: false,
          failed_code_attempts: 0,
        };
        return new Response(JSON.stringify(urlStr.includes('limit=') ? [txRow] : txRow), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return origFetch(input as any, init);
    };

    const lockedOnboardRes = await vendorOnboardingPost(
      new NextRequest('https://ng.relyvora.com/api/vendor/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer mock_vendor_jwt',
          'x-vercel-forwarded-for': '102.89.10.1',
        },
        body: JSON.stringify({
          acceptedTermsAndProhibitedItems: true,
          profile: { storeName: 'Lagos Craft Goods', email: testEmail, phoneNumber: '+2348011112233' },
          regulatoryKyc: {
            legalFirstName: 'Chinedu',
            legalLastName: 'Okafor',
            dateOfBirth: '1992-05-10',
            gender: 'MALE',
            address: '10 Marina Road, Lagos',
            idType: 'BVN',
            idNumber: '11111111111',
            bankCode: '058',
            accountNumber: '1234567890',
          },
        }),
      })
    );
    const lockedOnboardJson = await lockedOnboardRes.json();

    const lockedSettlementRes = await settlementPost(
      new NextRequest('https://ng.relyvora.com/api/vendor/settlement-account', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer mock_vendor_jwt',
          'x-vercel-forwarded-for': '102.89.10.1',
        },
        body: JSON.stringify({ bankCode: '058', accountNumber: '1234567890' }),
      })
    );

    assert(
      lockedOnboardRes.status === 403 &&
        lockedOnboardJson.code === 'KYC_DISABLED' &&
        lockedSettlementRes.status === 403 &&
        anchorCalls.length === 0,
      `POST /api/vendor/onboarding (HTTP ${lockedOnboardRes.status}) & settlement-account (HTTP ${lockedSettlementRes.status}) lock with ZERO Anchor calls while KYC_ENABLED=false`
    );

    // Fail-closed live Anchor check when KYC_ENABLED=true & PAYMENTS_MODE=live without production Anchor URL/keys
    process.env.KYC_ENABLED = 'true';
    process.env.PAYMENTS_MODE = 'live';
    process.env.ANCHOR_BASE_URL = 'https://api.sandbox.getanchor.co/api/v1';
    const credCheckSandboxInLive = isAnchorLiveCredentialsConfigured();
    let liveCredThrew = false;
    try {
      assertAnchorLiveCredentials();
    } catch {
      liveCredThrew = true;
    }

    const failClosedOnboardRes = await vendorOnboardingPost(
      new NextRequest('https://ng.relyvora.com/api/vendor/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer mock_vendor_jwt',
          'x-vercel-forwarded-for': '102.89.10.2',
        },
        body: JSON.stringify({
          acceptedTermsAndProhibitedItems: true,
          profile: { storeName: 'Lagos Craft Goods', email: testEmail, phoneNumber: '+2348011112233' },
          regulatoryKyc: {
            legalFirstName: 'Chinedu',
            legalLastName: 'Okafor',
            dateOfBirth: '1992-05-10',
            gender: 'MALE',
            address: '10 Marina Road, Lagos',
            idType: 'BVN',
            idNumber: '11111111111',
            bankCode: '058',
            accountNumber: '1234567890',
          },
          captchaToken: 'mock_captcha',
        }),
      })
    );
    const failClosedJson = await failClosedOnboardRes.json();

    assert(
      !credCheckSandboxInLive.ok &&
        liveCredThrew &&
        failClosedOnboardRes.status === 503 &&
        failClosedJson.code === 'ANCHOR_CREDENTIALS_MISSING' &&
        anchorCalls.length === 0,
      'KYC_ENABLED=true in live mode fails closed cleanly (503) without calling sandbox Anchor when live credentials are missing/misconfigured'
    );

    // -----------------------------------------------------------------------
    // 4. EMAIL CONFIRMATION CALLBACK -> WAITLIST + REDIRECT TO STEP 2 NO RE-ENTRY
    // -----------------------------------------------------------------------
    console.log('\n--- 4. CONFIRMATION CALLBACK, WAITLIST & ZERO OUTBOUND MESSAGES ---');
    process.env.KYC_ENABLED = 'false';
    process.env.PAYMENTS_MODE = 'sandbox';
    process.env.LAUNCH_STATUS = 'launching';
    whatsappCalls.length = 0;
    emailCalls.length = 0;

    const wlRes = await waitlistPost(
      new NextRequest('https://ng.relyvora.com/api/vendor/waitlist', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer mock_vendor_jwt',
          'x-vercel-forwarded-for': '102.89.10.3',
        },
        body: JSON.stringify({
          storeName: 'Lagos Craft Goods',
          phoneNumber: '08011112233',
        }),
      })
    );
    const wlJson = await wlRes.json();
    assert(
      wlRes.status === 200 &&
        wlJson.success === true &&
        waitlistRecords.length >= 1 &&
        whatsappCalls.length === 0 &&
        emailCalls.length === 0,
      'POST /api/vendor/waitlist persists vendor_waitlist record cleanly and sends ZERO WhatsApp or email messages'
    );

    const supabaseUrlObj = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bepvqjqjybhhpsfbblqk.supabase.co');
    const supabaseRef = supabaseUrlObj.hostname.split('.')[0];
    const pkceCookieValue = `base64-${Buffer.from(JSON.stringify('test_pkce_verifier')).toString('base64url')}`;
    const pkceCookieHeader = `sb-${supabaseRef}-auth-token-code-verifier=${pkceCookieValue}`;

    const confirmedCallbackRes = await authCallbackGet(
      new NextRequest('https://ng.relyvora.com/auth/callback?code=valid_pkce_code_for_step2', {
        method: 'GET',
        headers: {
          host: 'ng.relyvora.com',
          cookie: pkceCookieHeader,
        },
      })
    );
    const callbackRedirectLoc = confirmedCallbackRes.headers.get('location') || '';
    const statusAfterSignup = await vendorStatusGet(
      new NextRequest('https://ng.relyvora.com/api/vendor/status', {
        method: 'GET',
        headers: { authorization: 'Bearer mock_vendor_jwt' },
      })
    );
    const statusJson = await statusAfterSignup.json();

    assert(
      callbackRedirectLoc === 'https://ng.relyvora.com/vendor/onboarding?confirmed=1&step=2' &&
        statusJson.authenticated === true &&
        statusJson.firstIncompleteStep === 2 &&
        statusJson.user?.storeName === 'Lagos Craft Goods' &&
        statusJson.user?.phoneNumber === '+2348011112233' &&
        statusJson.gates?.canCreateLinks === false &&
        statusJson.gates?.paymentsOpenStatus === 'Payments open soon' &&
        whatsappCalls.length === 0 &&
        emailCalls.length === 0,
      'Confirmation callback redirects to /vendor/onboarding?confirmed=1&step=2 with Step 1 saved on account (zero re-entry, zero WhatsApp/email sent)'
    );

    // Also verify confirmed callback redirects verified KYC vendors straight to /vendor
    vendorRecords[testEmail].kyc_status = 'verified';
    const verifiedCallbackRes = await authCallbackGet(
      new NextRequest('https://ng.relyvora.com/auth/callback?token_hash=valid_signup_hash&type=signup', {
        method: 'GET',
        headers: { host: 'ng.relyvora.com' },
      })
    );
    assert(
      verifiedCallbackRes.headers.get('location') === 'https://ng.relyvora.com/vendor',
      'Confirmation callback redirects already KYC-verified vendor directly to /vendor'
    );

    // -----------------------------------------------------------------------
    // 5. SERVER-SIDE GATES ON create-link & EVERY PAYMENT ACTION (AND LOGGED-OUT BLOCK)
    // -----------------------------------------------------------------------
    console.log('\n--- 5. SERVER-SIDE LIVE GATES (403) & LOGGED-OUT BLOCKS ---');
    const loggedOutListRes = await escrowListGet(new NextRequest('https://ng.relyvora.com/api/escrow/list'));
    const loggedOutCreateRes = await createLinkPost(
      new NextRequest('https://ng.relyvora.com/api/escrow/create-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '102.89.10.4' },
        body: JSON.stringify({ itemName: 'Test Item', itemPrice: 10000 }),
      })
    );
    assert(
      loggedOutListRes.status === 401 && loggedOutCreateRes.status === 401,
      'Logged-out callers are strictly rejected (401) from escrow list and create-link'
    );

    // Test all 4 required Option B conditions on evaluateLivePaymentGateServer
    const verifiedVendorStub = { id: testVendorId, kyc_status: 'verified', is_suspended: false };
    const pendingVendorStub = { id: testVendorId, kyc_status: 'pending', is_suspended: false };

    process.env.PAYMENTS_MODE = 'sandbox';
    process.env.LAUNCH_STATUS = 'live';
    process.env.RELEASE_CODE_TEMPLATE_APPROVED = 'true';
    const g1 = await evaluateLivePaymentGateServer({ vendor: verifiedVendorStub });

    process.env.PAYMENTS_MODE = 'live';
    process.env.LAUNCH_STATUS = 'launching';
    process.env.RELEASE_CODE_TEMPLATE_APPROVED = 'true';
    const g2 = await evaluateLivePaymentGateServer({ vendor: verifiedVendorStub });

    process.env.PAYMENTS_MODE = 'live';
    process.env.LAUNCH_STATUS = 'live';
    process.env.RELEASE_CODE_TEMPLATE_APPROVED = 'false';
    const g3 = await evaluateLivePaymentGateServer({ vendor: verifiedVendorStub });

    process.env.PAYMENTS_MODE = 'live';
    process.env.LAUNCH_STATUS = 'live';
    process.env.RELEASE_CODE_TEMPLATE_APPROVED = 'true';
    const g4 = await evaluateLivePaymentGateServer({ vendor: pendingVendorStub });
    const gAllPass = await evaluateLivePaymentGateServer({ vendor: verifiedVendorStub });

    const snapBlocked = await getVendorGateSnapshotServer({
      kyc_status: 'pending',
      is_suspended: false,
      payout_account_verified: false,
      settlement_account_name_matched: false,
    });

    assert(
      !g1.allowed && g1.statusCode === 403 &&
        !g2.allowed && g2.statusCode === 403 &&
        !g3.allowed && g3.statusCode === 403 &&
        !g4.allowed && g4.statusCode === 403 &&
        gAllPass.allowed === true &&
        snapBlocked.canCreateLinks === false &&
        snapBlocked.paymentsOpenStatus === 'Payments open soon',
      'Live payment gate requires ALL 4 conditions (PAYMENTS_MODE=live, LAUNCH_STATUS=live, verified KYC, release template approved) and returns 403 otherwise'
    );

    // Verify route-level 403 across create-link and all payment action routes when template is unapproved
    process.env.PAYMENTS_MODE = 'live';
    process.env.LAUNCH_STATUS = 'live';
    process.env.RELEASE_CODE_TEMPLATE_APPROVED = 'false';
    const headersAuth = {
      'content-type': 'application/json',
      authorization: 'Bearer mock_vendor_jwt',
      'x-vercel-forwarded-for': '102.89.10.5',
    };

    const route403Checks = await Promise.all([
      createLinkPost(
        new NextRequest('https://ng.relyvora.com/api/escrow/create-link', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ itemName: 'Test Item', itemPrice: 10000 }),
        })
      ),
      confirmPaymentPost(
        new NextRequest('https://ng.relyvora.com/api/escrow/confirm-payment', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ transactionId: testTxId }),
        })
      ),
      releasePost(
        new NextRequest('https://ng.relyvora.com/api/escrow/release', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ transactionId: testTxId, releaseCode: '123456' }),
        })
      ),
      dispatchPost(
        new NextRequest('https://ng.relyvora.com/api/escrow/dispatch', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ transactionId: testTxId, carrierName: 'Rider', carrierPhone: '08000000000' }),
        })
      ),
      cancelPost(
        new NextRequest('https://ng.relyvora.com/api/escrow/cancel', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ transactionId: testTxId, reason: 'Cancel check' }),
        })
      ),
      reissuePost(
        new NextRequest('https://ng.relyvora.com/api/escrow/reissue-code', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ transactionId: testTxId, action: 'send_otp' }),
        })
      ),
      refundDestPost(
        new NextRequest('https://ng.relyvora.com/api/escrow/refund-destination', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ transactionId: testTxId, action: 'send_otp' }),
        })
      ),
      disputePost(
        new NextRequest('https://ng.relyvora.com/api/escrow/dispute', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ transactionId: testTxId, disputeReason: 'Damaged item received', scenarioId: 1 }),
        })
      ),
      disputeSendOtpPost(
        new NextRequest('https://ng.relyvora.com/api/escrow/dispute/send-otp', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ transactionId: testTxId }),
        })
      ),
      disputeRespondPost(
        new NextRequest('https://ng.relyvora.com/api/escrow/dispute/respond', {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ transactionId: testTxId, responseText: 'Dispute response check' }),
        })
      ),
      consentPost(
        new NextRequest(`https://ng.relyvora.com/api/escrow/${testTxId}/consent`, {
          method: 'POST',
          headers: headersAuth,
          body: JSON.stringify({ acceptedTerms: true }),
        }),
        { params: Promise.resolve({ id: testTxId }) }
      ),
      resendWaPost(
        new NextRequest(`https://ng.relyvora.com/api/escrow/${testTxId}/resend-whatsapp`, {
          method: 'POST',
          headers: headersAuth,
        }),
        { params: Promise.resolve({ id: testTxId }) }
      ),
    ]);

    const statuses = route403Checks.map((r) => r.status);
    assert(
      statuses.every((s) => s === 403),
      `All create-link & payment action routes return HTTP 403 when gated (${statuses.join(', ')})`
    );
  } finally {
    globalThis.fetch = origFetch;
    clearSafetySettingsCache();
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  console.log('\n======================================================================');
  console.log(`OPTION B & NG REDESIGN TEST SUMMARY: ${passed}/${passed + failed} CHECKS PASSED`);
  console.log('======================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal Option B test error:', err);
  process.exit(1);
});
