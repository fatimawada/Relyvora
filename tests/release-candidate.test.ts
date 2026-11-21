/**
 * Relyvora Release Candidate Comprehensive Verification Suite (Staging Only)
 *
 * Verifies all 10 Release Candidate criteria against Staging Supabase
 * (`https://bepvqjqjybhhpsfbblqk.supabase.co`) and cleans up temporary rows.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  DEFAULT_MAX_ORDER_NGN,
  DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN,
  clearSafetySettingsCache,
  validateOrderCreationServer,
} from '../lib/safetyLimits';
import { calculatePricing } from '../lib/pricing';
import { calculateFee } from '../lib/feeConfig';
import { computeReleaseCodeHmac } from '../lib/releaseCode';
import { isAnchorBrandApproved, ANCHOR_BRAND_APPROVED_DEFAULT } from '../lib/anchorBrand';
import { verifyAdminSession, verifyAdminIdentityForMfaSetup } from '../lib/adminAuth';
import { maskPhoneNumber } from '../lib/smsDelivery';
import {
  clearWhatsappRetryMemoryCacheForTests,
  captureMetaCloudDispatch,
  ensureTestSecrets,
  extractSetCookiePair,
} from './helpers/stagingAuthHelper';
import type { MetaTemplatePayload } from '../lib/whatsapp';
import {
  getWhatsappDailyLimits,
  hashWhatsappPhone,
  WHATSAPP_TEMPLATES,
} from '../lib/whatsapp';
import {
  BUYER_OTP_CHALLENGE_COOKIE_NAME,
  BUYER_SESSION_COOKIE_NAME,
  computeBuyerPhoneBindingHash,
} from '../lib/buyerSession';

import { POST as createLinkPost } from '../app/api/escrow/create-link/route';
import { GET as getEscrowById } from '../app/api/escrow/[id]/route';
import { GET as listEscrowGet } from '../app/api/escrow/list/route';
import { POST as buyerSessionPost } from '../app/api/escrow/buyer-session/route';
import { POST as anchorWebhookPost } from '../app/api/webhooks/anchor/route';
import { POST as whatsappWebhookPost } from '../app/api/webhooks/whatsapp/route';
import { POST as resendWhatsappPost } from '../app/api/escrow/[id]/resend-whatsapp/route';
import { POST as reissueCodePost } from '../app/api/escrow/reissue-code/route';
import { POST as confirmPaymentPost } from '../app/api/escrow/confirm-payment/route';
import { GET as adminSecurityGet } from '../app/api/admin/security/route';
import { POST as vendorOnboardingPost } from '../app/api/vendor/onboarding/route';

const EXPECTED_STAGING_URL = 'https://bepvqjqjybhhpsfbblqk.supabase.co';

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

function getAllFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFilesRecursive(full));
    } else if (/\.(ts|tsx|js|jsx|css)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function callAnonPostgrest(url: string, anonKey: string, endpoint: string, method: string, body?: unknown) {
  const res = await fetch(`${url}/rest/v1${endpoint}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const denied =
    res.status >= 400 ||
    text.includes('permission denied') ||
    text.includes('row-level security') ||
    text === '[]' ||
    text === '';
  return { status: res.status, text: text.slice(0, 120), denied };
}

async function runReleaseCandidateSuite() {
  console.log('======================================================================');
  console.log('RELYVORA RELEASE CANDIDATE VERIFICATION SUITE (STAGING ONLY)');
  console.log('======================================================================\n');

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (supabaseUrl !== EXPECTED_STAGING_URL || !serviceKey || !anonKey) {
    throw new Error(
      `Release candidate suite must target staging (${EXPECTED_STAGING_URL}) with NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY set.`
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const createdTxIds: string[] = [];
  const createdEventIds: string[] = [];
  ensureTestSecrets();

  const { data: stagingVendorRow } = await supabase
    .from('vendors')
    .select('id, user_id, email, store_name')
    .ilike('store_name', '%StagingTestVendor%')
    .maybeSingle();
  const origStagingVendorUserId = stagingVendorRow?.user_id ?? null;

  const rcRunTag = Date.now().toString();
  const rcVendorUserId = crypto.randomUUID();
  const rcVendorEmail = `test-rc-vendor-${rcRunTag}@relyvora.com`;
  const rcVendorHandle = `@TEST_RC_${rcRunTag.slice(-6)}`;
  const { data: ephemeralRcVendor, error: ephVendErr } = await supabase
    .from('vendors')
    .insert({
      user_id: rcVendorUserId,
      store_name: rcVendorHandle,
      email: rcVendorEmail,
      phone_number: '+2348000000001',
      phone_verified: true,
      phone_verified_at: new Date().toISOString(),
      legal_first_name: 'TEST RC',
      legal_last_name: 'Vendor',
      kyc_status: 'verified',
      is_allowlisted: true,
      payout_account_verified: true,
      settlement_account_name_matched: true,
      settlement_name_match_score: 1.0,
      anchor_deposit_account_id: `anc_rc_acc_${rcRunTag}`,
      settlement_bank_code: '058',
      settlement_account_number: '0123456789',
      settlement_account_name: 'TEST RC VENDOR',
      tier: 'NEW',
    })
    .select('*')
    .single();
  if (ephVendErr || !ephemeralRcVendor) {
    throw new Error(`Failed creating ephemeral RC vendor: ${ephVendErr?.message}`);
  }
  const rcVendorToken = 'tok_rc_staging_vendor';
  const rcSuiteIp = `198.51.100.${Math.floor(Math.random() * 180) + 10}`;

  try {
    // =========================================================================
    // 1. DEFAULTS (NO CAPS)
    // =========================================================================
    console.log('--- 1. DEFAULTS (NO CAPS) & INSTANT OVERRIDES ---');
    assert(DEFAULT_MAX_ORDER_NGN === null, `DEFAULT_MAX_ORDER_NGN === null (got ${DEFAULT_MAX_ORDER_NGN})`);
    assert(
      DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN === null,
      `DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN === null (got ${DEFAULT_MAX_DAILY_VENDOR_VOLUME_NGN})`
    );

    const { data: settingsRows } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['max_order_ngn', 'max_daily_vendor_volume_ngn']);
    const maxOrderRow = settingsRows?.find((r) => r.key === 'max_order_ngn');
    const maxDailyRow = settingsRows?.find((r) => r.key === 'max_daily_vendor_volume_ngn');
    assert(maxOrderRow?.value === null, `Staging system_settings.max_order_ngn is null`);
    assert(maxDailyRow?.value === null, `Staging system_settings.max_daily_vendor_volume_ngn is null`);

    clearSafetySettingsCache();
    const highValueOrder = await validateOrderCreationServer({
      vendorHandle: '@StagingTestVendor',
      totalAmount: 1500000,
    });
    assert(highValueOrder.allowed === true, 'High-value ₦1,500,000 order succeeds when caps are null');

    // =========================================================================
    // 2. BANK TRANSFER ONLY IN LIVE MODE (/pay/[id])
    // =========================================================================
    console.log('\n--- 2. BANK TRANSFER ONLY IN LIVE MODE (/pay/[id]) ---');
    const payPageSrc = fs.readFileSync('app/(app)/pay/[id]/page.tsx', 'utf8');
    const normalizedPaySrc = payPageSrc.replace(/&apos;/g, "'");
    assert(
      normalizedPaySrc.includes(
        "Pay by bank transfer from your bank app, internet banking or your bank's USSD code. Transfer the exact amount."
      ),
      '/pay/[id] contains exact live bank transfer prompt text'
    );
    assert(
      payPageSrc.includes(': liveMode ? (') &&
        payPageSrc.includes('{!liveMode && (') &&
        payPageSrc.includes('<SimulatedPaymentModal'),
      '/pay/[id] shows bank transfer card only in liveMode and gates SimulatedPaymentModal behind !liveMode'
    );
    assert(
      !/card\s*number|cvv|card\s*expiry/i.test(payPageSrc),
      '/pay/[id] contains zero card number, CVV, or card expiry form fields'
    );

    // =========================================================================
    // 3. LIVE MODE WHATSAPP LINK CONFIRMATION, RELEASE CODE SECRECY & OTP REISSUE
    // =========================================================================
    console.log('\n--- 3. WHATSAPP LINK CONFIRMATION, RELEASE CODE SECRECY & OTP REISSUE (STAGING DB) ---');
    const origPaymentsMode = process.env.PAYMENTS_MODE;
    const origWebhookSecret = process.env.ANCHOR_WEBHOOK_SECRET;
    const origPepper = process.env.RELEASE_CODE_PEPPER;
    const origWaAppSecret = process.env.WHATSAPP_APP_SECRET;
    const origWaVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    const origWaAllowedRecipients = process.env.WHATSAPP_ALLOWED_RECIPIENTS;
    const origResendKey = process.env.RESEND_API_KEY;
    const realFetch = globalThis.fetch;
    const realConsoleLog = console.log;

    // Clean stale Staging WhatsApp logs/DNC for test fixtures before hitting daily limits
    const staleDefaultHash = hashWhatsappPhone('+2348099991234');
    await supabase.from('whatsapp_message_log').delete().eq('vendor_handle', '@StagingTestVendor');
    await supabase.from('whatsapp_message_log').delete().eq('recipient_phone_hash', staleDefaultHash);
    await supabase.from('whatsapp_do_not_contact').delete().eq('phone_hash', staleDefaultHash);

    const capturedWaPayloads: MetaTemplatePayload[] = [];
    const capturedEmails: Array<{ to: string; subject: string; html: string }> = [];
    const capturedLogs: string[] = [];
    let waMsgCounter = 0;

    process.env.PAYMENTS_MODE = 'live';
    process.env.ANCHOR_WEBHOOK_SECRET = 'rc_test_webhook_secret_32bytes_min';
    process.env.RELEASE_CODE_PEPPER = 'rc_test_pepper_32bytes_hex_staging';
    process.env.WHATSAPP_APP_SECRET = 'wa_rc_test_app_secret_32bytes_min';
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'wa_rc_verify_token';
    delete process.env.WHATSAPP_ALLOWED_RECIPIENTS;
    process.env.RESEND_API_KEY = 're_rc_staging_mock';

    const staleTestHash = hashWhatsappPhone('+2348099991234');
    const stalePhoneBindingHash = computeBuyerPhoneBindingHash('+2348099991234');
    await supabase.from('whatsapp_message_log').delete().eq('recipient_phone_hash', staleTestHash);
    await supabase.from('whatsapp_do_not_contact').delete().eq('phone_hash', staleTestHash);
    await supabase.from('rate_limit_buckets').delete().ilike('key', `%${stalePhoneBindingHash}%`);
    await supabase.from('rate_limit_buckets').delete().ilike('key', '%198.51.100.%');
    if (stagingVendorRow?.id) {
      await supabase.from('rate_limit_buckets').delete().ilike('key', `%create_link_v:${stagingVendorRow.id}%`);
    }

    clearWhatsappRetryMemoryCacheForTests();

    // Intercept ONLY external Meta Graph / Anchor / Resend HTTP calls and synthetic RC vendor token; forward Supabase unmodified
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (urlStr.includes('graph.facebook.com/') && urlStr.endsWith('/messages')) {
        const parsed = JSON.parse(String(init?.body || '{}')) as MetaTemplatePayload;
        capturedWaPayloads.push(parsed);
        waMsgCounter += 1;
        const messageId = `wamid.rc_${Date.now()}_${waMsgCounter}`;
        return new Response(
          JSON.stringify({
            messaging_product: 'whatsapp',
            messages: [{ id: messageId, message_status: 'sent' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr.includes('/auth/v1/user')) {
        const headersObj = new Headers(init?.headers || {});
        const tok = (headersObj.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        if (tok === rcVendorToken) {
          return new Response(
            JSON.stringify({
              id: rcVendorUserId,
              email: rcVendorEmail,
              email_confirmed_at: '2026-01-01T00:00:00Z',
              app_metadata: { role: 'vendor' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
      }

      if (urlStr.includes('getanchor.co') && urlStr.includes('/virtual-nubans')) {
        return new Response(
          JSON.stringify({
            data: {
              id: `vn_rc_${Date.now()}`,
              attributes: {
                accountNumber: '9988776655',
                accountName: 'RELYVORA/STAGING RC',
                bank: { name: 'PROVIDUS BANK', nipCode: '000023' },
              },
            },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr.includes('api.resend.com')) {
        const parsed = JSON.parse(String(init?.body || '{}'));
        capturedEmails.push({
          to: Array.isArray(parsed.to) ? parsed.to[0] : String(parsed.to || ''),
          subject: String(parsed.subject || ''),
          html: String(parsed.html || ''),
        });
        return new Response(JSON.stringify({ id: `email_rc_${Date.now()}` }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return realFetch(input as any, init);
    };

    try {
      console.log = (...args: any[]) => {
        const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        capturedLogs.push(msg);
        realConsoleLog(...args);
      };

      // 3.0 Without buyerWhatsappConsent checkbox, NO WhatsApp message is sent (Copy link fallback works)
      const noConsentRes = await createLinkPost(
        new NextRequest('http://localhost:3000/api/escrow/create-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': rcSuiteIp, authorization: `Bearer ${rcVendorToken}` },
          body: JSON.stringify({
            itemName: 'RC No Consent Check',
            itemPrice: 12000,
            deliveryFee: 0,
            vendorHandle: '@StagingTestVendor',
            buyerPhone: '+2348099991234',
            buyerWhatsappConsent: false,
          }),
        })
      );
      const noConsentJson = await noConsentRes.json();
      if (noConsentJson?.transaction?.id) createdTxIds.push(noConsentJson.transaction.id);
      assert(
        noConsentRes.status === 201 &&
          noConsentJson.whatsapp_delivery_status === 'not_sent' &&
          capturedWaPayloads.length === 0 &&
          noConsentJson.transaction?.virtual_account_number === null,
        'No WhatsApp message sent without consent checkbox & Copy-link fallback returns unverified order with redacted NUBAN'
      );

      // 3a. With consent checkbox + verified allowlisted vendor -> payment_link_v1 sent ONLY to entered number
      const createReq = new NextRequest('http://localhost:3000/api/escrow/create-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': rcSuiteIp, authorization: `Bearer ${rcVendorToken}` },
        body: JSON.stringify({
          itemName: 'TEST - RC Staging Camera Lens',
          itemPrice: 40000,
          deliveryFee: 2000,
          vendorHandle: '@StagingTestVendor',
          buyerPhone: '08099991234',
          buyerWhatsappConsent: true,
        }),
      });
      const createRes = await createLinkPost(createReq);
      const createJson = await createRes.json();
      assert(createRes.status === 201 && createJson.success, `create-link succeeded (HTTP ${createRes.status})`);
      assert(
        createJson.sandbox_release_code === undefined && createJson.transaction?.release_code_hash === undefined,
        'create-link in live mode never returns release code or release_code_hash'
      );

      const liveTxId = createJson.transaction.id as string;
      const liveTotalAmount = Number(createJson.transaction.total_amount);
      createdTxIds.push(liveTxId);

      const firstWaPayload = capturedWaPayloads[0];
      assert(
        createJson.whatsapp_delivery_status === 'sent' &&
          capturedWaPayloads.length === 1 &&
          firstWaPayload?.to === '+2348099991234' &&
          firstWaPayload?.template?.name === 'payment_link_v1',
        'payment_link_v1 auto-sent ONLY to vendor-entered number (+2348099991234)'
      );

      const bodyComp = firstWaPayload?.template?.components?.find((c) => c.type === 'body') as any;
      const btnQr0 = firstWaPayload?.template?.components?.find(
        (c) => c.type === 'button' && c.sub_type === 'quick_reply' && c.index === '0'
      ) as any;
      const btnQr1 = firstWaPayload?.template?.components?.find(
        (c) => c.type === 'button' && c.sub_type === 'quick_reply' && c.index === '1'
      ) as any;
      const btnUrlComp = firstWaPayload?.template?.components?.find(
        (c) => c.type === 'button' && c.sub_type === 'url'
      ) as any;
      assert(
        bodyComp?.parameters?.[0]?.text === rcVendorHandle &&
          bodyComp?.parameters?.[1]?.text === 'TEST - RC Staging Camera Lens' &&
          bodyComp?.parameters?.[2]?.text === '43,260' &&
          btnQr0?.parameters?.[0]?.payload === `CONFIRM_ORDER:${liveTxId}` &&
          btnQr1?.parameters?.[0]?.payload === `NOT_ME_ORDER:${liveTxId}` &&
          btnUrlComp?.parameters?.[0]?.text === liveTxId &&
          WHATSAPP_TEMPLATES.payment_link_v1.footerText === 'Secured by Relyvora Escrow',
        'payment_link_v1 matches live template (vendor, item, 43,260 no ₦, Continue/Not my order payloads, footer, URL button)'
      );

      // Verify release_code_hash is strictly null AND virtual_account_number is redacted before confirmation
      const { data: preFundRow } = await supabase
        .from('transactions')
        .select('release_code_hash, status, virtual_account_number')
        .eq('id', liveTxId)
        .single();
      const liveAccountNum = preFundRow?.virtual_account_number as string;
      assert(
        preFundRow?.status === 'AWAITING_PAYMENT' && preFundRow?.release_code_hash === null && Boolean(liveAccountNum),
        'Pre-payment staging DB row has status=AWAITING_PAYMENT, release_code_hash=null, and provisioned FBO NUBAN'
      );
      assert(
        createJson.transaction.virtual_account_number === null &&
          createJson.transaction.virtual_bank_name === null,
        'create-link response redacts virtual account details before WhatsApp number verification'
      );

      const preVerifyGet = await getEscrowById(
        new NextRequest(`http://localhost:3000/api/escrow/${liveTxId}`),
        { params: Promise.resolve({ id: liveTxId }) }
      );
      const preVerifyJson = await preVerifyGet.json();
      const preVerifyList = await listEscrowGet(
        new NextRequest('http://localhost:3000/api/escrow/list?vendorHandle=@StagingTestVendor', {
          headers: { authorization: `Bearer ${rcVendorToken}` },
        })
      );
      const preVerifyListJson = await preVerifyList.json();
      const preVerifyListItem = (preVerifyListJson.transactions || []).find((t: any) => t.id === liveTxId);
      assert(
        preVerifyJson.transaction?.buyer_phone_verified === false &&
          preVerifyJson.transaction?.virtual_account_number === null &&
          preVerifyJson.transaction?.virtual_bank_name === null &&
          preVerifyListItem?.virtual_account_number === null,
        'Unverified numbers NEVER see virtual account details on GET /api/escrow/[id] or /list'
      );

      // Verify /api/webhooks/whatsapp signature rejection (401)
      const unsignedWh = await whatsappWebhookPost(
        new NextRequest('http://localhost:3000/api/webhooks/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
          body: JSON.stringify({ entry: [] }),
        })
      );
      assert(unsignedWh.status === 401, `WhatsApp webhook rejects invalid X-Hub-Signature-256 (HTTP ${unsignedWh.status})`);

      // Signed "Confirm this is me" webhook marks buyer_phone_verified=true and reveals NUBAN
      const confirmPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: `wamid.confirm_${Date.now()}`,
                      from: '2348099991234',
                      type: 'button',
                      button: { text: 'Continue', payload: `CONFIRM_ORDER:${liveTxId}` },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const rawConfirmBody = JSON.stringify(confirmPayload);
      const waSigConfirm =
        'sha256=' +
        crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET!).update(rawConfirmBody, 'utf8').digest('hex');

      const confirmWhRes = await whatsappWebhookPost(
        new NextRequest('http://localhost:3000/api/webhooks/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hub-signature-256': waSigConfirm },
          body: rawConfirmBody,
        })
      );
      const confirmWhJson = await confirmWhRes.json();
      // Test replay protection on same wamid
      const replayWhRes = await whatsappWebhookPost(
        new NextRequest('http://localhost:3000/api/webhooks/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hub-signature-256': waSigConfirm },
          body: rawConfirmBody,
        })
      );
      const replayWhJson = await replayWhRes.json();
      const { data: confirmBpv } = await supabase
        .from('buyer_phone_verifications')
        .select('verified, masked_phone, phone_hash')
        .eq('transaction_id', liveTxId)
        .maybeSingle();
      assert(
        confirmWhRes.status === 200 &&
          confirmWhJson.processed?.[0]?.action === 'PHONE_VERIFIED' &&
          replayWhJson.processed?.[0]?.duplicate === true &&
          confirmBpv?.verified === true &&
          confirmBpv?.masked_phone === '******1234' &&
          Boolean(confirmBpv?.phone_hash) &&
          !confirmBpv?.phone_hash?.includes('8099991234'),
        'Signed "Confirm this is me" marks phone verified, records hashed buyer_phone_verifications entry, and replay check blocks duplicate wamid'
      );

      // 3b. Simulate Signed Anchor Webhook Deposit -> issues release code on WhatsApp ONLY (0 buyer emails)
      const webhookEventId = `evt_rc_live_${Date.now()}`;
      createdEventIds.push(webhookEventId);
      const webhookPayload = {
        id: webhookEventId,
        event: 'transaction.credit',
        data: {
          id: webhookEventId,
          type: 'transaction.credit',
          attributes: {
            amount: liveTotalAmount * 100, // Kobo
            accountNumber: liveAccountNum,
            metadata: { transactionId: liveTxId },
            sender: {
              accountNumber: '0112233445',
              bankCode: '058',
              accountName: 'RC TEST BUYER',
            },
          },
        },
      };
      const rawWebhookBody = JSON.stringify(webhookPayload);
      const sig = crypto
        .createHmac('sha256', process.env.ANCHOR_WEBHOOK_SECRET!)
        .update(rawWebhookBody)
        .digest('hex');

      const whRes = await anchorWebhookPost(
        new NextRequest('http://localhost:3000/api/webhooks/anchor', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-anchor-signature': sig },
          body: rawWebhookBody,
        })
      );
      const whJson = await whRes.json();
      assert(whRes.status === 200 && whJson.status === 'FUNDS_LOCKED', 'Anchor webhook transitions tx to FUNDS_LOCKED');

      const releasePayload = capturedWaPayloads.find((p) => p.template.name === 'release_code_v1');
      const releaseBodyComp = releasePayload?.template.components.find((c) => c.type === 'body') as any;
      const releaseBtnComp = releasePayload?.template.components.find((c) => c.type === 'button') as any;
      const originalCode = String(releaseBodyComp?.parameters?.[0]?.text || '');
      const copyBtnCode = String(releaseBtnComp?.parameters?.[0]?.text || '');
      assert(
        /^\d{6}$/.test(originalCode) &&
          copyBtnCode === originalCode &&
          releasePayload?.to === '+2348099991234',
        'Anchor webhook delivered 6-digit release code via AUTHENTICATION WhatsApp template release_code_v1 (body + copy-code button)'
      );
      assert(
        !capturedEmails.some((e) => e.html.includes(originalCode)),
        'Zero Resend buyer receipt emails sent for release code (WhatsApp only)'
      );
      assert(
        !capturedLogs.some((l) => l.includes(originalCode)),
        `Server logs NEVER printed plaintext release code ${originalCode}`
      );
      const { data: outboundLogs } = await supabase
        .from('whatsapp_message_log')
        .select('masked_number, template_name, status')
        .eq('transaction_id', liveTxId);
      assert(
        Array.isArray(outboundLogs) &&
          outboundLogs.length > 0 &&
          outboundLogs.every(
            (log: any) =>
              !JSON.stringify(log).includes(originalCode) &&
              !JSON.stringify(log).includes('08099991234') &&
              log.masked_number === '******1234'
          ),
        'whatsapp_message_log contains masked number ******1234 and ZERO release codes or unmasked phone numbers'
      );

      // 3b-ii. Mint signed HttpOnly Buyer Session cookie via REAL POST /api/escrow/buyer-session
      const bsCountBefore = capturedWaPayloads.length;
      const bsReqRes = await buyerSessionPost(
        new NextRequest('http://localhost:3000/api/escrow/buyer-session', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.9' },
          body: JSON.stringify({ transactionId: liveTxId, action: 'request_code' }),
        })
      );
      const bsChallenge = extractSetCookiePair(bsReqRes, BUYER_OTP_CHALLENGE_COOKIE_NAME);
      const bsOtpPayload = capturedWaPayloads.slice(bsCountBefore).find((p) => p.template.name === 'verification_otp_v1');
      const bsOtp = String((bsOtpPayload?.template.components.find((c) => c.type === 'body') as any)?.parameters?.[0]?.text || '');
      const bsVerRes = await buyerSessionPost(
        new NextRequest('http://localhost:3000/api/escrow/buyer-session', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-vercel-forwarded-for': '198.51.100.9',
            cookie: bsChallenge.pair || '',
          },
          body: JSON.stringify({ transactionId: liveTxId, action: 'verify_code', code: bsOtp }),
        })
      );
      const bsCookie = extractSetCookiePair(bsVerRes, BUYER_SESSION_COOKIE_NAME);
      const rcBuyerCookie = bsCookie.pair || '';
      assert(
        bsReqRes.status === 200 && bsVerRes.status === 200 && Boolean(rcBuyerCookie),
        'Verified buyer mints signed HttpOnly Buyer Session cookie via POST /api/escrow/buyer-session'
      );

      // 3c. Verify GET APIs never expose plaintext code or hashes (and reveal NUBAN once verified)
      const getRes = await getEscrowById(
        new NextRequest(`http://localhost:3000/api/escrow/${liveTxId}`, {
          headers: { cookie: rcBuyerCookie },
        }),
        { params: Promise.resolve({ id: liveTxId }) }
      );
      const getJson = await getRes.json();
      assert(
        getJson.transaction?.release_code === null &&
          getJson.transaction?.release_code_hash === undefined &&
          getJson.transaction?.buyer_phone === undefined &&
          getJson.transaction?.buyer_email === undefined &&
          getJson.transaction?.buyer_phone_verified === true &&
          getJson.transaction?.virtual_account_number === liveAccountNum &&
          getJson.transaction?.buyer_phone_masked === '******1234',
        'Verified GET /api/escrow/[id] exposes NUBAN while redacting release_code, hashes & raw phone'
      );

      const listRes = await listEscrowGet(
        new NextRequest('http://localhost:3000/api/escrow/list?vendorHandle=@StagingTestVendor', {
          headers: { authorization: `Bearer ${rcVendorToken}` },
        })
      );
      const listJson = await listRes.json();
      const listedTx = (listJson.transactions || []).find((t: any) => t.id === liveTxId);
      assert(
        listedTx !== undefined &&
          listedTx.release_code === undefined &&
          listedTx.release_code_hash === undefined &&
          listedTx.buyer_phone === undefined,
        'GET /api/escrow/list never returns release_code, hash, or raw buyer_phone to vendor'
      );

      // 3d. Resend code OTP flow + invalidation of old code + rate limit (WhatsApp, Buyer Session authenticated)
      const waCountBeforeOtp = capturedWaPayloads.length;
      const sendOtpRes = await reissueCodePost(
        new NextRequest('http://localhost:3000/api/escrow/reissue-code', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.10', cookie: rcBuyerCookie },
          body: JSON.stringify({ transactionId: liveTxId, action: 'send_otp' }),
        })
      );
      const sendOtpJson = await sendOtpRes.json();
      assert(
        sendOtpRes.status === 200 && sendOtpJson.sandbox_otp === undefined,
        'send_otp returns 200 in live mode without exposing sandbox_otp'
      );
      const otpPayload = capturedWaPayloads.slice(waCountBeforeOtp).find((p) => p.template.name === 'verification_otp_v1');
      const otpBodyComp = otpPayload?.template.components.find((c) => c.type === 'body') as any;
      const otpCode = String(otpBodyComp?.parameters?.[0]?.text || '');
      assert(/^\d{6}$/.test(otpCode), 'send_otp dispatched 6-digit OTP via WhatsApp verification_otp_v1');
      assert(!capturedLogs.some((l) => l.includes(otpCode)), 'Server logs NEVER printed plaintext OTP');

      const waCountBeforeReissue = capturedWaPayloads.length;
      const verifyReissueRes = await reissueCodePost(
        new NextRequest('http://localhost:3000/api/escrow/reissue-code', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.10', cookie: rcBuyerCookie },
          body: JSON.stringify({ transactionId: liveTxId, action: 'verify_and_reissue', otp: otpCode }),
        })
      );
      const verifyReissueJson = await verifyReissueRes.json();
      assert(
        verifyReissueRes.status === 200 &&
          verifyReissueJson.success === true &&
          verifyReissueJson.sandbox_release_code === undefined,
        'verify_and_reissue succeeds without returning plaintext code in live mode'
      );
      const reissuedPayload = capturedWaPayloads[waCountBeforeReissue];
      const reissuedBodyComp = reissuedPayload?.template.components.find((c) => c.type === 'body') as any;
      const reissuedBtnComp = reissuedPayload?.template.components.find((c) => c.type === 'button') as any;
      const reissuedCode = String(reissuedBodyComp?.parameters?.[0]?.text || '');
      assert(
        /^\d{6}$/.test(reissuedCode) && String(reissuedBtnComp?.parameters?.[0]?.text || '') === reissuedCode,
        'Reissue dispatched new 6-digit release code via AUTHENTICATION WhatsApp template release_code_v1'
      );

      // Verify old code no longer works
      const oldHmac = computeReleaseCodeHmac(liveTxId, originalCode);
      const { data: oldCodeRpc } = await supabase.rpc('rpc_verify_and_prepare_release', {
        p_transaction_id: liveTxId,
        p_hmac_hash: oldHmac,
        p_max_attempts: 5,
      });
      assert(
        oldCodeRpc?.success === false,
        `Old release code fails rpc_verify_and_prepare_release after reissue`
      );

      // Rate limit check on reissue-code (tx received 1 OTP above; 2 more allowed, 4th -> 429)
      let hit429 = false;
      for (let i = 0; i < 3; i++) {
        const rlRes = await reissueCodePost(
          new NextRequest('http://localhost:3000/api/escrow/reissue-code', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-vercel-forwarded-for': `198.51.100.${20 + i}`,
              cookie: rcBuyerCookie,
            },
            body: JSON.stringify({ transactionId: liveTxId, action: 'send_otp' }),
          })
        );
        if (rlRes.status === 429) hit429 = true;
      }
      assert(hit429, 'reissue-code enforces rate limiting (HTTP 429 after 3 OTP requests)');

      // Verify order/[id] UI live-mode rules
      const orderPageSrc = fs.readFileSync('app/(app)/order/[id]/page.tsx', 'utf8');
      assert(
        orderPageSrc.includes('Your release code was sent to {transaction.buyer_phone_masked') &&
          orderPageSrc.includes('Give the code to the dispatch rider only after you have opened the package and checked the items.') &&
          orderPageSrc.includes('Resend code'),
        '/order/[id] displays masked phone, inspection rule, and Resend code OTP flow'
      );

      // =========================================================================
      // 9a. CONCURRENT RELEASE TEST ON STAGING (USING REISSUED CODE)
      // =========================================================================
      console.log('\n--- 9a. CONCURRENT RELEASE RACE CONDITION TEST ON STAGING ---');
      const newHmac = computeReleaseCodeHmac(liveTxId, reissuedCode);
      const [race1, race2] = await Promise.all([
        supabase.rpc('rpc_verify_and_prepare_release', {
          p_transaction_id: liveTxId,
          p_hmac_hash: newHmac,
          p_max_attempts: 5,
        }),
        supabase.rpc('rpc_verify_and_prepare_release', {
          p_transaction_id: liveTxId,
          p_hmac_hash: newHmac,
          p_max_attempts: 5,
        }),
      ]);
      const raceWins = [race1.data?.success, race2.data?.success].filter(Boolean).length;
      assert(
        raceWins === 1,
        `Concurrent release calls allow exactly 1 winner and block the second (wins=${raceWins})`
      );
    } finally {
      console.log = realConsoleLog;
      globalThis.fetch = realFetch;
      clearWhatsappRetryMemoryCacheForTests();
      if (origPaymentsMode === undefined) delete process.env.PAYMENTS_MODE;
      else process.env.PAYMENTS_MODE = origPaymentsMode;
      if (origWebhookSecret === undefined) delete process.env.ANCHOR_WEBHOOK_SECRET;
      else process.env.ANCHOR_WEBHOOK_SECRET = origWebhookSecret;
      if (origPepper === undefined) delete process.env.RELEASE_CODE_PEPPER;
      else process.env.RELEASE_CODE_PEPPER = origPepper;
      if (origWaAppSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
      else process.env.WHATSAPP_APP_SECRET = origWaAppSecret;
      if (origWaVerifyToken === undefined) delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      else process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = origWaVerifyToken;
      if (origWaAllowedRecipients === undefined) delete process.env.WHATSAPP_ALLOWED_RECIPIENTS;
      else process.env.WHATSAPP_ALLOWED_RECIPIENTS = origWaAllowedRecipients;
      if (origResendKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = origResendKey;
    }

    // =========================================================================
    // 4. TYPOGRAPHY (ZERO font-mono / monospace, OUTFIT TABULAR-NUMS)
    // =========================================================================
    console.log('\n--- 4. TYPOGRAPHY AUDIT ---');
    const codeFiles = [
      ...getAllFilesRecursive('app'),
      ...getAllFilesRecursive('components'),
      ...getAllFilesRecursive('lib'),
    ];
    const monoViolations = codeFiles.filter((f) => {
      const content = fs.readFileSync(f, 'utf8');
      return /font-mono|monospace/i.test(content);
    });
    assert(
      monoViolations.length === 0,
      `Zero font-mono / monospace across app/, components/, lib/ (found: ${monoViolations.length})`
    );
    const orderSrc = fs.readFileSync('app/(app)/order/[id]/page.tsx', 'utf8');
    assert(
      orderSrc.includes('font-heading') && orderSrc.includes('tabular-nums'),
      'Release code digits styled with font-heading (Outfit) and tabular-nums'
    );

    // =========================================================================
    // 5. ANCHOR_BRAND_APPROVED GATE
    // =========================================================================
    console.log('\n--- 5. ANCHOR_BRAND_APPROVED FLAG & COMPONENT ---');
    const origAnchorBrand = process.env.ANCHOR_BRAND_APPROVED;
    const origPubAnchorBrand = process.env.NEXT_PUBLIC_ANCHOR_BRAND_APPROVED;
    try {
      delete process.env.ANCHOR_BRAND_APPROVED;
      delete process.env.NEXT_PUBLIC_ANCHOR_BRAND_APPROVED;
      assert(ANCHOR_BRAND_APPROVED_DEFAULT === false, 'ANCHOR_BRAND_APPROVED defaults to false');
      assert(isAnchorBrandApproved() === false, 'isAnchorBrandApproved() is false when env unset');
      process.env.ANCHOR_BRAND_APPROVED = 'true';
      assert(isAnchorBrandApproved() === true, 'isAnchorBrandApproved() is true when ANCHOR_BRAND_APPROVED=true');
    } finally {
      if (origAnchorBrand === undefined) delete process.env.ANCHOR_BRAND_APPROVED;
      else process.env.ANCHOR_BRAND_APPROVED = origAnchorBrand;
      if (origPubAnchorBrand === undefined) delete process.env.NEXT_PUBLIC_ANCHOR_BRAND_APPROVED;
      else process.env.NEXT_PUBLIC_ANCHOR_BRAND_APPROVED = origPubAnchorBrand;
    }
    const anchorCompSrc = fs.readFileSync('components/common/AnchorBrandText.tsx', 'utf8');
    assert(
      anchorCompSrc.includes('aria-hidden="true"') &&
        /blur-\[\d+px\]/.test(anchorCompSrc) &&
        fs.existsSync('docs/ANCHOR-BRAND-LOCATIONS.md'),
      'AnchorBrandText blurs + sets aria-hidden when unapproved and locations doc exists'
    );

    // =========================================================================
    // 6. NG LANDING PAGE COPY & NAVBAR
    // =========================================================================
    console.log('\n--- 6. NG LANDING PAGE COPY & NAVBAR ---');
    const ngSrc = fs.readFileSync('app/(app)/ng/page.tsx', 'utf8');
    const navSrc = fs.readFileSync('components/Navbar.tsx', 'utf8');
    assert(
      !/100% Escrow Protection|Instant Escrow Layer|100% Guaranteed/i.test(ngSrc) &&
        !/protocol/i.test(ngSrc),
      'app/(app)/ng/page.tsx omits banned claims and "protocol"'
    );
    assert(
      !navSrc.includes('KYC Verification') && navSrc.includes('!live &&'),
      'Navbar removes "KYC Verification" and gates Simulated badge on !live'
    );

    // =========================================================================
    // 7. FOUNDATION
    // =========================================================================
    console.log('\n--- 7. FOUNDATION CLAIMS ---');
    const foundationSrc = fs.readFileSync('app/foundation/page.tsx', 'utf8');
    const foundationClaimsSrc = fs.readFileSync('docs/FOUNDATION-CLAIMS.md', 'utf8');
    assert(
      !/non-profit/i.test(foundationSrc) && !/west africa/i.test(foundationSrc),
      'app/foundation/page.tsx contains zero "non-profit" or "West Africa"'
    );
    assert(
      foundationClaimsSrc.includes('non-profit') && foundationClaimsSrc.includes('West Africa'),
      'docs/FOUNDATION-CLAIMS.md documents removal of "non-profit" and "West Africa"'
    );

    // =========================================================================
    // 8. STAGING RLS & RPC ANON DENIAL + SERVICE ROLE PROOF
    // =========================================================================
    console.log('\n--- 8. STAGING RLS (8 TABLES) & RPC (6 FUNCTIONS) ANON DENIAL + SERVICE ROLE PROOF ---');
    const allTables = [
      'transactions',
      'vendors',
      'webhook_events',
      'transaction_ledger',
      'dispute_resolutions',
      'deposits',
      'system_settings',
      'admin_audit_log',
    ];
    for (const tbl of allTables) {
      const rGet = await callAnonPostgrest(supabaseUrl, anonKey, `/${tbl}?select=*&limit=1`, 'GET');
      const rPost = await callAnonPostgrest(supabaseUrl, anonKey, `/${tbl}`, 'POST', { id: crypto.randomUUID() });
      assert(rGet.denied && rPost.denied, `Anon denied GET & POST on public.${tbl}`);
    }

    const zeroUuid = '00000000-0000-0000-0000-000000000000';
    const allRpcs: Array<[string, Record<string, unknown>]> = [
      ['rpc_verify_and_prepare_release', { p_transaction_id: zeroUuid, p_hmac_hash: '00', p_max_attempts: 5 }],
      ['rpc_finalize_release_step', { p_transaction_id: zeroUuid, p_step: 'VENDOR_PAID', p_transfer_id: 'x', p_idempotency_key: 'k' }],
      ['rpc_process_webhook_deposit', { p_event_id: 'e', p_event_type: 'CREDIT', p_account_number: '0', p_amount_naira: 1, p_metadata_tx_id: zeroUuid, p_payload: {} }],
      ['rpc_admin_unlock_transaction', { p_transaction_id: zeroUuid, p_admin_email: 'x', p_reason: 'r' }],
      ['rpc_admin_prepare_dispute_resolution', { p_transaction_id: zeroUuid, p_scenario_number: 1, p_admin_email: 'x' }],
      ['rpc_admin_finalize_dispute_resolution', { p_transaction_id: zeroUuid, p_scenario_number: 1, p_scenario_name: 's', p_resolution_action: 'FULL_REFUND_BUYER', p_buyer_refund_amount: 0, p_vendor_payout_amount: 0, p_relyvora_fee: 0, p_anchor_refund_transfer_id: null, p_anchor_payout_transfer_id: null, p_admin_email: 'x', p_resolution_notes: 'n' }],
    ];
    for (const [fn, payload] of allRpcs) {
      const anonRes = await callAnonPostgrest(supabaseUrl, anonKey, `/rpc/${fn}`, 'POST', payload);
      assert(anonRes.denied, `Anon denied execution on ${fn} (HTTP ${anonRes.status})`);

      const svcRes = await supabase.rpc(fn, payload);
      // Service role proof: PostgREST does NOT return PGRST202 (function missing) or 42501 (permission denied)
      const fnExistsForService = !svcRes.error || (!svcRes.error.message.includes('Could not find') && svcRes.error.code !== '42501');
      assert(fnExistsForService, `Service role confirms ${fn} exists on staging`);
    }

    // =========================================================================
    // 9b. STAGING WEBHOOK REPLAY & DEPOSIT AFTER RELEASED / DISPUTED
    // =========================================================================
    console.log('\n--- 9b. STAGING WEBHOOK REPLAY & STATUS PRESERVATION ON RELEASED/DISPUTED ---');
    const replayEvtId = `evt_rc_replay_${Date.now()}`;
    createdEventIds.push(replayEvtId);
    const replay1 = await supabase.rpc('rpc_process_webhook_deposit', {
      p_event_id: replayEvtId,
      p_event_type: 'transaction.credit',
      p_account_number: '9999999999',
      p_amount_naira: 1000,
      p_metadata_tx_id: null,
      p_payload: { attributes: { sender: { accountNumber: '0001112223', bankCode: '058' } } },
    });
    const replay2 = await supabase.rpc('rpc_process_webhook_deposit', {
      p_event_id: replayEvtId,
      p_event_type: 'transaction.credit',
      p_account_number: '9999999999',
      p_amount_naira: 1000,
      p_metadata_tx_id: null,
      p_payload: { attributes: { sender: { accountNumber: '0001112223', bankCode: '058' } } },
    });
    assert(
      replay1.error === null && replay2.data?.replayed === true,
      `Duplicate webhook event returns replayed=true idempotently (replayed=${replay2.data?.replayed})`
    );

    for (const targetStatus of ['RELEASED', 'DISPUTED'] as const) {
      const testTxId = crypto.randomUUID();
      createdTxIds.push(testTxId);
      const accNum = `8800${Math.floor(100000 + Math.random() * 899999)}`;
      await supabase.from('transactions').insert({
        id: testTxId,
        item_name: `TEST - RC ${targetStatus} Status Preservation Check`,
        item_price: 10000,
        delivery_fee: 0,
        protection_fee: 500,
        total_amount: 10500,
        amount_paid: 10500,
        excess_amount: 0,
        vendor_handle: '@StagingTestVendor',
        status: targetStatus,
        payments_mode: 'sandbox',
        virtual_account_number: accNum,
      });

      const lateEvtId = `evt_rc_late_${targetStatus}_${Date.now()}`;
      createdEventIds.push(lateEvtId);
      const { data: rpcOut, error: rpcErr } = await supabase.rpc('rpc_process_webhook_deposit', {
        p_event_id: lateEvtId,
        p_event_type: 'transaction.credit',
        p_account_number: accNum,
        p_amount_naira: 2500,
        p_metadata_tx_id: testTxId,
        p_payload: { attributes: { sender: { accountNumber: '0123456789', bankCode: '058' } } },
      });

      const { data: afterRow } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', testTxId)
        .single();

      assert(
        afterRow?.status === targetStatus,
        `Deposit after ${targetStatus} preserves status='${targetStatus}' (rpcErr=${rpcErr?.code || 'none'}, lateOrExcess=${rpcOut?.late_or_excess || false})`
      );
    }

    // =========================================================================
    // 10. ADMIN AUTH, TEST ROUTES DISABLED IN PROD, FEE TABLE & STATE MACHINE
    // =========================================================================
    console.log('\n--- 10. ADMIN AUTH, TEST ROUTES IN PROD, FEE TABLE & STATE MACHINE ---');
    const origAdminIds = process.env.ADMIN_USER_IDS;
    const origMode = process.env.PAYMENTS_MODE;
    try {
      process.env.ADMIN_USER_IDS = 'adm_rc_001';
      process.env.PAYMENTS_MODE = 'live';

      const mockSupabaseAuth = (user: any) => ({
        auth: {
          getUser: async () => ({ data: { user }, error: null }),
          mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: user?.aal || 'aal2' } }) },
        },
      });

      const rUnconfirmed = await verifyAdminSession(
        new NextRequest('http://localhost/api/admin/disputes/list', { headers: { authorization: 'Bearer tok' } }),
        mockSupabaseAuth({ id: 'adm_rc_001', email: 'a@relyvora.com', email_confirmed_at: null, app_metadata: { role: 'admin', aal: 'aal2' }, aal: 'aal2' })
      );
      const rForged = await verifyAdminSession(
        new NextRequest('http://localhost/api/admin/disputes/list', { headers: { authorization: 'Bearer tok' } }),
        mockSupabaseAuth({ id: 'adm_rc_001', email: 'a@relyvora.com', email_confirmed_at: '2026-01-01', user_metadata: { role: 'admin' }, app_metadata: { role: 'vendor', aal: 'aal2' }, aal: 'aal2' })
      );
      const rAal1 = await verifyAdminSession(
        new NextRequest('http://localhost/api/admin/disputes/list', { headers: { authorization: 'Bearer tok' } }),
        mockSupabaseAuth({ id: 'adm_rc_001', email: 'a@relyvora.com', email_confirmed_at: '2026-01-01', app_metadata: { role: 'admin', aal: 'aal1' }, aal: 'aal1' })
      );
      const rValid = await verifyAdminSession(
        new NextRequest('http://localhost/api/admin/disputes/list', { headers: { authorization: 'Bearer tok' } }),
        mockSupabaseAuth({ id: 'adm_rc_001', email: 'a@relyvora.com', email_confirmed_at: '2026-01-01', app_metadata: { role: 'admin', aal: 'aal2' }, aal: 'aal2' })
      );
      assert(rUnconfirmed.statusCode === 403, 'Admin auth rejects unconfirmed email with 403');
      assert(rForged.statusCode === 403, 'Admin auth rejects forged user_metadata.role with 403');
      assert(rAal1.statusCode === 403, 'Admin auth rejects non-MFA aal1 session with 403');
      assert(rValid.authorized && rValid.statusCode === 200, 'Admin auth grants 200 for confirmed AAL2 allowlisted admin');

      const rNotEnrolled = await verifyAdminSession(
        new NextRequest('http://localhost/api/admin/disputes/list', { headers: { authorization: 'Bearer tok' } }),
        {
          auth: {
            getUser: async () => ({
              data: {
                user: {
                  id: 'adm_rc_001',
                  email: 'a@relyvora.com',
                  email_confirmed_at: '2026-01-01',
                  app_metadata: { role: 'admin', aal: 'aal1' },
                  factors: [],
                },
              },
              error: null,
            }),
          },
        }
      );
      const rFactorBypassBlocked = await verifyAdminSession(
        new NextRequest('http://localhost/api/admin/disputes/list', { headers: { authorization: 'Bearer tok' } }),
        {
          auth: {
            getUser: async () => ({
              data: {
                user: {
                  id: 'adm_rc_001',
                  email: 'a@relyvora.com',
                  email_confirmed_at: '2026-01-01',
                  app_metadata: { role: 'admin', aal: 'aal1' },
                  factors: [{ status: 'verified', factor_type: 'totp' }],
                },
              },
              error: null,
            }),
          },
        }
      );
      const rSetupPermitted = await verifyAdminIdentityForMfaSetup(
        new NextRequest('http://localhost/api/admin/security', { headers: { authorization: 'Bearer tok' } }),
        mockSupabaseAuth({ id: 'adm_rc_001', email: 'a@relyvora.com', email_confirmed_at: '2026-01-01', app_metadata: { role: 'admin', aal: 'aal1' }, aal: 'aal1' })
      );
      const rSetupForged = await verifyAdminIdentityForMfaSetup(
        new NextRequest('http://localhost/api/admin/security', { headers: { authorization: 'Bearer tok' } }),
        mockSupabaseAuth({ id: 'adm_rc_001', email: 'a@relyvora.com', email_confirmed_at: '2026-01-01', user_metadata: { role: 'admin' }, app_metadata: { role: 'vendor' }, aal: 'aal1' })
      );
      const secUnauthRes = await adminSecurityGet(new NextRequest('http://localhost/api/admin/security'));
      const secUnauthJson = await secUnauthRes.json();
      assert(
        rNotEnrolled.statusCode === 403 &&
          rNotEnrolled.code === 'MFA_NOT_ENROLLED' &&
          rNotEnrolled.enrollmentUrl === '/admin/security' &&
          rFactorBypassBlocked.statusCode === 403 &&
          rFactorBypassBlocked.code === 'MFA_AAL2_REQUIRED',
        'Admin auth refuses aal1 even with enrolled TOTP factor and distinguishes MFA_NOT_ENROLLED vs MFA_AAL2_REQUIRED'
      );
      assert(
        rSetupPermitted.authorized &&
          rSetupPermitted.statusCode === 200 &&
          rSetupPermitted.aal === 'aal1' &&
          rSetupForged.statusCode === 403 &&
          secUnauthRes.status === 401 &&
          secUnauthJson.enrollmentUrl === '/admin/security',
        'GET /api/admin/security & verifyAdminIdentityForMfaSetup permit allowlisted aal1 setup while blocking forged/unauth callers'
      );

      const adminSecPageSrc = fs.readFileSync('app/(app)/admin/security/page.tsx', 'utf8');
      const adminDisputesPageSrc = fs.readFileSync('app/(app)/admin/disputes/page.tsx', 'utf8');
      assert(
        adminSecPageSrc.includes('mfa.enroll') &&
          adminSecPageSrc.includes('challengeAndVerify') &&
          adminDisputesPageSrc.includes('/admin/security') &&
          adminDisputesPageSrc.includes('MFA_NOT_ENROLLED'),
        '/admin/security TOTP enrollment UI and /admin/disputes AAL2 gate are wired cleanly'
      );

      // Test routes disabled in live/prod mode & legacy duplicate onboard route removed
      const cpRes = await confirmPaymentPost(
        new NextRequest('http://localhost/api/escrow/confirm-payment', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': rcSuiteIp },
          body: JSON.stringify({ transactionId: zeroUuid }),
        })
      );
      assert(cpRes.status === 403, `POST /api/escrow/confirm-payment disabled in live mode (HTTP ${cpRes.status})`);

      // End-to-end invite-only Vendor Onboarding & Anchor KYC verification (/vendor/onboarding -> /api/vendor/onboarding)
      assert(
        !fs.existsSync('app/api/vendors/onboard/route.ts'),
        'Unused legacy app/api/vendors/onboard/route.ts is removed'
      );

      const flowSrc = fs.readFileSync('components/vendor/VendorOnboardingFlow.tsx', 'utf8');
      const onboardingPageSrc = fs.readFileSync('app/(app)/vendor/onboarding/page.tsx', 'utf8');
      assert(
        onboardingPageSrc.includes('VendorOnboardingFlow') &&
          flowSrc.includes("fetch('/api/vendor/onboarding'") &&
          flowSrc.includes('signInWithPassword') &&
          flowSrc.includes('Authorization: `Bearer ${accessToken}`'),
        '/vendor/onboarding renders VendorOnboardingFlow wired to authenticated POST /api/vendor/onboarding'
      );

      const validOnboardPayload = (email: string, storeName: string) => ({
        captchaToken: 'sandbox_rc_captcha_valid',
        acceptedTermsAndProhibitedItems: true,
        profile: {
          storeName,
          email,
          phoneNumber: '+2348000000001',
        },
        regulatoryKyc: {
          legalFirstName: 'TEST Staging',
          legalLastName: 'Vendor',
          dateOfBirth: '1990-05-15',
          gender: 'FEMALE',
          address: '10 Adeola Odeku Street, Victoria Island, Lagos',
          idType: 'BVN',
          idNumber: '22222222222',
          bankCode: '058',
          accountNumber: '0123456789',
        },
      });

      const realFetch10 = globalThis.fetch;
      const origAnchorSecret = process.env.ANCHOR_SECRET_KEY;
      const origTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
      const anchorCalls: Array<{ url: string; body: any; hasKey: boolean }> = [];

      // Look up or ephemerally create real auth.users row so vendors_user_id_fkey passes even with PAYMENTS_MODE='live'
      let stagingAuthUserId = '00000000-0000-0000-0000-000000000104';
      let ephemeralAuthUserId: string | null = null;
      const { data: usersList } = await supabase.auth.admin.listUsers({ perPage: 50 });
      const existingAuthUser = usersList?.users?.find(
        (u) => u.email?.toLowerCase() === 'staging-vendor@relyvora.com'
      );
      if (existingAuthUser?.id) {
        stagingAuthUserId = existingAuthUser.id;
      } else {
        const { data: createdAuth } = await supabase.auth.admin.createUser({
          email: 'staging-vendor@relyvora.com',
          password: `RcTemp_${Date.now()}!99`,
          email_confirm: true,
        });
        if (createdAuth?.user?.id) {
          stagingAuthUserId = createdAuth.user.id;
          ephemeralAuthUserId = createdAuth.user.id;
        }
      }
      await supabase
        .from('vendors')
        .update({ user_id: stagingAuthUserId })
        .eq('email', 'staging-vendor@relyvora.com');

      process.env.ANCHOR_SECRET_KEY = 'anc_test_secret_rc_10';
      process.env.TURNSTILE_SECRET_KEY = 'turnstile_test_secret_rc_10';

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (u.includes('graph.facebook.com/') && u.endsWith('/messages')) {
          return new Response(
            JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: `wamid.s10_${Date.now()}`, message_status: 'sent' }] }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (u.includes('challenges.cloudflare.com/turnstile')) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (u.includes('/auth/v1/user')) {
          const headersObj = new Headers(init?.headers || {});
          const auth = headersObj.get('authorization') || '';
          const tok = auth.replace(/^Bearer\s+/i, '').trim();
          const mockUsers: Record<string, any> = {
            tok_unconfirmed: {
              id: '00000000-0000-0000-0000-000000000101',
              email: 'staging-vendor@relyvora.com',
              email_confirmed_at: null,
            },
            tok_other_email: {
              id: '00000000-0000-0000-0000-000000000102',
              email: 'different@relyvora.com',
              email_confirmed_at: '2026-01-01T00:00:00Z',
            },
            tok_uninvited: {
              id: '00000000-0000-0000-0000-000000000103',
              email: 'uninvited-vendor@relyvora.com',
              email_confirmed_at: '2026-01-01T00:00:00Z',
            },
            tok_staging_vendor: {
              id: stagingAuthUserId,
              email: 'staging-vendor@relyvora.com',
              email_confirmed_at: '2026-01-01T00:00:00Z',
            },
          };
          const user = mockUsers[tok];
          if (!user) {
            return new Response(JSON.stringify({ message: 'Invalid JWT' }), { status: 401 });
          }
          return new Response(JSON.stringify(user), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (u.includes('getanchor.co')) {
          const parsedBody = init?.body ? JSON.parse(String(init.body)) : null;
          const headersObj = new Headers(init?.headers || {});
          anchorCalls.push({ url: u, body: parsedBody, hasKey: Boolean(headersObj.get('x-anchor-key')) });

          if (u.endsWith('/customers')) {
            return new Response(JSON.stringify({ data: { id: 'anc_ind_cst_rc_test', type: 'IndividualCustomer' } }), {
              status: 201,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (u.includes('/verification/individual')) {
            return new Response(JSON.stringify({ data: { id: 'kyc_rc_verified', status: 'VERIFIED' } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (u.endsWith('/accounts')) {
            return new Response(
              JSON.stringify({ data: { id: 'anc_acc_rc_test', type: 'DepositAccount', attributes: {} } }),
              { status: 201, headers: { 'content-type': 'application/json' } }
            );
          }
          if (u.endsWith('/counterparties')) {
            return new Response(
              JSON.stringify({
                data: {
                  id: 'anc_cp_rc_test',
                  type: 'CounterParty',
                  attributes: { accountName: 'TEST Staging Vendor' },
                },
              }),
              {
                status: 201,
                headers: { 'content-type': 'application/json' },
              }
            );
          }
        }

        return realFetch10(input as any, init);
      };

      try {
        // Unauthenticated caller -> 401
        const resUnauth = await vendorOnboardingPost(
          new NextRequest('http://localhost/api/vendor/onboarding', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '10.10.1.1' },
            body: JSON.stringify(validOnboardPayload('staging-vendor@relyvora.com', '@StagingTestVendor')),
          })
        );
        // Unconfirmed email -> 403
        const resUnconfirmed = await vendorOnboardingPost(
          new NextRequest('http://localhost/api/vendor/onboarding', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: 'Bearer tok_unconfirmed',
              'x-vercel-forwarded-for': '10.10.1.2',
            },
            body: JSON.stringify(validOnboardPayload('staging-vendor@relyvora.com', '@StagingTestVendor')),
          })
        );
        // Missing/invalid KYC payload (when authenticated) -> 400
        const resBadBody = await vendorOnboardingPost(
          new NextRequest('http://localhost/api/vendor/onboarding', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: 'Bearer tok_staging_vendor',
              'x-vercel-forwarded-for': '10.10.1.3',
            },
            body: JSON.stringify({}),
          })
        );
        // Email mismatch -> 403
        const resMismatch = await vendorOnboardingPost(
          new NextRequest('http://localhost/api/vendor/onboarding', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: 'Bearer tok_other_email',
              'x-vercel-forwarded-for': '10.10.1.4',
            },
            body: JSON.stringify(validOnboardPayload('staging-vendor@relyvora.com', '@StagingTestVendor')),
          })
        );
        // Enable instant invite-only switch temporarily to test VENDOR_NOT_ALLOWLISTED block
        await supabase.from('system_settings').upsert(
          { key: 'vendor_allowlist_mode', value: true, updated_by: 'test_release_candidate', updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        clearSafetySettingsCache();

        // Authenticated user NOT on invite allowlist -> 403 VENDOR_NOT_ALLOWLISTED (0 Anchor calls)
        const resUninvited = await vendorOnboardingPost(
          new NextRequest('http://localhost/api/vendor/onboarding', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: 'Bearer tok_uninvited',
              'x-vercel-forwarded-for': '10.10.1.5',
            },
            body: JSON.stringify(validOnboardPayload('uninvited-vendor@relyvora.com', '@UninvitedShop')),
          })
        );
        const jsonUninvited = await resUninvited.json();

        assert(
          resUnauth.status === 401 &&
            resUnconfirmed.status === 403 &&
            resBadBody.status === 400 &&
            resMismatch.status === 403 &&
            resUninvited.status === 403 &&
            jsonUninvited.code === 'VENDOR_NOT_ALLOWLISTED' &&
            anchorCalls.length === 0,
          'Vendor onboarding enforces auth (401), email confirmation/match (403), validation (400), and invite-only allowlist (403) before Anchor calls'
        );

        // Restore open-signup default before completing onboarding flow
        await supabase.from('system_settings').upsert(
          { key: 'vendor_allowlist_mode', value: false, updated_by: 'test_release_candidate', updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        clearSafetySettingsCache();

        // Authenticated allowlisted vendor -> full end-to-end Anchor customer + KYC + account + counterparty + DB metadata
        const resAllowed = await vendorOnboardingPost(
          new NextRequest('http://localhost/api/vendor/onboarding', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: 'Bearer tok_staging_vendor',
              'x-vercel-forwarded-for': '10.10.1.6',
            },
            body: JSON.stringify(validOnboardPayload('staging-vendor@relyvora.com', '@StagingTestVendor')),
          })
        );
        const jsonAllowed = await resAllowed.json();
        const rawResponseStr = JSON.stringify(jsonAllowed);

        const kycCall = anchorCalls.find((c) => c.url.includes('/verification/individual'));
        assert(
          resAllowed.status === 200 &&
            jsonAllowed.success === true &&
            jsonAllowed.data?.kycStatus === 'VERIFIED' &&
            jsonAllowed.data?.dbKycStatus === 'verified' &&
            jsonAllowed.data?.isAllowlisted === true &&
            jsonAllowed.data?.settlement?.maskedAccountNumber === '******6789',
          `Allowlisted authenticated vendor completes server-side Anchor onboarding & KYC (HTTP ${resAllowed.status})`
        );
        assert(
          anchorCalls.length >= 4 &&
            anchorCalls.every((c) => c.hasKey) &&
            kycCall?.body?.data?.attributes?.bvn === '22222222222' &&
            !rawResponseStr.includes('22222222222') &&
            !rawResponseStr.includes('0123456789') &&
            !rawResponseStr.includes('anc_ind_cst_rc_test') &&
            !rawResponseStr.includes('anc_acc_rc_test') &&
            !rawResponseStr.includes('anc_test_secret_rc_10'),
          'BVN goes directly to Anchor server-side; browser response hides BVN/NIN, secrets, raw NUBAN, and internal Anchor IDs'
        );

        // Confirm Staging DB row has updated metadata and NO BVN/NIN or KYC PII columns stored
        const { data: stagingVendorRow } = await supabase
          .from('vendors')
          .select('*')
          .eq('email', 'staging-vendor@relyvora.com')
          .single();
        assert(
          stagingVendorRow?.kyc_status === 'verified' &&
            stagingVendorRow?.anchor_customer_id === 'anc_ind_cst_rc_test' &&
            stagingVendorRow?.anchor_deposit_account_id === 'anc_acc_rc_test' &&
            stagingVendorRow?.id_number == null &&
            stagingVendorRow?.date_of_birth == null &&
            stagingVendorRow?.business_address == null,
          'Staging DB persists operational vendor state only and never stores BVN/NIN or KYC PII'
        );

        // Rate limit check (6th request on same IP -> 429)
        await supabase.from('rate_limit_buckets').delete().ilike('key', '%10.10.1.99%');
        let rlStatus = 200;
        for (let i = 0; i < 6; i++) {
          const r = await vendorOnboardingPost(
            new NextRequest('http://localhost/api/vendor/onboarding', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '10.10.1.99' },
              body: JSON.stringify({}),
            })
          );
          rlStatus = r.status;
        }
        assert(rlStatus === 429, `POST /api/vendor/onboarding enforces IP rate limit (6th attempt -> HTTP ${rlStatus})`);
      } finally {
        globalThis.fetch = realFetch10;
        if (origAnchorSecret === undefined) delete process.env.ANCHOR_SECRET_KEY;
        else process.env.ANCHOR_SECRET_KEY = origAnchorSecret;
        if (origTurnstileSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
        else process.env.TURNSTILE_SECRET_KEY = origTurnstileSecret;
        await supabase.from('system_settings').upsert(
          { key: 'vendor_allowlist_mode', value: false, updated_by: 'test_release_candidate', updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        clearSafetySettingsCache();
        await supabase
          .from('vendors')
          .update({
            user_id: origStagingVendorUserId,
            anchor_customer_id: null,
            anchor_deposit_account_id: 'anc_staging_acc_001',
            kyc_status: 'verified',
            payout_account_verified: true,
            settlement_account_name_matched: true,
            settlement_name_match_score: 1.0,
            phone_verified: true,
            is_allowlisted: true,
          })
          .eq('email', 'staging-vendor@relyvora.com');
        if (ephemeralAuthUserId) {
          await supabase.auth.admin.deleteUser(ephemeralAuthUserId).catch(() => {});
        }
      }
    } finally {
      if (origAdminIds === undefined) delete process.env.ADMIN_USER_IDS;
      else process.env.ADMIN_USER_IDS = origAdminIds;
      if (origMode === undefined) delete process.env.PAYMENTS_MODE;
      else process.env.PAYMENTS_MODE = origMode;
    }

    // Fee table & phone mask check
    const fSmall = calculatePricing(5000, 0);
    const fLarge = calculatePricing(50000, 2000);
    const fMarketing = calculateFee(45000, 0);
    assert(
      fSmall.protectionFee === 500 &&
        fLarge.protectionFee === 1560 &&
        fMarketing.feeAmount === 1350 &&
        maskPhoneNumber('+2348099991234') === '******1234',
      'Fee table (₦500 floor, 3% standard, NGN rounding) & phone masking pass'
    );

    // =========================================================================
    // 11. WHATSAPP "NOT ME" BLOCKING, GLOBAL STOP, DAILY CAPS & EMAIL REMOVAL
    // =========================================================================
    console.log('\n--- 11. WHATSAPP "NOT ME", GLOBAL STOP, ABUSE CAPS & BUYER EMAIL REMOVAL ---');
    assert(!fs.existsSync('lib/emailReceipt.ts'), 'lib/emailReceipt.ts has been completely removed');
    const vendorPageSrc = fs.readFileSync('app/(app)/vendor/page.tsx', 'utf8');
    const faqSrc = fs.readFileSync('components/corporate/CorporateFAQ.tsx', 'utf8');
    assert(
      vendorPageSrc.includes('The buyer asked for this link and agrees to receive it on WhatsApp.') &&
        vendorPageSrc.includes('Copy link'),
      'Vendor form contains required WhatsApp consent checkbox and Copy link fallback'
    );
    assert(
      payPageSrc.includes('Confirm your WhatsApp number to continue') &&
        payPageSrc.includes('Re-send confirmation message') &&
        !payPageSrc.includes('buyerEmail'),
      '/pay/[id] shows WhatsApp verification prompt and zero buyerEmail inputs'
    );
    assert(
      !/email receipt/i.test(faqSrc) && !/email receipt/i.test(orderSrc),
      'CorporateFAQ and /order/[id] contain zero buyer email receipt mentions'
    );

    const srcDirsToScan = [
      ...getAllFilesRecursive('app'),
      ...getAllFilesRecursive('components'),
      ...getAllFilesRecursive('lib'),
      ...getAllFilesRecursive('tests'),
    ];
    const gmailOrBuyerEmailHits = srcDirsToScan.filter((f) => {
      if (f.replace(/\\/g, '/').endsWith('tests/release-candidate.test.ts')) return false;
      const content = fs.readFileSync(f, 'utf8');
      return /@gmail\.com|buyer_email|buyerEmail|sendReleaseCodeReceiptEmail/i.test(content);
    });
    assert(
      gmailOrBuyerEmailHits.length === 0,
      `Zero personal Gmail / buyer_email / buyerEmail / sendReleaseCodeReceiptEmail across codebase (hits: ${gmailOrBuyerEmailHits.length})`
    );

    const origMode11 = process.env.PAYMENTS_MODE;
    const origSec11 = process.env.WHATSAPP_APP_SECRET;
    const origPep11 = process.env.RELEASE_CODE_PEPPER;
    const origResend11 = process.env.RESEND_API_KEY;
    const fetch11 = globalThis.fetch;
    const waCalls11: MetaTemplatePayload[] = [];
    const alerts11: Array<{ title: string }> = [];

    process.env.PAYMENTS_MODE = 'sandbox';
    process.env.WHATSAPP_APP_SECRET = 'wa_sec11_test_32bytes_min';
    process.env.RELEASE_CODE_PEPPER = 'rc_test_pepper_32bytes_hex_staging';
    process.env.RESEND_API_KEY = 're_sec11_mock';
    const sec11PhoneHashes = [
      hashWhatsappPhone('+2348011112222'),
      hashWhatsappPhone('+2348033334444'),
      hashWhatsappPhone('+2348055556666'),
    ];
    await supabase.from('whatsapp_do_not_contact').delete().in('phone_hash', sec11PhoneHashes);
    await supabase.from('whatsapp_message_log').delete().in('recipient_phone_hash', sec11PhoneHashes);
    if (stagingVendorRow?.id) {
      await supabase.from('rate_limit_buckets').delete().ilike('key', `%create_link_v:${stagingVendorRow.id}%`);
    }
    clearWhatsappRetryMemoryCacheForTests();
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (u.includes('graph.facebook.com/') && u.endsWith('/messages')) {
        const parsedPayload = JSON.parse(String(init?.body || '{}')) as MetaTemplatePayload;
        waCalls11.push(parsedPayload);
        const msgId = `wamid.s11_${Date.now()}_${waCalls11.length}`;
        return new Response(
          JSON.stringify({
            messaging_product: 'whatsapp',
            messages: [{ id: msgId, message_status: 'sent' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (u.includes('/auth/v1/user')) {
        const headersObj = new Headers(init?.headers || {});
        const tok = (headersObj.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        if (tok === rcVendorToken) {
          return new Response(
            JSON.stringify({
              id: rcVendorUserId,
              email: rcVendorEmail,
              email_confirmed_at: '2026-01-01T00:00:00Z',
              app_metadata: { role: 'vendor' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
      }
      if (u.includes('api.resend.com')) {
        const parsed = JSON.parse(String(init?.body || '{}'));
        alerts11.push({ title: String(parsed.subject || '') });
        return new Response(JSON.stringify({ id: 'alert_11' }), { status: 200 });
      }
      return fetch11(input as any, init);
    };

    try {
      // 11a. "Not me" blocks order, hides NUBAN, adds number to DNC, fires ops alert
      const nmRes = await createLinkPost(
        new NextRequest('http://localhost:3000/api/escrow/create-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': rcSuiteIp, authorization: `Bearer ${rcVendorToken}` },
          body: JSON.stringify({
            itemName: 'TEST - RC Not-Me Test Item',
            itemPrice: 15000,
            vendorHandle: '@StagingTestVendor',
            buyerPhone: '+2348011112222',
            buyerWhatsappConsent: true,
          }),
        })
      );
      const nmJson = await nmRes.json();
      const nmTxId = nmJson.transaction.id as string;
      createdTxIds.push(nmTxId);

      const notMePayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: `wamid.notme_${Date.now()}`,
                      from: '2348011112222',
                      type: 'button',
                      button: { text: 'Not my order', payload: `NOT_ME_ORDER:${nmTxId}` },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const rawNotMe = JSON.stringify(notMePayload);
      const sigNotMe =
        'sha256=' +
        crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET!).update(rawNotMe, 'utf8').digest('hex');

      const notMeWhRes = await whatsappWebhookPost(
        new NextRequest('http://localhost:3000/api/webhooks/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hub-signature-256': sigNotMe },
          body: rawNotMe,
        })
      );
      const blockedGetRes = await getEscrowById(
        new NextRequest(`http://localhost:3000/api/escrow/${nmTxId}`),
        { params: Promise.resolve({ id: nmTxId }) }
      );
      const blockedGetJson = await blockedGetRes.json();
      const { data: nmBpv } = await supabase
        .from('buyer_phone_verifications')
        .select('verified')
        .eq('transaction_id', nmTxId)
        .maybeSingle();
      assert(
        notMeWhRes.status === 200 &&
          blockedGetJson.transaction?.whatsapp_blocked === true &&
          blockedGetJson.transaction?.virtual_account_number === null &&
          nmBpv?.verified !== true,
        '"Not me" Quick Reply marks order whatsapp_blocked=true, leaves phone unverified, and hides virtual account details'
      );

      // Re-sending or new order to DNC number must send 0 WhatsApp messages
      const waBeforeDncRetry = waCalls11.length;
      const resendBlockedRes = await resendWhatsappPost(
        new NextRequest(`http://localhost:3000/api/escrow/${nmTxId}/resend-whatsapp`, {
          method: 'POST',
          headers: { 'x-vercel-forwarded-for': rcSuiteIp },
        }),
        { params: Promise.resolve({ id: nmTxId }) }
      );
      const dncSecondOrderRes = await createLinkPost(
        new NextRequest('http://localhost:3000/api/escrow/create-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': rcSuiteIp, authorization: `Bearer ${rcVendorToken}` },
          body: JSON.stringify({
            itemName: 'TEST - RC Post-NotMe Order',
            itemPrice: 10000,
            vendorHandle: '@StagingTestVendor',
            buyerPhone: '+2348011112222',
            buyerWhatsappConsent: true,
          }),
        })
      );
      const dncSecondJson = await dncSecondOrderRes.json();
      if (dncSecondJson?.transaction?.id) createdTxIds.push(dncSecondJson.transaction.id);
      assert(
        resendBlockedRes.status === 403 &&
          dncSecondJson.whatsapp_delivery_status === 'failed' &&
          waCalls11.length === waBeforeDncRetry &&
          alerts11.length >= 1,
        '"Not me" adds number to DNC, blocks subsequent WhatsApp dispatches, and triggers ops alert'
      );

      // 11b. Global STOP opt-out
      const stopPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: `wamid.stop_${Date.now()}`,
                      from: '2348033334444',
                      type: 'text',
                      text: { body: 'STOP' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const rawStop = JSON.stringify(stopPayload);
      const sigStop =
        'sha256=' +
        crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET!).update(rawStop, 'utf8').digest('hex');

      await whatsappWebhookPost(
        new NextRequest('http://localhost:3000/api/webhooks/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hub-signature-256': sigStop },
          body: rawStop,
        })
      );
      const waBeforeStopOrder = waCalls11.length;
      const postStopOrder = await createLinkPost(
        new NextRequest('http://localhost:3000/api/escrow/create-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': rcSuiteIp, authorization: `Bearer ${rcVendorToken}` },
          body: JSON.stringify({
            itemName: 'TEST - RC Post-STOP Order',
            itemPrice: 9000,
            vendorHandle: '@StagingTestVendor',
            buyerPhone: '+2348033334444',
            buyerWhatsappConsent: true,
          }),
        })
      );
      const postStopJson = await postStopOrder.json();
      if (postStopJson?.transaction?.id) createdTxIds.push(postStopJson.transaction.id);
      assert(
        postStopJson.whatsapp_delivery_status === 'failed' && waCalls11.length === waBeforeStopOrder,
        'Global STOP reply adds number to DNC and prevents future WhatsApp messages'
      );

      // 11c. Per-number daily rate limit enforcement
      const { maxBuyerDaily } = await getWhatsappDailyLimits(supabase);
      const capPhone = '+2348055556666';
      for (let idx = 0; idx < maxBuyerDaily; idx++) {
        const capRes = await createLinkPost(
          new NextRequest('http://localhost:3000/api/escrow/create-link', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': rcSuiteIp, authorization: `Bearer ${rcVendorToken}` },
            body: JSON.stringify({
              itemName: `TEST - RC Cap Check ${idx + 1}`,
              itemPrice: 8000,
              vendorHandle: '@StagingTestVendor',
              buyerPhone: capPhone,
              buyerWhatsappConsent: true,
            }),
          })
        );
        const capJson = await capRes.json();
        if (capJson?.transaction?.id) createdTxIds.push(capJson.transaction.id);
      }
      const waBeforeCapExceed = waCalls11.length;
      const exceedRes = await createLinkPost(
        new NextRequest('http://localhost:3000/api/escrow/create-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': rcSuiteIp, authorization: `Bearer ${rcVendorToken}` },
          body: JSON.stringify({
            itemName: 'TEST - RC Cap Exceed Check',
            itemPrice: 8000,
            vendorHandle: '@StagingTestVendor',
            buyerPhone: capPhone,
            buyerWhatsappConsent: true,
          }),
        })
      );
      const exceedJson = await exceedRes.json();
      if (exceedJson?.transaction?.id) createdTxIds.push(exceedJson.transaction.id);
      assert(
        exceedJson.whatsapp_delivery_status === 'failed' && waCalls11.length === waBeforeCapExceed,
        `Daily per-number WhatsApp cap (${maxBuyerDaily}/day) blocks excess outbound messages`
      );
    } finally {
      globalThis.fetch = fetch11;
      clearWhatsappRetryMemoryCacheForTests();
      if (origMode11 === undefined) delete process.env.PAYMENTS_MODE;
      else process.env.PAYMENTS_MODE = origMode11;
      if (origSec11 === undefined) delete process.env.WHATSAPP_APP_SECRET;
      else process.env.WHATSAPP_APP_SECRET = origSec11;
      if (origPep11 === undefined) delete process.env.RELEASE_CODE_PEPPER;
      else process.env.RELEASE_CODE_PEPPER = origPep11;
      if (origResend11 === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = origResend11;
    }
  } finally {
    // Clean up temporary rows created on staging
    console.log('\n--- CLEANING UP TEMPORARY STAGING TEST ROWS ---');
    await supabase.from('rate_limit_buckets').delete().ilike('key', `%${rcSuiteIp}%`);
    await supabase.from('rate_limit_buckets').delete().ilike('key', `%${computeBuyerPhoneBindingHash('+2348099991234')}%`);
    await supabase.from('rate_limit_buckets').delete().ilike('key', '%198.51.100.%');
    await supabase.from('rate_limit_buckets').delete().ilike('key', '%10.10.1.%');
    if (stagingVendorRow?.id) {
      await supabase.from('rate_limit_buckets').delete().ilike('key', `%create_link_v:${stagingVendorRow.id}%`);
    }
    if (stagingVendorRow && !origStagingVendorUserId) {
      await supabase.from('vendors').update({ user_id: null }).eq('id', stagingVendorRow.id);
    }
    if (createdEventIds.length > 0) {
      await supabase.from('webhook_events').delete().in('event_id', createdEventIds);
      await supabase.from('deposits').delete().in('anchor_event_id', createdEventIds);
    }
    const testPhoneHashes = [
      hashWhatsappPhone('+2348011112222'),
      hashWhatsappPhone('+2348033334444'),
      hashWhatsappPhone('+2348055556666'),
      hashWhatsappPhone('+2348099991234'),
    ];
    await supabase.from('whatsapp_do_not_contact').delete().in('phone_hash', testPhoneHashes);
    await supabase.from('whatsapp_message_log').delete().in('recipient_phone_hash', testPhoneHashes);

    for (const txId of createdTxIds) {
      await supabase.from('whatsapp_message_log').delete().eq('transaction_id', txId);
      await supabase.from('buyer_phone_verifications').delete().eq('transaction_id', txId);
      await supabase.from('dispute_resolutions').delete().eq('transaction_id', txId);
      await supabase.from('admin_audit_log').delete().eq('target_id', txId);
      const { error: delErr } = await supabase.from('transactions').delete().eq('id', txId);
      if (delErr) {
        await supabase
          .from('transactions')
          .update({
            item_name: `TEST - Archived Ledger Test Order (${txId.slice(0, 8)})`,
            resolution_notes: 'TEST',
          })
          .eq('id', txId);
        console.log(
          `Notice: transaction ${txId} retained & labeled TEST because append-only ledger trigger prevents delete (${delErr.message}).`
        );
      }
    }

    if (ephemeralRcVendor?.id) {
      await supabase.from('rate_limit_buckets').delete().ilike('key', `%${ephemeralRcVendor.id}%`);
      await supabase.from('risk_flags').delete().eq('vendor_id', ephemeralRcVendor.id);
      await supabase.from('admin_audit_log').delete().eq('target_id', ephemeralRcVendor.id);
      const { error: vDelErr } = await supabase.from('vendors').delete().eq('id', ephemeralRcVendor.id);
      if (vDelErr) {
        await supabase
          .from('vendors')
          .update({
            user_id: null,
            store_name: `TEST - Archived RC Vendor (${ephemeralRcVendor.id.slice(0, 8)})`,
            is_suspended: true,
          })
          .eq('id', ephemeralRcVendor.id);
      }
    }
  }

  console.log('\n======================================================================');
  console.log(`RELEASE CANDIDATE SUMMARY: ${passed}/${passed + failed} CHECKS PASSED`);
  console.log('======================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runReleaseCandidateSuite().catch((err) => {
  console.error('Fatal RC test error:', err);
  process.exit(1);
});
