/**
 * Relyvora Open Signup, Vendor Tiers, Payout Safety, Risk Engine, Cooling Window & Admin Safety Suite
 *
 * Runs against Staging Supabase (`https://bepvqjqjybhhpsfbblqk.supabase.co`) with mocked
 * external transport boundaries (Anchor API, WhatsApp Cloud API, Supabase Auth /user, Resend)
 * and cleans up all synthetic TEST records in `finally`.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { assertStagingTarget } from '../scripts/seed-staging-vendor';
import {
  clearSafetySettingsCache,
  DEFAULT_COOLING_WINDOW_CONFIG,
  DEFAULT_RISK_ENGINE_CONFIG,
  DEFAULT_TIER_CONFIG,
  getCoolingWindowConfigServer,
  getHotSettings,
  getTierConfigServer,
} from '../lib/safetyLimits';
import {
  computeNameSimilarityScore,
  verifySettlementNameMatchesKyc,
} from '../lib/payoutSafety';
import {
  adminSetVendorTierOrCapOverride,
  getVendorEffectiveTierAndCaps,
  recordCompletedOrderAndEvaluateTier,
  recordDisputeAndDemoteIfNeeded,
} from '../lib/vendorTiers';
import {
  evaluateDepositWebhookRisk,
  evaluateOrderCreationRisk,
  extractRequestDeviceFingerprints,
  listRiskFlagsAndHolds,
} from '../lib/riskEngine';
import {
  expectedAdminConfirmationPhrase,
  validateAdminTypedConfirmation,
} from '../lib/adminSafety';
import { verifyAdminSession } from '../lib/adminAuth';
import { sendSystemAlert } from '../lib/alerts';
import type { MetaTemplatePayload } from '../lib/whatsapp';
import {
  clearWhatsappRetryMemoryCacheForTests,
  ensureTestSecrets,
} from './helpers/stagingAuthHelper';

import { POST as vendorOnboardingPost } from '../app/api/vendor/onboarding/route';
import { POST as settlementPost, PUT as settlementPut } from '../app/api/vendor/settlement-account/route';
import { POST as createLinkPost } from '../app/api/escrow/create-link/route';
import { POST as confirmPaymentPost } from '../app/api/escrow/confirm-payment/route';
import { POST as releasePost } from '../app/api/escrow/release/route';
import { POST as anchorWebhookPost } from '../app/api/webhooks/anchor/route';
import { POST as whatsappWebhookPost } from '../app/api/webhooks/whatsapp/route';
import { POST as adminRiskClearPost } from '../app/api/admin/risk-flags/clear/route';
import { POST as adminVendorTierPost } from '../app/api/admin/vendors/tier/route';
import { POST as adminIncidentSwitchPost } from '../app/api/admin/incident-switch/route';
import { POST as adminResolveDisputePost } from '../app/api/admin/disputes/resolve/route';

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

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS - ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL - ${message}`);
    failed++;
  }
}

function makeFakeJwt(sub: string, email: string, iatSeconds: number, aal: 'aal1' | 'aal2' = 'aal2'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      email,
      iat: iatSeconds,
      exp: iatSeconds + 3600,
      aal,
      app_metadata: { role: 'admin' },
    })
  ).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

function signAnchorWebhook(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function signMetaWebhook(rawBody: string, appSecret: string): string {
  return `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

async function main() {
  console.log('======================================================================');
  console.log('OPEN SIGNUP, TIERS, PAYOUT SAFETY, RISK & ADMIN SAFETY VERIFICATION');
  console.log('======================================================================\n');

  const { supabaseUrl, serviceRoleKey } = assertStagingTarget(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const createdVendorIds: string[] = [];
  const createdTxIds: string[] = [];
  const sentWhatsapp: Array<{ to: string; templateName?: string; body?: any }> = [];

  const realFetch = globalThis.fetch;
  const origAnchorSecret = process.env.ANCHOR_SECRET_KEY;
  const origAnchorWebhookSecret = process.env.ANCHOR_WEBHOOK_SECRET;
  const origPaymentsMode = process.env.PAYMENTS_MODE;
  const origNodeEnv = process.env.NODE_ENV;
  const origMetaSecret = process.env.WHATSAPP_APP_SECRET;
  const origAdminIds = process.env.ADMIN_USER_IDS;
  const origResendKey = process.env.RESEND_API_KEY;
  const origAlertEmail = process.env.ALERT_EMAIL;

  process.env.PAYMENTS_MODE = 'sandbox';
  (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  process.env.ANCHOR_SECRET_KEY = 'anc_test_secret_open_signup';
  process.env.ANCHOR_WEBHOOK_SECRET = 'anc_wh_secret_open_signup';
  process.env.WHATSAPP_APP_SECRET = 'meta_wh_secret_open_signup';
  const adminUserId = crypto.randomUUID();
  process.env.ADMIN_USER_IDS = adminUserId;

  let anchorKycStatusToReturn: 'PENDING' | 'VERIFIED' = 'PENDING';
  let anchorCounterPartyNameToReturn = 'TEST Chinedu Okafor';
  const capturedResendPayloads: any[] = [];

  const runTag = Date.now().toString();
  const vendorUserId = crypto.randomUUID();
  const openSuiteIp = `198.51.100.${Math.floor(Math.random() * 180) + 10}`;
  const vendorEmail = `test-open-vendor-${runTag}@relyvora.com`;
  const vendorHandle = `@TestOpenShop${runTag.slice(-4)}`;
  const vendorPhone = '+2348099998801';

  const nowSec = Math.floor(Date.now() / 1000);
  const freshAdminJwt = makeFakeJwt(adminUserId, 'admin@relyvora.com', nowSec - 60, 'aal2');
  const staleAdminJwt = makeFakeJwt(adminUserId, 'admin@relyvora.com', nowSec - 30 * 60, 'aal2');

  clearWhatsappRetryMemoryCacheForTests();

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (u.includes('graph.facebook.com/') && u.endsWith('/messages')) {
      const payload = JSON.parse(String(init?.body || '{}')) as MetaTemplatePayload;
      const messageId = `wamid_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      sentWhatsapp.push({
        to: payload.to,
        templateName: payload.template?.name,
        body: payload,
      });
      return new Response(
        JSON.stringify({
          messaging_product: 'whatsapp',
          messages: [{ id: messageId, message_status: 'sent' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (u.includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
      const form = new URLSearchParams(String(init?.body || ''));
      const tok = (form.get('response') || '').trim();
      const valid = Boolean(tok) && tok.toLowerCase() !== 'invalid' && tok.toLowerCase() !== 'fail' && tok.length >= 8;
      return new Response(
        JSON.stringify(
          valid ? { success: true } : { success: false, 'error-codes': ['invalid-input-response'] }
        ),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (u.includes('/auth/v1/user')) {
      const headersObj = new Headers(init?.headers || {});
      const tok = (headersObj.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

      if (tok === 'tok_open_vendor_confirmed') {
        return new Response(
          JSON.stringify({
            id: vendorUserId,
            email: vendorEmail,
            email_confirmed_at: '2026-01-01T00:00:00Z',
            app_metadata: { role: 'vendor' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (tok === freshAdminJwt || tok === staleAdminJwt) {
        return new Response(
          JSON.stringify({
            id: adminUserId,
            email: 'admin@relyvora.com',
            email_confirmed_at: '2026-01-01T00:00:00Z',
            app_metadata: { role: 'admin' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (tok === 'tok_non_admin_user') {
        return new Response(
          JSON.stringify({
            id: vendorUserId,
            email: vendorEmail,
            email_confirmed_at: '2026-01-01T00:00:00Z',
            app_metadata: { role: 'vendor' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ message: 'Invalid JWT' }), { status: 401 });
    }

    if (u.includes('getanchor.co')) {
      if (u.endsWith('/customers')) {
        return new Response(JSON.stringify({ data: { id: `anc_cst_open_test_${runTag}`, type: 'IndividualCustomer' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (u.includes('/verification/individual')) {
        return new Response(JSON.stringify({ data: { id: `kyc_open_test_${runTag}`, status: anchorKycStatusToReturn } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (u.endsWith('/accounts')) {
        return new Response(
          JSON.stringify({ data: { id: `anc_dep_open_test_${runTag}`, type: 'DepositAccount', attributes: {} } }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      }
      if (u.endsWith('/counterparties')) {
        return new Response(
          JSON.stringify({
            data: {
              id: `anc_cp_open_test_${runTag}`,
              type: 'CounterParty',
              attributes: { accountName: anchorCounterPartyNameToReturn },
            },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      }
      if (u.includes('/transfers')) {
        return new Response(JSON.stringify({ data: { id: `anc_tx_${Date.now()}`, type: 'Transfer' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    if (u.includes('api.resend.com/emails')) {
      const bodyJson = init?.body ? JSON.parse(String(init.body)) : {};
      capturedResendPayloads.push(bodyJson);
      return new Response(JSON.stringify({ id: `re_mock_${Date.now()}` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return realFetch(input as any, init);
  };

  try {
    ensureTestSecrets();
    clearSafetySettingsCache();

    // Ensure open signup + Owner Override defaults in system_settings
    await supabase
      .from('system_settings')
      .upsert(
        [
          { key: 'vendor_allowlist_mode', value: false, updated_by: 'test_open_suite', updated_at: new Date().toISOString() },
          { key: 'checkout_enabled', value: true, updated_by: 'test_open_suite', updated_at: new Date().toISOString() },
          { key: 'payouts_enabled', value: true, updated_by: 'test_open_suite', updated_at: new Date().toISOString() },
          { key: 'tier1_order_limit_ngn', value: 2500000, updated_by: 'test_open_suite', updated_at: new Date().toISOString() },
          { key: 'tier_upgrade_threshold', value: 5, updated_by: 'test_open_suite', updated_at: new Date().toISOString() },
          {
            key: 'tier_config',
            value: DEFAULT_TIER_CONFIG,
            updated_by: 'test_open_suite',
            updated_at: new Date().toISOString(),
          },
          {
            key: 'risk_engine_config',
            value: DEFAULT_RISK_ENGINE_CONFIG,
            updated_by: 'test_open_suite',
            updated_at: new Date().toISOString(),
          },
          {
            key: 'cooling_window_config',
            value: DEFAULT_COOLING_WINDOW_CONFIG,
            updated_by: 'test_open_suite',
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'key' }
      );
    clearSafetySettingsCache();

    // =========================================================================
    // 1. OPEN SIGNUP, CAPTCHA, SERVER-ONLY KYC_STATUS & PAYOUT GATES
    // =========================================================================
    console.log('\n--- 1. OPEN SIGNUP, CAPTCHA & SERVER-ONLY KYC_STATUS ---');
    const hot = await getHotSettings();
    assert(
      hot.vendor_allowlist_mode === false || hot.vendor_allowlist_mode === 'false' || hot.vendor_allowlist_mode === undefined,
      `Open signup default active (vendor_allowlist_mode=${JSON.stringify(hot.vendor_allowlist_mode)})`
    );

    const baseOnboardBody = (overrides: Record<string, any> = {}) => ({
      captchaToken: 'sandbox_open_captcha_verified',
      acceptedTermsAndProhibitedItems: true,
      profile: {
        storeName: vendorHandle,
        email: vendorEmail,
        phoneNumber: vendorPhone,
      },
      regulatoryKyc: {
        legalFirstName: 'TEST Chinedu',
        legalLastName: 'Okafor',
        dateOfBirth: '1991-04-12',
        gender: 'MALE',
        address: '12 Admiralty Way, Lekki Phase 1, Lagos',
        idType: 'BVN',
        idNumber: '22222222222',
        bankCode: '058',
        accountNumber: '0123456789',
      },
      ...overrides,
    });

    // Missing or bad CAPTCHA -> 400
    const resNoCaptcha = await vendorOnboardingPost(
      new NextRequest('http://localhost/api/vendor/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer tok_open_vendor_confirmed',
          'x-vercel-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify(baseOnboardBody({ captchaToken: '' })),
      })
    );
    const resFailCaptcha = await vendorOnboardingPost(
      new NextRequest('http://localhost/api/vendor/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer tok_open_vendor_confirmed',
          'x-vercel-forwarded-for': '203.0.113.11',
        },
        body: JSON.stringify(baseOnboardBody({ captchaToken: 'fail' })),
      })
    );
    assert(
      resNoCaptcha.status === 400 && resFailCaptcha.status === 400,
      `Public vendor signup enforces CAPTCHA verification (missing=${resNoCaptcha.status}, fail=${resFailCaptcha.status})`
    );

    // Mismatched bank account name -> 422 NAME_MISMATCH_BLOCKED
    anchorCounterPartyNameToReturn = 'COMPLETELY DIFFERENT PERSON';
    const resNameMismatch = await vendorOnboardingPost(
      new NextRequest('http://localhost/api/vendor/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer tok_open_vendor_confirmed',
          'x-vercel-forwarded-for': '203.0.113.12',
        },
        body: JSON.stringify(baseOnboardBody()),
      })
    );
    const jsonMismatch = await resNameMismatch.json();
    assert(
      resNameMismatch.status === 422 &&
        (jsonMismatch.code === 'SETTLEMENT_NAME_MISMATCH' || jsonMismatch.code === 'NAME_MISMATCH_BLOCKED'),
      `Onboarding blocks mismatched bank account name against KYC legal name (HTTP ${resNameMismatch.status}, code=${jsonMismatch.code})`
    );

    // Client tries spoofing kyc_status='verified' / tier='TRUSTED' while Anchor returns PENDING
    anchorCounterPartyNameToReturn = 'TEST Chinedu Okafor';
    anchorKycStatusToReturn = 'PENDING';
    const resSpoofAttempt = await vendorOnboardingPost(
      new NextRequest('http://localhost/api/vendor/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer tok_open_vendor_confirmed',
          'x-vercel-forwarded-for': '203.0.113.13',
          'user-agent': 'OpenTestBrowser/1.0',
        },
        body: JSON.stringify(
          baseOnboardBody({
            kyc_status: 'verified',
            tier: 'TRUSTED',
            cap_override_unlimited: true,
            is_allowlisted: true,
            payout_account_verified: true,
            profile: {
              storeName: vendorHandle,
              email: vendorEmail,
              phoneNumber: vendorPhone,
              kyc_status: 'verified',
              tier: 'TRUSTED',
            },
          })
        ),
      })
    );
    const jsonSpoof = await resSpoofAttempt.json();
    if (jsonSpoof?.data?.vendorId) createdVendorIds.push(jsonSpoof.data.vendorId);
    assert(
      resSpoofAttempt.status === 200 &&
        jsonSpoof.data?.dbKycStatus === 'pending' &&
        jsonSpoof.data?.tier === 'NEW',
      `Client kyc_status/tier/cap_override spoofing ignored; server sets pending & NEW tier strictly from Anchor`
    );

    // Unverified KYC vendor cannot create payment links
    const resLinkUnverified = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '203.0.113.14',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Blocked Unverified Item',
          itemPrice: 20000,
          deliveryFee: 1500,
          buyerPhone: '+2348012345670',
        }),
      })
    );
    assert(
      resLinkUnverified.status === 403,
      `Unverified open-signup vendor blocked from creating payment link (HTTP ${resLinkUnverified.status})`
    );

    // Re-run onboarding when Anchor returns VERIFIED
    anchorKycStatusToReturn = 'VERIFIED';
    const resVerifiedOnboard = await vendorOnboardingPost(
      new NextRequest('http://localhost/api/vendor/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer tok_open_vendor_confirmed',
          'x-vercel-forwarded-for': '203.0.113.15',
          'user-agent': 'OpenTestBrowser/2.0',
        },
        body: JSON.stringify(baseOnboardBody()),
      })
    );
    const jsonVerified = await resVerifiedOnboard.json();
    const openVendorId = jsonVerified?.data?.vendorId as string;
    if (openVendorId && !createdVendorIds.includes(openVendorId)) createdVendorIds.push(openVendorId);

    assert(
      resVerifiedOnboard.status === 200 &&
        Boolean(openVendorId) &&
        jsonVerified.data?.dbKycStatus === 'verified' &&
        jsonVerified.data?.tier === 'NEW' &&
        sentWhatsapp.some((w) => w.templateName === 'vendor_phone_verify_v1'),
      'Verified Anchor KYC sets dbKycStatus=verified, tier=NEW, and sends vendor_phone_verify_v1 WhatsApp confirm'
    );

    // Confirm vendor WhatsApp phone via Meta webhook -> marks phone_verified
    const waVendorConfirmPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: `wamid_vendor_phone_${Date.now()}`,
                    from: '2348099998801',
                    type: 'button',
                    button: { payload: `CONFIRM_VENDOR_PHONE:${openVendorId}`, text: 'Confirm' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const resWaConfirmVendor = await whatsappWebhookPost(
      new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signMetaWebhook(waVendorConfirmPayload, process.env.WHATSAPP_APP_SECRET!),
        },
        body: waVendorConfirmPayload,
      })
    );
    const jsonWaConfirmVendor = await resWaConfirmVendor.json();
    assert(
      resWaConfirmVendor.status === 200 &&
        Array.isArray(jsonWaConfirmVendor.processed) &&
        jsonWaConfirmVendor.processed.some((p: any) => p.action === 'VENDOR_PHONE_VERIFIED'),
      'WhatsApp webhook processes CONFIRM_VENDOR_PHONE:<vendorId> to mark vendor phone_verified'
    );

    // =========================================================================
    // 2. TIER LIMITS (CREATE-LINK + DEPOSIT WEBHOOK), RULE PROMOTION & ADMIN OVERRIDE
    // =========================================================================
    console.log('\n--- 2. TIER LIMITS, DEPOSIT CAP HOLD, RULE PROMOTION & ADMIN OVERRIDE ---');
    const tierCfg = await getTierConfigServer();
    const newTierCap = tierCfg.tiers.NEW.per_order_cap_ngn ?? 2500000;
    const newDailyCap = tierCfg.tiers.NEW.daily_volume_cap_ngn ?? 5000000;
    assert(
      newTierCap === 2500000 && newDailyCap === 5000000,
      `NEW tier defaults match FINAL DECISIONS (perOrder=${newTierCap}, daily=${newDailyCap})`
    );

    // Exceeds NEW tier cap at create-link -> 400/403
    const resOverNewCap = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '203.0.113.20',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Over-Cap Laptop',
          itemPrice: newTierCap + 50000,
          deliveryFee: 0,
          buyerPhone: '+2348011119991',
        }),
      })
    );
    assert(
      resOverNewCap.status === 400 || resOverNewCap.status === 403,
      `NEW tier rejects order above ₦${newTierCap.toLocaleString()} at create-link (HTTP ${resOverNewCap.status})`
    );

    // Exceeds NEW tier daily cap (₦5,000,000) at create-link -> 400/403
    await supabase
      .from('vendors')
      .update({
        daily_volume_ngn: 3000000,
        daily_volume_reset_at: new Date().toISOString(),
      })
      .eq('id', openVendorId);
    const resOverNewDailyCap = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '203.0.113.25',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Over-Daily-Cap Item',
          itemPrice: 2200000,
          deliveryFee: 0,
          buyerPhone: '+2348011119988',
        }),
      })
    );
    const jsonOverDailyCap = await resOverNewDailyCap.json().catch(() => ({}));
    if (jsonOverDailyCap?.transaction?.id) createdTxIds.push(jsonOverDailyCap.transaction.id);
    await supabase
      .from('vendors')
      .update({
        daily_volume_ngn: 0,
        daily_volume_reset_at: new Date().toISOString(),
      })
      .eq('id', openVendorId);
    assert(
      resOverNewDailyCap.status === 400 || resOverNewDailyCap.status === 403,
      `NEW tier rejects order pushing cumulative daily volume past ₦${newDailyCap.toLocaleString()} (HTTP ${resOverNewDailyCap.status})`
    );

    // Valid order creation under NEW tier
    const resValidNewLink = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '203.0.113.21',
          'user-agent': 'CreatorUA',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Deposit Over-Cap Hold Item',
          itemPrice: 100000,
          deliveryFee: 2000,
          buyerPhone: '+2348011119992',
        }),
      })
    );
    const jsonValidNewLink = await resValidNewLink.json();
    const overDepositTxId = jsonValidNewLink?.transaction?.id as string;
    if (overDepositTxId) createdTxIds.push(overDepositTxId);
    const targetVAcct = (jsonValidNewLink?.transaction?.virtual_account_number as string) || '8800112233';

    // Ensure transaction has virtual_account_number on Staging row if webhook needs lookup
    if (overDepositTxId && !jsonValidNewLink?.transaction?.virtual_account_number) {
      await supabase
        .from('transactions')
        .update({ virtual_account_number: targetVAcct })
        .eq('id', overDepositTxId);
    }
    const depAmountKobo = (newTierCap + 100000) * 100;
    const anchorOverCapPayload = JSON.stringify({
      type: 'virtual_nuban.credit',
      id: `evt_overcap_${Date.now()}`,
      attributes: {
        paymentId: `pay_overcap_${Date.now()}`,
        amount: depAmountKobo,
        currency: 'NGN',
        accountNumber: targetVAcct,
        metadata: { transactionId: overDepositTxId },
        sender: {
          accountNumber: '0998877665',
          bankCode: '058',
          accountName: 'Buyer Overcap Test',
        },
      },
    });
    const resOverCapWebhook = await anchorWebhookPost(
      new NextRequest('http://localhost/api/webhooks/anchor', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-anchor-signature': signAnchorWebhook(anchorOverCapPayload, process.env.ANCHOR_WEBHOOK_SECRET!),
        },
        body: anchorOverCapPayload,
      })
    );
    const jsonOverCapWh = await resOverCapWebhook.json();
    assert(
      resOverCapWebhook.status === 200 && jsonOverCapWh.reviewHold === true,
      `Deposit exceeding NEW tier cap held in review_hold=true and alerted (HTTP ${resOverCapWebhook.status})`
    );

    // Attempt release while held -> blocked (even if wrong/right code, hold blocks first)
    const resReleaseHeld = await releasePost(
      new NextRequest('http://localhost/api/escrow/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '198.51.100.91',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({ transactionId: overDepositTxId, releaseCode: '123456' }),
      })
    );
    assert(
      resReleaseHeld.status === 403 || resReleaseHeld.status === 423,
      `Held over-cap deposit cannot be released automatically (HTTP ${resReleaseHeld.status})`
    );

    // Rule-based NEW -> ESTABLISHED promotion (requires 5 clean sales AND >= 14 days AND 0 disputes)
    const promoThreshold = tierCfg.promotion.established_min_completed_orders;
    const minDays = tierCfg.promotion.established_min_days_since_first_order;
    const youngFirstOrderIso = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    const oldFirstOrderIso = new Date(Date.now() - (minDays + 2) * 24 * 3600_000).toISOString();

    await supabase
      .from('vendors')
      .update({
        tier: 'NEW',
        successful_sales_count: promoThreshold - 1,
        completed_orders_count: promoThreshold - 1,
        disputes_count: 0,
        first_order_at: youngFirstOrderIso,
      })
      .eq('id', openVendorId);
    const youngPromo = await recordCompletedOrderAndEvaluateTier({ vendorId: openVendorId, supabaseClient: supabase });
    const capsYoung = await getVendorEffectiveTierAndCaps(openVendorId, supabase);
    assert(
      youngPromo.successfulSalesCount === promoThreshold &&
        youngPromo.promoted === false &&
        youngPromo.newTier === 'NEW' &&
        capsYoung.perOrderCapNgn === 2500000 &&
        capsYoung.dailyVolumeCapNgn === 5000000,
      `5 sales under ${minDays} days does NOT promote or uncap vendor (tier=${youngPromo.newTier}, cap=${capsYoung.perOrderCapNgn})`
    );

    await supabase
      .from('vendors')
      .update({
        tier: 'NEW',
        successful_sales_count: promoThreshold - 1,
        completed_orders_count: promoThreshold - 1,
        disputes_count: 0,
        first_order_at: oldFirstOrderIso,
      })
      .eq('id', openVendorId);

    const promoResult = await recordCompletedOrderAndEvaluateTier({ vendorId: openVendorId, supabaseClient: supabase });
    const capsAfterPromo = await getVendorEffectiveTierAndCaps(openVendorId, supabase);
    const resEstAllowedLink = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '203.0.113.23',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Established Tier 3.1M Order',
          itemPrice: 3100000,
          deliveryFee: 0,
          buyerPhone: '+2348011119999',
        }),
      })
    );
    const jsonEstAllowed = await resEstAllowedLink.json();
    const estAllowedTxId = jsonEstAllowed?.transaction?.id as string | undefined;
    if (estAllowedTxId) {
      createdTxIds.push(estAllowedTxId);
    }

    const resOverEstCap = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '203.0.113.24',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Over Established 10M Cap Order',
          itemPrice: 11000000,
          deliveryFee: 0,
          buyerPhone: '+2348011119998',
        }),
      })
    );
    const jsonOverEstCap = await resOverEstCap.json().catch(() => ({}));
    if (jsonOverEstCap?.transaction?.id) {
      createdTxIds.push(jsonOverEstCap.transaction.id);
    }
    if (estAllowedTxId) {
      await supabase.from('transactions').delete().eq('id', estAllowedTxId);
    }

    assert(
      promoResult.promoted === true &&
        promoResult.newTier === 'ESTABLISHED' &&
        promoResult.successfulSalesCount === promoThreshold &&
        capsAfterPromo.perOrderCapNgn === 10000000 &&
        capsAfterPromo.dailyVolumeCapNgn === 20000000 &&
        (resEstAllowedLink.status === 200 || resEstAllowedLink.status === 201) &&
        (resOverEstCap.status === 400 || resOverEstCap.status === 403),
      `Vendor auto-promoted NEW -> ESTABLISHED (${promoResult.successfulSalesCount} sales, >=${minDays}d, 0 disputes): caps=₦10M/₦20M, allows ₦3.1M (HTTP ${resEstAllowedLink.status}), blocks ₦11M (HTTP ${resOverEstCap.status})`
    );

    // Demotion on dispute > established_max_disputes + verify disputed tx does NOT increment successful_sales_count
    await recordDisputeAndDemoteIfNeeded({
      vendorId: openVendorId,
      transactionId: overDepositTxId,
      reason: 'TEST dispute demotion',
      supabaseClient: supabase,
    });
    const afterDemote = await recordCompletedOrderAndEvaluateTier({
      vendorId: openVendorId,
      transactionId: overDepositTxId,
      supabaseClient: supabase,
    });
    assert(
      afterDemote.previousTier === 'NEW' &&
        afterDemote.incrementedSalesCount === false &&
        afterDemote.successfulSalesCount === promoThreshold,
      `Disputed tx does not increment successful_sales_count (incremented=${afterDemote.incrementedSalesCount}) and vendor stays/demotes to NEW (tier=${afterDemote.previousTier})`
    );

    // Admin-only TRUSTED / cap_override_unlimited enforcement
    const resNonAdminTier = await adminVendorTierPost(
      new NextRequest('http://localhost/api/admin/vendors/tier', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer tok_non_admin_user' },
        body: JSON.stringify({ vendorId: openVendorId, tier: 'TRUSTED', capOverrideUnlimited: true, reason: 'Try hack' }),
      })
    );
    const resNoReasonTier = await adminVendorTierPost(
      new NextRequest('http://localhost/api/admin/vendors/tier', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${freshAdminJwt}` },
        body: JSON.stringify({ vendorId: openVendorId, tier: 'TRUSTED', capOverrideUnlimited: true, reason: '' }),
      })
    );
    const resAdminTrusted = await adminVendorTierPost(
      new NextRequest('http://localhost/api/admin/vendors/tier', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${freshAdminJwt}` },
        body: JSON.stringify({
          vendorId: openVendorId,
          tier: 'TRUSTED',
          capOverrideUnlimited: true,
          reason: 'TEST verified high-volume merchant KYC audit',
        }),
      })
    );
    assert(
      (resNonAdminTier.status === 401 || resNonAdminTier.status === 403) &&
        resNoReasonTier.status === 400 &&
        resAdminTrusted.status === 200,
      `Admin-only tier TRUSTED & cap override blocks non-admins (${resNonAdminTier.status}), requires reason (${resNoReasonTier.status}), and succeeds for MFA admin (${resAdminTrusted.status})`
    );

    // With TRUSTED admin cap lift, creating an order > 10M (₦11,000,000) succeeds!
    const resUncappedLink = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '203.0.113.22',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Uncapped Trusted 11M Order',
          itemPrice: 11000000,
          deliveryFee: 0,
          buyerPhone: '+2348011119993',
        }),
      })
    );
    const jsonUncappedLink = await resUncappedLink.json();
    const uncappedTxId = jsonUncappedLink?.transaction?.id as string | undefined;
    if (uncappedTxId) {
      createdTxIds.push(uncappedTxId);
      await supabase.from('transactions').delete().eq('id', uncappedTxId);
    }
    assert(
      resUncappedLink.status === 200 || resUncappedLink.status === 201,
      `Cap-lifted TRUSTED vendor allowed to create ₦11,000,000 link (HTTP ${resUncappedLink.status})`
    );

    // Reset back to NEW without override for remaining tests
    await adminSetVendorTierOrCapOverride({
      vendorId: openVendorId,
      adminEmail: 'admin@relyvora.com',
      reason: 'Reset tier for cooling window test',
      tier: 'NEW',
      capOverrideUnlimited: false,
      supabaseClient: supabase,
    });

    // =========================================================================
    // 3. PAYOUT SAFETY: FUZZY NAME MATCH + SETTLEMENT CHANGE 48H HOLD
    // =========================================================================
    console.log('\n--- 3. PAYOUT SAFETY: FUZZY NAME MATCH & SETTLEMENT CHANGE HOLD ---');
    const goodMatch = await verifySettlementNameMatchesKyc({
      legalFirstName: 'Chinedu',
      legalLastName: 'Okafor',
      accountName: 'MR OKAFOR CHINEDU EMMANUEL',
    });
    const badMatch = await verifySettlementNameMatchesKyc({
      legalFirstName: 'Chinedu',
      legalLastName: 'Okafor',
      accountName: 'CHINEDU BALOGUN',
    });
    const simReordered = computeNameSimilarityScore('Chinedu Okafor', 'Okafor Chinedu');
    assert(
      goodMatch.matched === true && badMatch.matched === false && simReordered.score >= 0.9,
      `Fuzzy KYC name matcher accepts reordered middle-name variants (${goodMatch.score.toFixed(2)}) and rejects different surname (${badMatch.score.toFixed(2)})`
    );

    // Initiate settlement account change with mismatched name -> 422
    anchorCounterPartyNameToReturn = 'SOME OTHER VENDOR';
    const resSettleBad = await settlementPost(
      new NextRequest('http://localhost/api/vendor/settlement-account', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': openSuiteIp,
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({ bankCode: '058', accountNumber: '0987654321' }),
      })
    );
    // Initiate settlement change with matched name -> 200 + WhatsApp confirm, then PUT confirms & starts 48h hold
    anchorCounterPartyNameToReturn = 'TEST Chinedu Okafor';
    const resSettleReq = await settlementPost(
      new NextRequest('http://localhost/api/vendor/settlement-account', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': openSuiteIp,
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({ bankCode: '058', accountNumber: '0987654321' }),
      })
    );
    const resSettleConfirm = await settlementPut(
      new NextRequest('http://localhost/api/vendor/settlement-account', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': openSuiteIp,
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({ confirmationCode: 'WHATSAPP_CONFIRMED' }),
      })
    );
    const jsonSettleConfirm = await resSettleConfirm.json();
    const settleWaMsg = sentWhatsapp.find((w) => w.templateName === 'settlement_change_confirm_v1');
    const settleWaBodyParams = (settleWaMsg?.body?.template?.components?.find((c: any) => c.type === 'body') as any)
      ?.parameters?.map((p: any) => p.text) || [];
    assert(
      resSettleBad.status === 422 &&
        (resSettleReq.status === 200 || resSettleReq.status === 202) &&
        Boolean(settleWaMsg) &&
        settleWaBodyParams[1] === '4321' &&
        settleWaBodyParams[2] === 'Guaranty Trust Bank (GTBank)' &&
        !settleWaBodyParams.join(' ').includes('*') &&
        resSettleConfirm.status === 200 &&
        Boolean(jsonSettleConfirm.payoutHoldUntil),
      `Settlement bank change blocks mismatch (${resSettleBad.status}), sends WhatsApp confirm (${resSettleReq.status}, GTBank resolved, no asterisks), and enforces 48h payout hold`
    );

    // Clear settlement hold in DB so cooling window release tests can proceed later
    await supabase
      .from('vendors')
      .update({
        payout_hold_until: null,
        disputes_count: 0,
        successful_sales_count: 0,
        completed_orders_count: 0,
      })
      .eq('id', openVendorId);

    // =========================================================================
    // 4. RISK SCORING, SELF-DEALING DETECTION & PRIVACY-PRESERVING HASHING
    // =========================================================================
    console.log('\n--- 4. RISK SCORING, SELF-DEALING & PRIVACY-PRESERVING HASHING ---');
    const rawTestIp = '198.51.100.77';
    const rawTestUa = 'RiskTestBrowser/9.9';
    const spoofOnlyFps = await extractRequestDeviceFingerprints(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.250', 'x-real-ip': '203.0.113.251', 'user-agent': rawTestUa },
      })
    );
    const fps = await extractRequestDeviceFingerprints(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: { 'x-vercel-forwarded-for': rawTestIp, 'user-agent': rawTestUa, 'x-device-id': 'dev_raw_secret_id' },
      })
    );
    assert(
      spoofOnlyFps.ipHash === null &&
        Boolean(fps.ipHash && fps.uaHash && fps.deviceHash) &&
        !fps.ipHash!.includes(rawTestIp) &&
        !fps.uaHash!.includes(rawTestUa) &&
        !fps.deviceHash!.includes('dev_raw_secret_id'),
      'Trusted platform header x-vercel-forwarded-for hashes cleanly while spoofed x-forwarded-for is ignored (ipHash=null)'
    );

    // Score < 3 ALLOW
    const lowRisk = await evaluateOrderCreationRisk({
      vendor: { id: openVendorId, tier: 'NEW', phone_number: vendorPhone },
      totalAmount: 15000,
      buyerPhone: '+2348099997701',
      creatorIpHash: fps.ipHash,
      supabaseClient: supabase,
    });
    assert(
      lowRisk.score < 3 && lowRisk.actionTaken === 'ALLOW' && !lowRisk.reviewHold && !lowRisk.orderBlocked,
      `Clean low-risk order scored ${lowRisk.score} (<3) -> ALLOW`
    );

    // ₦500,000 review threshold for NEW vendors triggers ABOVE_REVIEW_AMOUNT (weight=2)
    const new500kRisk = await evaluateOrderCreationRisk({
      vendor: { id: openVendorId, tier: 'NEW', phone_number: vendorPhone },
      totalAmount: 500000,
      buyerPhone: '+2348099997702',
      creatorIpHash: fps.ipHash,
      supabaseClient: supabase,
    });
    assert(
      new500kRisk.signals.some((s) => s.code === 'ABOVE_REVIEW_AMOUNT' && s.weight === 2),
      `NEW vendor order at ₦500,000 flags ABOVE_REVIEW_AMOUNT (weight=2, score=${new500kRisk.score})`
    );

    // Score >=80 / shared vendor phone -> BLOCK at create-link
    const resSelfPhoneLink = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': rawTestIp,
          'user-agent': rawTestUa,
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Self-Dealing Shared Phone',
          itemPrice: 25000,
          deliveryFee: 0,
          buyerPhone: vendorPhone, // SAME PHONE AS VENDOR!
        }),
      })
    );
    assert(
      resSelfPhoneLink.status === 403,
      `Shared vendor-buyer phone self-dealing blocked at create-link (HTTP ${resSelfPhoneLink.status})`
    );

    // Check risk_flags contain no raw IP or UA
    const flags = await listRiskFlagsAndHolds(supabase);
    const flagsJson = JSON.stringify(flags);
    assert(
      flags.length > 0 && !flagsJson.includes(rawTestIp) && !flagsJson.includes(rawTestUa),
      `risk_flags persisted (${flags.length} entries) and contain zero raw IP or raw User-Agent strings`
    );

    // Deposit self-dealing check (sender account == vendor's payout account '0987654321')
    const selfDealDepositRisk = await evaluateDepositWebhookRisk({
      transactionId: overDepositTxId,
      vendorId: openVendorId,
      totalDepositedNgn: 50000,
      senderAccountNumber: '0987654321',
      senderBankCode: '058',
      senderName: 'TEST Chinedu Okafor',
      supabaseClient: supabase,
    });
    assert(
      selfDealDepositRisk.orderBlocked === true &&
        selfDealDepositRisk.signals.some(
          (s) => s.code === 'SELF_DEALING_ACCOUNT_MATCH' || s.code === 'SELF_DEALING_SENDER_ACCOUNT'
        ),
      `Deposit sender account matching vendor settlement account triggers SELF_DEALING block (score=${selfDealDepositRisk.score})`
    );

    // Live-mode missing sender_name flagged for review
    process.env.PAYMENTS_MODE = 'live';
    const liveMissingNameRisk = await evaluateDepositWebhookRisk({
      transactionId: overDepositTxId,
      vendorId: openVendorId,
      totalDepositedNgn: 50000,
      senderAccountNumber: '0112233445',
      senderBankCode: '058',
      senderName: null,
      supabaseClient: supabase,
    });
    process.env.PAYMENTS_MODE = 'sandbox';
    assert(
      liveMissingNameRisk.reviewHold === true &&
        liveMissingNameRisk.signals.some((s) => s.code === 'MISSING_DEPOSIT_SENDER_NAME'),
      'Missing deposit sender_name in live mode flags MISSING_DEPOSIT_SENDER_NAME review hold'
    );

    // =========================================================================
    // 5. COOLING WINDOW (2H NEW VS 0H ESTABLISHED), WHATSAPP PROBLEM FREEZE & UI WARNINGS
    // =========================================================================
    console.log('\n--- 5. COOLING WINDOW, PROBLEM FREEZE & EARLY-CODE WARNINGS ---');
    const paySrc = fs.readFileSync('app/(app)/pay/[id]/page.tsx', 'utf8');
    const orderSrc = fs.readFileSync('app/(app)/order/[id]/page.tsx', 'utf8');
    assert(
      paySrc.includes('Giving the code releases the money') &&
        paySrc.includes('The release code is sent only to the buyer') &&
        orderSrc.includes('Giving the code releases the money') &&
        orderSrc.includes('The release code is sent only to the buyer'),
      'Both /pay/[id] and /order/[id] UI contain exact early-code security warnings'
    );

    // Create NEW-tier order and fund via sandbox confirm-payment
    const coolingCfg = await getCoolingWindowConfigServer();
    assert(
      coolingCfg.hours_by_tier.NEW === 2 &&
        coolingCfg.hours_by_tier.ESTABLISHED === 0 &&
        coolingCfg.high_value_cooling_hours === 2,
      'Cooling config has NEW=2h, ESTABLISHED=0h, high_value_cooling_hours=2h'
    );

    const resCoolLink = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '198.51.100.88',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Cooling Window Order',
          itemPrice: 30000,
          deliveryFee: 1500,
          buyerPhone: '+2348088887766',
        }),
      })
    );
    const jsonCoolLink = await resCoolLink.json();
    const coolTxId = jsonCoolLink?.transaction?.id as string;
    if (coolTxId) createdTxIds.push(coolTxId);

    // Fund in sandbox -> gets plaintext sandbox_release_code
    const resFundCool = await confirmPaymentPost(
      new NextRequest('http://localhost/api/escrow/confirm-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactionId: coolTxId, method: 'sandbox_transfer' }),
      })
    );
    const jsonFundCool = await resFundCool.json();
    const releaseCode = jsonFundCool?.sandbox_release_code as string;

    // Attempt release for NEW tier -> HTTP 202 COOLING_HOLD + WhatsApp PROBLEM button sent!
    const resCool202 = await releasePost(
      new NextRequest('http://localhost/api/escrow/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '198.51.100.91',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({ transactionId: coolTxId, releaseCode }),
      })
    );
    const jsonCool202 = await resCool202.json();
    const coolMsg = sentWhatsapp.find((w) => w.templateName === 'payout_cooling_notice_v1');
    const coolBtnPayload = (coolMsg?.body?.template?.components?.find((c: any) => c.type === 'button') as any)
      ?.parameters?.[0]?.payload;
    assert(
      resCool202.status === 202 &&
        jsonCool202.coolingActive === true &&
        Boolean(coolMsg) &&
        coolBtnPayload === `PROBLEM_ORDER:${coolTxId}`,
      `NEW tier code entry triggers HTTP 202 cooling hold and dispatches buyer WhatsApp Problem notice (${coolBtnPayload})`
    );

    // Buyer taps "Problem" button via WhatsApp webhook -> freezes order to DISPUTED
    const waProblemPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: `wamid_problem_${Date.now()}`,
                    from: '2348088887766',
                    type: 'button',
                    button: { payload: `PROBLEM_ORDER:${coolTxId}`, text: 'Problem' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const resWaProblem = await whatsappWebhookPost(
      new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signMetaWebhook(waProblemPayload, process.env.WHATSAPP_APP_SECRET!),
        },
        body: waProblemPayload,
      })
    );
    const { data: coolTxAfterProblem } = await supabase
      .from('transactions')
      .select('status')
      .eq('id', coolTxId)
      .single();
    assert(
      resWaProblem.status === 200 && coolTxAfterProblem?.status === 'DISPUTED',
      `WhatsApp PROBLEM reply during cooling window freezes escrow to DISPUTED (status=${coolTxAfterProblem?.status})`
    );

    // TRUSTED / ESTABLISHED tier (0h cooling) releases immediately with HTTP 200
    await adminSetVendorTierOrCapOverride({
      vendorId: openVendorId,
      adminEmail: 'admin@relyvora.com',
      reason: 'Test 0h instant release for ESTABLISHED/TRUSTED',
      tier: 'ESTABLISHED',
      supabaseClient: supabase,
    });
    const resEstLink = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '198.51.100.89',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Established 0h Release',
          itemPrice: 20000,
          deliveryFee: 0,
          buyerPhone: '+2348088887755',
        }),
      })
    );
    const jsonEstLink = await resEstLink.json();
    const estTxId = jsonEstLink?.transaction?.id as string;
    if (estTxId) createdTxIds.push(estTxId);
    const resEstFund = await confirmPaymentPost(
      new NextRequest('http://localhost/api/escrow/confirm-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactionId: estTxId, method: 'sandbox_transfer' }),
      })
    );
    const jsonEstFund = await resEstFund.json();
    const estCode = jsonEstFund?.sandbox_release_code as string;
    const resEstRelease = await releasePost(
      new NextRequest('http://localhost/api/escrow/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '198.51.100.91',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({ transactionId: estTxId, releaseCode: estCode }),
      })
    );
    assert(
      resEstRelease.status === 200,
      `ESTABLISHED tier (0h cooling) releases payout immediately with HTTP ${resEstRelease.status}`
    );

    // High-value (>= ₦500,000) order for ESTABLISHED vendor STILL enforces 2h cooling window (HTTP 202 COOLING_HOLD)
    const resEstHighValLink = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '198.51.100.90',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Established High-Value 500k Order',
          itemPrice: 500000,
          deliveryFee: 0,
          buyerPhone: '+2348088887756',
        }),
      })
    );
    const jsonEstHighValLink = await resEstHighValLink.json();
    const estHighValTxId = jsonEstHighValLink?.transaction?.id as string;
    if (estHighValTxId) {
      createdTxIds.push(estHighValTxId);
      await supabase.from('transactions').update({ review_hold: false }).eq('id', estHighValTxId);
    }
    const resEstHighValFund = await confirmPaymentPost(
      new NextRequest('http://localhost/api/escrow/confirm-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactionId: estHighValTxId, method: 'sandbox_transfer' }),
      })
    );
    const jsonEstHighValFund = await resEstHighValFund.json();
    const estHighValCode = jsonEstHighValFund?.sandbox_release_code as string;
    const resEstHighValRelease = await releasePost(
      new NextRequest('http://localhost/api/escrow/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '198.51.100.91',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({ transactionId: estHighValTxId, releaseCode: estHighValCode }),
      })
    );
    const jsonEstHighValRelease = await resEstHighValRelease.json().catch(() => ({}));
    assert(
      resEstHighValRelease.status === 202 &&
        jsonEstHighValRelease?.coolingActive === true &&
        Number(jsonEstHighValRelease?.coolingWindowHours) === 2,
      `ESTABLISHED tier order >= ₦500,000 enforces 2h cooling hold (HTTP ${resEstHighValRelease.status}, coolingActive=${jsonEstHighValRelease?.coolingActive}, coolingWindowHours=${jsonEstHighValRelease?.coolingWindowHours})`
    );

    // =========================================================================
    // 6. ADMIN SAFETY, TYPED CONFIRMATION, SHORT SESSION, KILL SWITCHES & ALERT SANITIZATION
    // =========================================================================
    console.log('\n--- 6. ADMIN TYPED CONFIRMATION, SESSION AGE, KILL SWITCHES & ALERT SANITIZATION ---');
    const txUuidDummy = '12345678-1111-2222-3333-444444444444';
    const expectedPhrase = expectedAdminConfirmationPhrase({
      action: 'REFUND',
      transactionId: txUuidDummy,
      amountNgn: 45000,
    });
    const badTyped = await validateAdminTypedConfirmation({
      action: 'REFUND',
      transactionId: txUuidDummy,
      amountNgn: 45000,
      typedConfirmation: 'WRONG PHRASE',
    });
    const goodTyped = await validateAdminTypedConfirmation({
      action: 'REFUND',
      transactionId: txUuidDummy,
      amountNgn: 45000,
      typedConfirmation: expectedPhrase,
    });
    assert(
      badTyped.valid === false && goodTyped.valid === true && expectedPhrase === 'CONFIRM REFUND 12345678 45000',
      `Typed confirmation helper enforces exact phrase ("${expectedPhrase}")`
    );

    // Stale admin session (iat 30m ago > 15m default) rejected with SESSION_EXPIRED
    const staleAuth = await verifyAdminSession(
      new NextRequest('http://localhost/api/admin/disputes/list', {
        headers: { authorization: `Bearer ${staleAdminJwt}` },
      })
    );
    const freshAuth = await verifyAdminSession(
      new NextRequest('http://localhost/api/admin/disputes/list', {
        headers: { authorization: `Bearer ${freshAdminJwt}` },
      })
    );
    assert(
      staleAuth.authorized === false && staleAuth.code === 'SESSION_EXPIRED' && freshAuth.authorized === true,
      `Short admin session limit rejects 30m-old JWT (code=${staleAuth.code}) and accepts fresh 1m JWT`
    );

    // Note: if coolTxId lacked a verified refund destination, set sandbox refund dest so prepare reaches typedConfirmation gate
    await supabase
      .from('transactions')
      .update({
        refund_destination_account: '0123456789',
        refund_destination_bank: '058',
        refund_destination_name: 'TEST Buyer',
      })
      .eq('id', coolTxId);

    const resBadTypedResolve = await adminResolveDisputePost(
      new NextRequest('http://localhost/api/admin/disputes/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${freshAdminJwt}` },
        body: JSON.stringify({
          transactionId: coolTxId,
          scenarioId: 1,
          resolutionNotes: 'TEST missing typed confirmation',
        }),
      })
    );
    const jsonBadTypedResolve = await resBadTypedResolve.json();
    assert(
      resBadTypedResolve.status === 400 &&
        jsonBadTypedResolve.code === 'TYPED_CONFIRMATION_REQUIRED' &&
        typeof jsonBadTypedResolve.expectedPhrase === 'string' &&
        jsonBadTypedResolve.expectedPhrase.startsWith('CONFIRM REFUND '),
      `POST /api/admin/disputes/resolve rejects missing typed confirmation (${resBadTypedResolve.status}, ${jsonBadTypedResolve.code})`
    );

    // Admin clear risk hold route
    const resClearHold = await adminRiskClearPost(
      new NextRequest('http://localhost/api/admin/risk-flags/clear', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${freshAdminJwt}` },
        body: JSON.stringify({
          transactionId: overDepositTxId,
          reason: 'TEST manual review cleared by compliance admin',
          unblock: true,
        }),
      })
    );
    assert(resClearHold.status === 200, `Admin risk hold clear route succeeded (HTTP ${resClearHold.status})`);

    // Incident kill switches: toggle payouts_enabled = false and verify release blocks, toggle checkout_enabled = false and verify create-link blocks
    const resPayoutOff = await adminIncidentSwitchPost(
      new NextRequest('http://localhost/api/admin/incident-switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${freshAdminJwt}` },
        body: JSON.stringify({ settingKey: 'payouts_enabled', enabled: false, reason: 'TEST emergency freeze' }),
      })
    );
    const resReleasePaused = await releasePost(
      new NextRequest('http://localhost/api/escrow/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '198.51.100.91',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({ transactionId: overDepositTxId, releaseCode: '123456' }),
      })
    );
    const resCheckoutOff = await adminIncidentSwitchPost(
      new NextRequest('http://localhost/api/admin/incident-switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${freshAdminJwt}` },
        body: JSON.stringify({ settingKey: 'checkout_enabled', enabled: false, reason: 'TEST checkout kill switch' }),
      })
    );
    const resLinkPaused = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': '198.51.100.91',
          authorization: 'Bearer tok_open_vendor_confirmed',
        },
        body: JSON.stringify({
          vendorHandle,
          itemName: 'TEST Paused Checkout',
          itemPrice: 10000,
          deliveryFee: 0,
          buyerPhone: '+2348088887744',
        }),
      })
    );
    assert(
      resPayoutOff.status === 200 &&
        resReleasePaused.status === 503 &&
        resCheckoutOff.status === 200 &&
        resLinkPaused.status === 503,
      `One-click kill switches immediately pause payouts (${resReleasePaused.status}) and checkout (${resLinkPaused.status})`
    );

    // Verify Resend alerts redact secrets and plaintext codes
    process.env.RESEND_API_KEY = 're_mock_key_12345';
    process.env.ALERT_EMAIL = 'ops-test@relyvora.com';
    await sendSystemAlert({
      type: 'INCIDENT_SWITCH',
      severity: 'CRITICAL',
      title: 'TEST Alert Redaction Check',
      details: {
        secret: 'TOP_SECRET_VALUE_999',
        releaseCode: '849201',
        token: 'super_secret_token_value',
        safeNote: 'Normal visible diagnostic note',
      },
    });
    const lastAlertHtml = String(capturedResendPayloads.at(-1)?.html || '');
    assert(
      capturedResendPayloads.length >= 1 &&
        !lastAlertHtml.includes('TOP_SECRET_VALUE_999') &&
        !lastAlertHtml.includes('849201') &&
        !lastAlertHtml.includes('super_secret_token_value') &&
        lastAlertHtml.includes('Normal visible diagnostic note'),
      'Resend ops alerts redact sensitive fields/codes while retaining safe diagnostics'
    );
  } finally {
    // Always restore kill switches & test harnesses
    await supabase
      .from('system_settings')
      .upsert(
        [
          { key: 'vendor_allowlist_mode', value: false, updated_by: 'test_cleanup', updated_at: new Date().toISOString() },
          { key: 'checkout_enabled', value: true, updated_by: 'test_cleanup', updated_at: new Date().toISOString() },
          { key: 'payouts_enabled', value: true, updated_by: 'test_cleanup', updated_at: new Date().toISOString() },
        ],
        { onConflict: 'key' }
      )
      .then(() => {});
    clearSafetySettingsCache();

    // Clean up all synthetic TEST rows created on Staging
    for (const txId of createdTxIds) {
      await supabase.from('risk_flags').delete().eq('transaction_id', txId);
      await supabase.from('whatsapp_message_log').delete().eq('transaction_id', txId);
      await supabase.from('buyer_phone_verifications').delete().eq('transaction_id', txId);
      await supabase.from('dispute_resolutions').delete().eq('transaction_id', txId);
      await supabase.from('deposits').delete().eq('transaction_id', txId);
      await supabase.from('admin_audit_log').delete().eq('target_id', txId);
      const { error: delErr } = await supabase.from('transactions').delete().eq('id', txId);
      if (delErr) {
        await supabase
          .from('transactions')
          .update({ item_name: 'TEST - Open Signup Ledger Order', resolution_notes: 'TEST' })
          .eq('id', txId);
      }
    }

    for (const vId of createdVendorIds) {
      await supabase.from('risk_flags').delete().eq('vendor_id', vId);
      await supabase.from('admin_audit_log').delete().eq('target_id', vId);
      await supabase.from('rate_limit_buckets').delete().ilike('key', `%${vId}%`);
      const { error: vDelErr } = await supabase.from('vendors').delete().eq('id', vId);
      if (vDelErr) {
        await supabase
          .from('vendors')
          .update({ user_id: null, store_name: `TEST - Archived Open Vendor (${vId.slice(0, 8)})`, is_suspended: true })
          .eq('id', vId);
      }
    }
    await supabase.from('rate_limit_buckets').delete().ilike('key', '%198.51.100.%');
    await supabase.from('rate_limit_buckets').delete().ilike('key', `%${openSuiteIp}%`);
    await supabase.from('rate_limit_buckets').delete().ilike('key', '%203.0.113.%');

    clearWhatsappRetryMemoryCacheForTests();
    globalThis.fetch = realFetch;

    if (origAnchorSecret === undefined) delete process.env.ANCHOR_SECRET_KEY;
    else process.env.ANCHOR_SECRET_KEY = origAnchorSecret;
    if (origAnchorWebhookSecret === undefined) delete process.env.ANCHOR_WEBHOOK_SECRET;
    else process.env.ANCHOR_WEBHOOK_SECRET = origAnchorWebhookSecret;
    if (origPaymentsMode === undefined) delete process.env.PAYMENTS_MODE;
    else process.env.PAYMENTS_MODE = origPaymentsMode;
    if (origNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
    if (origMetaSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = origMetaSecret;
    if (origAdminIds === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = origAdminIds;
    if (origResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = origResendKey;
    if (origAlertEmail === undefined) delete process.env.ALERT_EMAIL;
    else process.env.ALERT_EMAIL = origAlertEmail;
  }

  console.log('\n======================================================================');
  console.log(`OPEN SIGNUP, TIERS & RISK SUITE: ${passed}/${passed + failed} CHECKS PASSED`);
  console.log('======================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error running open-signup-tiers-risk test suite:', err);
  process.exit(1);
});
