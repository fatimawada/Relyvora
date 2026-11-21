/**
 * Relyvora Verification & Hardening Attack Suite — Attacks (a) through (n)
 *
 * Targets Staging Supabase (`https://bepvqjqjybhhpsfbblqk.supabase.co`) exclusively.
 * Verifies Fail-Closed behavior, Buyer/Vendor/Admin Session boundaries, Webhook signatures & replays,
 * Evidence validation/ACL/TTL expiry, Concurrency locks, Header-spoofed rate limiting, and PostgREST RLS denial.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

import { assertStagingTarget } from '../scripts/seed-staging-vendor';
import { clearSafetySettingsCache } from '../lib/safetyLimits';
import { hashWhatsappPhone } from '../lib/whatsapp';
import { verifyPublicSignupCaptcha } from '../lib/captcha';
import { getClientIp, checkSharedRateLimit } from '../lib/rateLimit';
import { computeReleaseCodeHmac } from '../lib/releaseCode';
import {
  buildSyntheticSupabaseJwt,
  CapturedWhatsappDispatch,
  clearWhatsappRetryMemoryCacheForTests,
  CLOUDFLARE_TURNSTILE_DUMMY_TOKEN,
  CLOUDFLARE_TURNSTILE_TEST_SECRET_FAIL,
  CLOUDFLARE_TURNSTILE_TEST_SECRET_PASS,
  ensureTestSecrets,
  installTestTransportMocks,
  mintBuyerSessionCookieViaApi,
} from './helpers/stagingAuthHelper';

// Order / Escrow / Webhook Routes
import { POST as buyerSessionPost } from '../app/api/escrow/buyer-session/route';
import { POST as createLinkPost } from '../app/api/escrow/create-link/route';
import { GET as getOrderGet } from '../app/api/escrow/[id]/route';
import { GET as listEscrowGet } from '../app/api/escrow/list/route';
import { POST as dispatchPost } from '../app/api/escrow/dispatch/route';
import { POST as cancelPost } from '../app/api/escrow/cancel/route';
import { POST as confirmPaymentPost } from '../app/api/escrow/confirm-payment/route';
import { POST as releasePost } from '../app/api/escrow/release/route';
import { POST as disputeSendOtpPost } from '../app/api/escrow/dispute/send-otp/route';
import { POST as disputePost } from '../app/api/escrow/dispute/route';
import { POST as disputeRespondPost } from '../app/api/escrow/dispute/respond/route';
import { POST as evidenceUploadPost } from '../app/api/escrow/evidence/upload/route';
import { GET as evidenceSignedUrlGet } from '../app/api/escrow/evidence/signed-url/route';
import { POST as refundDestPost } from '../app/api/escrow/refund-destination/route';
import { POST as reissueCodePost } from '../app/api/escrow/reissue-code/route';
import { POST as anchorWebhookPost } from '../app/api/webhooks/anchor/route';
import { POST as whatsappWebhookPost } from '../app/api/webhooks/whatsapp/route';
import { POST as vendorOnboardingPost } from '../app/api/vendor/onboarding/route';

// Admin & Cron Routes
import { POST as adminActionsPost } from '../app/api/admin/actions/route';
import { GET as adminDisputesListGet } from '../app/api/admin/disputes/list/route';
import { POST as adminDisputesResolvePost } from '../app/api/admin/disputes/resolve/route';
import { POST as adminUnlockPost } from '../app/api/admin/escrow/unlock/route';
import { POST as adminIncidentSwitchPost } from '../app/api/admin/incident-switch/route';
import { GET as adminReconcileGet, POST as adminReconcilePost } from '../app/api/admin/reconciliation/route';
import { POST as adminRiskClearPost } from '../app/api/admin/risk-flags/clear/route';
import { GET as adminSecurityGet } from '../app/api/admin/security/route';
import { POST as adminVendorTierPost } from '../app/api/admin/vendors/tier/route';
import { GET as cronReconcileGet, POST as cronReconcilePost } from '../app/api/cron/reconcile/route';

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

function signAnchor(body: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function signMeta(body: string, secret: string) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

const VALID_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function runAttackSuite() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  assertStagingTarget(supabaseUrl, serviceKey);
  if (!anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required.');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  ensureTestSecrets();
  const origPaymentsMode = process.env.PAYMENTS_MODE;
  const origAllowedRecipients = process.env.WHATSAPP_ALLOWED_RECIPIENTS;
  const origAnchorSecret = process.env.ANCHOR_WEBHOOK_SECRET;
  const origWaSecret = process.env.WHATSAPP_APP_SECRET;
  const origCronSecret = process.env.CRON_SECRET;
  const origAdminIds = process.env.ADMIN_USER_IDS;
  const origTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;

  process.env.PAYMENTS_MODE = 'sandbox';
  delete process.env.WHATSAPP_ALLOWED_RECIPIENTS;
  clearWhatsappRetryMemoryCacheForTests();
  clearSafetySettingsCache();
  await supabase.from('rate_limit_buckets').delete().ilike('key', '%unverified-ip%');
  await supabase.from('rate_limit_buckets').delete().ilike('key', '%198.51.100.%');

  const runTag = Date.now().toString();
  const createdTxIds: string[] = [];
  const createdVendorIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdAuthUserIds: string[] = [];
  const createdRateLimitPrefixes: string[] = [];

  const vendorAEmail = `atk-vendor-a-${runTag}@relyvora.com`;
  const vendorBEmail = `atk-vendor-b-${runTag}@relyvora.com`;
  const realLoginPassword = `AtkSuite!${runTag}_Aa1`;

  const realUserARes = await supabase.auth.admin.createUser({
    email: vendorAEmail,
    password: realLoginPassword,
    email_confirm: true,
    app_metadata: { role: 'vendor' },
  });
  if (realUserARes.error || !realUserARes.data?.user?.id) {
    throw new Error(`Failed creating Staging auth user A: ${realUserARes.error?.message || 'unknown'}`);
  }
  const vendorAUserId = realUserARes.data.user.id;
  createdAuthUserIds.push(vendorAUserId);
  const vendorAToken = 'tok_atk_vendor_a';

  const realUserBRes = await supabase.auth.admin.createUser({
    email: vendorBEmail,
    password: realLoginPassword,
    email_confirm: true,
    app_metadata: { role: 'vendor' },
  });
  if (realUserBRes.error || !realUserBRes.data?.user?.id) {
    throw new Error(`Failed creating Staging auth user B: ${realUserBRes.error?.message || 'unknown'}`);
  }
  const vendorBUserId = realUserBRes.data.user.id;
  createdAuthUserIds.push(vendorBUserId);
  const vendorBToken = 'tok_atk_vendor_b';

  const buyerAPhone = `+234801${runTag.slice(-7)}`;
  const buyerBPhone = `+234802${runTag.slice(-7)}`;

  const capturedWa: CapturedWhatsappDispatch[] = [];
  const harness = installTestTransportMocks({
    usersByToken: new Map([
      [vendorAToken, { id: vendorAUserId, email: vendorAEmail, role: 'authenticated', emailConfirmed: true }],
      [vendorBToken, { id: vendorBUserId, email: vendorBEmail, role: 'authenticated', emailConfirmed: true }],
    ]),
    capturedWhatsapp: capturedWa,
  });

  try {
    console.log('\n======================================================================');
    console.log('RELYVORA SECURITY HARDENING ATTACK SUITE (ATTACKS a -> n)');
    console.log('======================================================================\n');

    // Create two isolated verified vendors on Staging
    const { data: vendorA, error: vAErr } = await supabase
      .from('vendors')
      .insert({
        user_id: vendorAUserId,
        store_name: `@AtkVendorA_${runTag.slice(-5)}`,
        email: vendorAEmail,
        phone_number: `+234809${runTag.slice(-7)}`,
        phone_hash: `hash_vA_${runTag}`,
        kyc_status: 'verified',
        payout_account_verified: true,
        settlement_account_name_matched: true,
        settlement_bank_code: '058',
        settlement_account_number: '0123456789',
        settlement_account_name: 'ATTACK VENDOR A',
        anchor_deposit_account_id: `anc_atk_a_${runTag}`,
        tier: 'ESTABLISHED',
        completed_orders_count: 10,
        successful_sales_count: 10,
        disputes_count: 0,
        first_order_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        is_allowlisted: true,
      })
      .select('*')
      .single();
    if (vAErr || !vendorA) throw new Error(`Failed seeding vendorA: ${vAErr?.message}`);
    createdVendorIds.push(vendorA.id);

    const { data: vendorB, error: vBErr } = await supabase
      .from('vendors')
      .insert({
        user_id: vendorBUserId,
        store_name: `@AtkVendorB_${runTag.slice(-5)}`,
        email: vendorBEmail,
        phone_number: `+234808${runTag.slice(-7)}`,
        phone_hash: `hash_vB_${runTag}`,
        kyc_status: 'verified',
        payout_account_verified: true,
        settlement_account_name_matched: true,
        settlement_bank_code: '058',
        settlement_account_number: '0987654321',
        settlement_account_name: 'ATTACK VENDOR B',
        anchor_deposit_account_id: `anc_atk_b_${runTag}`,
        tier: 'NEW',
        is_allowlisted: true,
      })
      .select('*')
      .single();
    if (vBErr || !vendorB) throw new Error(`Failed seeding vendorB: ${vBErr?.message}`);
    createdVendorIds.push(vendorB.id);

    // Helper: create & fund Order A (Vendor A, Buyer A) + Order B (Vendor B, Buyer B)
    async function createAndFundOrder(params: {
      vendorToken: string;
      buyerPhone: string;
      label: string;
      price: number;
    }) {
      const linkRes = await createLinkPost(
        new NextRequest('http://localhost/api/escrow/create-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${params.vendorToken}` },
          body: JSON.stringify({
            itemName: params.label,
            itemPrice: params.price,
            deliveryFee: 0,
            deliveryType: 'same_city',
            buyerPhone: params.buyerPhone,
            buyerWhatsappConsent: true,
          }),
        })
      );
      const linkJson = await linkRes.json();
      if (linkRes.status !== 201 || !linkJson?.transaction?.id) {
        throw new Error(`create-link failed for ${params.label}: ${linkJson?.error || linkRes.status}`);
      }
      const txId = linkJson.transaction.id as string;
      createdTxIds.push(txId);

      // Fund via confirm-payment
      const fundRes = await confirmPaymentPost(
        new NextRequest('http://localhost/api/escrow/confirm-payment', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ transactionId: txId }),
        })
      );
      const fundJson = await fundRes.json();
      if (fundRes.status !== 200) {
        throw new Error(`confirm-payment failed for ${params.label}: ${fundJson?.error}`);
      }

      // Mark buyer WhatsApp verified cleanly so buyer session can be minted
      await supabase
        .from('transactions')
        .update({ buyer_phone_verified: true, buyer_phone_verified_at: new Date().toISOString() })
        .eq('id', txId);

      const { sessionCookie, rawSetCookie } = await mintBuyerSessionCookieViaApi({
        transactionId: txId,
        capturedWhatsapp: capturedWa,
        ipAddress: '198.51.100.200',
      });

      return {
        txId,
        releaseCode: String(fundJson.sandbox_release_code),
        buyerCookie: sessionCookie,
        rawSetCookie,
      };
    }

    const orderA = await createAndFundOrder({
      vendorToken: vendorAToken,
      buyerPhone: buyerAPhone,
      label: `TEST Attack Order A ${runTag}`,
      price: 25000,
    });
    const orderB = await createAndFundOrder({
      vendorToken: vendorBToken,
      buyerPhone: buyerBPhone,
      label: `TEST Attack Order B ${runTag}`,
      price: 30000,
    });

    // Verify Buyer Session Cookie security attributes
    assert(
      Boolean(orderA.rawSetCookie) &&
        /HttpOnly/i.test(orderA.rawSetCookie || '') &&
        /SameSite=Lax/i.test(orderA.rawSetCookie || ''),
      'Buyer Session cookie is delivered strictly with HttpOnly + SameSite=Lax attributes'
    );

    // -------------------------------------------------------------------------
    // (a) Vendor with order link tries EVERY buyer action & buyer's private evidence
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (a): VENDOR TRIES BUYER ACTIONS & BUYER EVIDENCE ---');
    // Buyer A uploads private evidence first
    const buyerEvRes = await evidenceUploadPost(
      new NextRequest('http://localhost/api/escrow/evidence/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({
          transactionId: orderA.txId,
          evidenceCategory: 'DISPUTE_EVIDENCE',
          mimeType: 'image/png',
          filename: 'buyer-a-proof.png',
          fileBase64: VALID_PNG_B64,
        }),
      })
    );
    const buyerEvJson = await buyerEvRes.json();
    const buyerAFileId = buyerEvJson?.file?.id as string;

    // 1. Vendor A spoofed GET ?viewer=BUYER -> server ignores ?viewer=, returns authenticated_role=VENDOR & hides buyer's ownFiles
    const vendorSpoofGetRes = await getOrderGet(
      new NextRequest(`http://localhost/api/escrow/${orderA.txId}?viewer=BUYER`, {
        headers: { authorization: `Bearer ${vendorAToken}` },
      }),
      { params: Promise.resolve({ id: orderA.txId }) }
    );
    const vendorSpoofGetJson = await vendorSpoofGetRes.json();
    const vendorSeesBuyerFiles = (vendorSpoofGetJson?.transaction?.evidence_summary?.ownFiles || []).some(
      (f: any) => f.id === buyerAFileId || f.uploaded_by_role === 'BUYER'
    );

    // 2. Anonymous caller with just order link tries funded GET + buyer actions -> 401
    const anonGetFunded = await getOrderGet(
      new NextRequest(`http://localhost/api/escrow/${orderA.txId}?viewer=BUYER`),
      { params: Promise.resolve({ id: orderA.txId }) }
    );

    // 3. Vendor A tries buyer-only routes
    const vendorSignedBuyerFile = await evidenceSignedUrlGet(
      new NextRequest(
        `http://localhost/api/escrow/evidence/signed-url?transactionId=${orderA.txId}&fileId=${buyerAFileId}&viewerRole=BUYER`,
        { headers: { authorization: `Bearer ${vendorAToken}` } }
      )
    );
    const vendorRefundOtp = await refundDestPost(
      new NextRequest('http://localhost/api/escrow/refund-destination', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({ transactionId: orderA.txId, action: 'send_otp' }),
      })
    );
    const vendorReissue = await reissueCodePost(
      new NextRequest('http://localhost/api/escrow/reissue-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({ transactionId: orderA.txId, action: 'send_otp' }),
      })
    );
    const vendorDisputeOtp = await disputeSendOtpPost(
      new NextRequest('http://localhost/api/escrow/dispute/send-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({ transactionId: orderA.txId }),
      })
    );
    const vendorSpoofUpload = await evidenceUploadPost(
      new NextRequest('http://localhost/api/escrow/evidence/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorAToken}` },
        body: JSON.stringify({
          transactionId: orderA.txId,
          uploadedByRole: 'BUYER',
          evidenceCategory: 'DISPUTE_EVIDENCE',
          mimeType: 'image/png',
          filename: 'vendor-spoof.png',
          fileBase64: VALID_PNG_B64,
        }),
      })
    );
    const vendorSpoofUploadJson = await vendorSpoofUpload.json();

    assert(
      buyerEvRes.status === 201 &&
        Boolean(buyerAFileId) &&
        anonGetFunded.status === 401 &&
        vendorSpoofGetJson?.authenticated_role === 'VENDOR' &&
        !vendorSeesBuyerFiles &&
        vendorSignedBuyerFile.status === 403 &&
        vendorRefundOtp.status === 403 &&
        vendorReissue.status === 403 &&
        vendorDisputeOtp.status === 403 &&
        vendorSpoofUploadJson?.file?.uploaded_by_role === 'VENDOR',
      'Attack (a): Vendor / anonymous with order link cannot impersonate Buyer, read Buyer evidence, setup refund, resend code, or send dispute OTP'
    );

    // -------------------------------------------------------------------------
    // (b) Buyer of Order A tries Order B across EVERY route
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (b): BUYER A TRIES ORDER B ---');
    const bGet = await getOrderGet(
      new NextRequest(`http://localhost/api/escrow/${orderB.txId}`, { headers: { cookie: orderA.buyerCookie } }),
      { params: Promise.resolve({ id: orderB.txId }) }
    );
    const bDispOtp = await disputeSendOtpPost(
      new NextRequest('http://localhost/api/escrow/dispute/send-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({ transactionId: orderB.txId }),
      })
    );
    const bDisp = await disputePost(
      new NextRequest('http://localhost/api/escrow/dispute', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({ transactionId: orderB.txId, disputeReason: 'Hack order B', otp: '123456' }),
      })
    );
    const bUpload = await evidenceUploadPost(
      new NextRequest('http://localhost/api/escrow/evidence/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({
          transactionId: orderB.txId,
          mimeType: 'image/png',
          filename: 'x.png',
          fileBase64: VALID_PNG_B64,
        }),
      })
    );
    const bSigned = await evidenceSignedUrlGet(
      new NextRequest(`http://localhost/api/escrow/evidence/signed-url?transactionId=${orderB.txId}`, {
        headers: { cookie: orderA.buyerCookie },
      })
    );
    const bRefund = await refundDestPost(
      new NextRequest('http://localhost/api/escrow/refund-destination', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({ transactionId: orderB.txId, action: 'send_otp' }),
      })
    );
    const bReissue = await reissueCodePost(
      new NextRequest('http://localhost/api/escrow/reissue-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({ transactionId: orderB.txId, action: 'send_otp' }),
      })
    );
    const bRelease = await releasePost(
      new NextRequest('http://localhost/api/escrow/release', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({ transactionId: orderB.txId, releaseCode: orderB.releaseCode }),
      })
    );

    assert(
      [bGet, bDispOtp, bDisp, bUpload, bSigned, bRefund, bReissue, bRelease].every((r) => r.status === 403),
      'Attack (b): Buyer session bound to Order A is rejected (403) across ALL Order B endpoints'
    );

    // -------------------------------------------------------------------------
    // (c) Anonymous calls to EVERY /api/admin route and EVERY /api/cron route
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (c): ANONYMOUS ADMIN & UNPROTECTED CRON ---');
    const adminResults = await Promise.all([
      adminActionsPost(new NextRequest('http://localhost/api/admin/actions', { method: 'POST', body: '{}' })),
      adminDisputesListGet(new NextRequest('http://localhost/api/admin/disputes/list')),
      adminDisputesResolvePost(new NextRequest('http://localhost/api/admin/disputes/resolve', { method: 'POST', body: '{}' })),
      adminUnlockPost(new NextRequest('http://localhost/api/admin/escrow/unlock', { method: 'POST', body: '{}' })),
      adminIncidentSwitchPost(new NextRequest('http://localhost/api/admin/incident-switch', { method: 'POST', body: '{}' })),
      adminReconcileGet(new NextRequest('http://localhost/api/admin/reconciliation')),
      adminReconcilePost(new NextRequest('http://localhost/api/admin/reconciliation', { method: 'POST', body: '{}' })),
      adminRiskClearPost(new NextRequest('http://localhost/api/admin/risk-flags/clear', { method: 'POST', body: '{}' })),
      adminSecurityGet(new NextRequest('http://localhost/api/admin/security')),
      adminVendorTierPost(new NextRequest('http://localhost/api/admin/vendors/tier', { method: 'POST', body: '{}' })),
    ]);

    delete process.env.CRON_SECRET;
    const cronNoEnvGet = await cronReconcileGet(new NextRequest('http://localhost/api/cron/reconcile'));
    const cronNoEnvPost = await cronReconcilePost(new NextRequest('http://localhost/api/cron/reconcile', { method: 'POST' }));
    process.env.CRON_SECRET = origCronSecret || 'test_staging_cron_secret_v1';
    const cronNoAuthGet = await cronReconcileGet(new NextRequest('http://localhost/api/cron/reconcile'));
    const cronWrongAuthPost = await cronReconcilePost(
      new NextRequest('http://localhost/api/cron/reconcile', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong_secret' },
      })
    );

    assert(
      adminResults.every((r) => r.status === 401 || r.status === 403) &&
        cronNoEnvGet.status === 500 &&
        cronNoEnvPost.status === 500 &&
        cronNoAuthGet.status === 401 &&
        cronWrongAuthPost.status === 401,
      'Attack (c): Anonymous /api/admin/* calls fail 401/403 and /api/cron/reconcile fails closed without valid CRON_SECRET'
    );

    // -------------------------------------------------------------------------
    // (d) Forged WhatsApp webhook & replayed valid WhatsApp webhook
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (d): FORGED & REPLAYED WHATSAPP WEBHOOK ---');
    const waEventId = `wamid.atk.d.${runTag}`;
    const waBody = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: waEventId,
                    from: buyerBPhone.replace(/^\+/, ''),
                    type: 'button',
                    button: { payload: `CONFIRM_ORDER:${orderB.txId}`, text: 'Continue' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const waNoSig = await whatsappWebhookPost(
      new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: waBody,
      })
    );
    const waBadSig = await whatsappWebhookPost(
      new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) },
        body: waBody,
      })
    );
    const waValidSig = signMeta(waBody, process.env.WHATSAPP_APP_SECRET!);
    const waFirst = await whatsappWebhookPost(
      new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': waValidSig },
        body: waBody,
      })
    );
    const waReplay = await whatsappWebhookPost(
      new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': waValidSig },
        body: waBody,
      })
    );
    const waReplayJson = await waReplay.json();
    createdEventIds.push(`msg:${waEventId}`);

    // Label-text-only button webhook without payload ID must be ignored (never act on button text)
    const waLabelOnlyEventId = `wamid.atk.label.${runTag}`;
    const waLabelOnlyBody = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: waLabelOnlyEventId,
                    from: buyerBPhone.replace(/^\+/, ''),
                    type: 'button',
                    button: { text: 'Not my order' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const waLabelOnlyRes = await whatsappWebhookPost(
      new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signMeta(waLabelOnlyBody, process.env.WHATSAPP_APP_SECRET!),
        },
        body: waLabelOnlyBody,
      })
    );
    const waLabelOnlyJson = await waLabelOnlyRes.json();
    createdEventIds.push(`msg:${waLabelOnlyEventId}`);

    assert(
      waNoSig.status === 401 &&
        waBadSig.status === 401 &&
        waFirst.status === 200 &&
        waReplay.status === 200 &&
        waReplayJson?.processed?.[0]?.duplicate === true &&
        waLabelOnlyRes.status === 200 &&
        waLabelOnlyJson?.processed?.[0]?.action === 'UNHANDLED',
      'Attack (d): Missing/bad Meta signature rejected (401); valid replayed wamid blocked as duplicate; label-text-only button ignored'
    );

    // -------------------------------------------------------------------------
    // (e) Forged Anchor webhook, duplicate event, and deposits after RELEASED/DISPUTED/EXPIRED/CANCELLED
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (e): FORGED ANCHOR WEBHOOK, DUPLICATE & TERMINAL DEPOSITS ---');
    const ancEventId = `evt_atk_dup_${runTag}`;
    createdEventIds.push(ancEventId);
    const ancPayload = JSON.stringify({
      id: ancEventId,
      event: 'transaction.credit',
      data: {
        id: ancEventId,
        type: 'transaction.credit',
        attributes: {
          amount: 100000,
          accountNumber: '9999999999',
          metadata: { transactionId: orderB.txId },
        },
      },
    });
    const ancNoSig = await anchorWebhookPost(
      new NextRequest('http://localhost/api/webhooks/anchor', { method: 'POST', body: ancPayload })
    );
    const ancBadSig = await anchorWebhookPost(
      new NextRequest('http://localhost/api/webhooks/anchor', {
        method: 'POST',
        headers: { 'x-anchor-signature': 'deadbeef' },
        body: ancPayload,
      })
    );

    const terminalStates: Array<{ status: string; expectedDepositStatus: string }> = [
      { status: 'RELEASED', expectedDepositStatus: 'LATE_DEPOSIT' },
      { status: 'DISPUTED', expectedDepositStatus: 'EXCESS_DEPOSIT' },
      { status: 'EXPIRED', expectedDepositStatus: 'LATE_AFTER_TERMINAL' },
      { status: 'CANCELLED', expectedDepositStatus: 'LATE_AFTER_TERMINAL' },
    ];
    let terminalPassed = true;
    for (const spec of terminalStates) {
      const termRes = await createLinkPost(
        new NextRequest('http://localhost/api/escrow/create-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorBToken}` },
          body: JSON.stringify({ itemName: `TEST Terminal ${spec.status}`, itemPrice: 12000, buyerPhone: buyerBPhone }),
        })
      );
      const termJson = await termRes.json();
      const termTxId = termJson.transaction.id as string;
      createdTxIds.push(termTxId);
      const vAcc = `88${crypto.randomInt(10000000, 99999999)}`;
      await supabase
        .from('transactions')
        .update({ status: spec.status, virtual_account_number: vAcc })
        .eq('id', termTxId);

      const depEvt = `evt_term_${spec.status}_${runTag}`;
      createdEventIds.push(depEvt);
      const depBody = JSON.stringify({
        id: depEvt,
        event: 'transaction.credit',
        data: {
          id: depEvt,
          type: 'transaction.credit',
          attributes: { amount: 1200000, accountNumber: vAcc, metadata: { transactionId: termTxId } },
        },
      });
      const depSig = signAnchor(depBody, process.env.ANCHOR_WEBHOOK_SECRET!);
      const firstDep = await anchorWebhookPost(
        new NextRequest('http://localhost/api/webhooks/anchor', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-anchor-signature': depSig },
          body: depBody,
        })
      );
      const firstDepJson = await firstDep.json();
      const replayDep = await anchorWebhookPost(
        new NextRequest('http://localhost/api/webhooks/anchor', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-anchor-signature': depSig },
          body: depBody,
        })
      );
      const replayDepJson = await replayDep.json();
      const { data: postRow } = await supabase.from('transactions').select('status').eq('id', termTxId).single();
      if (
        postRow?.status !== spec.status ||
        !firstDepJson.depositStatus ||
        !String(replayDepJson.message || '').includes('already processed')
      ) {
        terminalPassed = false;
      }
    }

    assert(
      ancNoSig.status === 401 && ancBadSig.status === 401 && terminalPassed,
      'Attack (e): Forged Anchor webhook rejected (401); duplicate events idempotent; deposits after RELEASED/DISPUTED/EXPIRED/CANCELLED preserve status'
    );

    // -------------------------------------------------------------------------
    // (f) Malicious evidence uploads: disguised .exe, wrong MIME, oversize, path-style filename
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (f): MALICIOUS EVIDENCE UPLOAD DEFENSE ---');
    const exeHeaderB64 = Buffer.from('MZ\x90\x00This is a PE executable disguised as png').toString('base64');
    const upDisguisedExe = await evidenceUploadPost(
      new NextRequest('http://localhost/api/escrow/evidence/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({
          transactionId: orderA.txId,
          mimeType: 'image/png',
          filename: 'invoice.png',
          fileBase64: exeHeaderB64,
        }),
      })
    );
    const upBadMime = await evidenceUploadPost(
      new NextRequest('http://localhost/api/escrow/evidence/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({
          transactionId: orderA.txId,
          mimeType: 'application/x-msdownload',
          filename: 'payload.bin',
          fileBase64: VALID_PNG_B64,
        }),
      })
    );
    const upPathName = await evidenceUploadPost(
      new NextRequest('http://localhost/api/escrow/evidence/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({
          transactionId: orderA.txId,
          mimeType: 'image/png',
          filename: '../../etc/passwd.png',
          fileBase64: VALID_PNG_B64,
        }),
      })
    );
    const hugePngB64 = Buffer.concat([
      Buffer.from(VALID_PNG_B64, 'base64'),
      Buffer.alloc(11 * 1024 * 1024, 0),
    ]).toString('base64');
    const upOversize = await evidenceUploadPost(
      new NextRequest('http://localhost/api/escrow/evidence/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: orderA.buyerCookie },
        body: JSON.stringify({
          transactionId: orderA.txId,
          mimeType: 'image/png',
          filename: 'huge.png',
          fileBase64: hugePngB64,
        }),
      })
    );

    assert(
      [upDisguisedExe, upBadMime, upPathName, upOversize].every((r) => r.status === 400),
      'Attack (f): Disguised MZ executable, invalid MIME, path traversal filename, and >10MB file all rejected (400)'
    );

    // -------------------------------------------------------------------------
    // (g) Signed URL cross-order denial & expiry enforcement on Storage URL
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (g): SIGNED URL CROSS-ORDER & EXPIRY CHECK ---');
    const crossOrderUrlAttempt = await evidenceSignedUrlGet(
      new NextRequest(`http://localhost/api/escrow/evidence/signed-url?transactionId=${orderB.txId}&fileId=${buyerAFileId}`, {
        headers: { cookie: orderB.buyerCookie },
      })
    );
    const ownSignedRes = await evidenceSignedUrlGet(
      new NextRequest(`http://localhost/api/escrow/evidence/signed-url?transactionId=${orderA.txId}&fileId=${buyerAFileId}`, {
        headers: { cookie: orderA.buyerCookie },
      })
    );
    const ownSignedJson = await ownSignedRes.json();

    // Create a 1-second signed URL against real Storage object and verify it returns 400/403 after expiration
    const { data: evRecord } = await supabase
      .from('order_evidence_files')
      .select('storage_bucket, storage_object_path')
      .eq('id', buyerAFileId)
      .single();
    let expiredStorageStatus = 0;
    if (evRecord) {
      const { data: shortSigned } = await supabase.storage
        .from(evRecord.storage_bucket || 'relyvora-evidence')
        .createSignedUrl(evRecord.storage_object_path, 1);
      if (shortSigned?.signedUrl) {
        await new Promise((r) => setTimeout(r, 2200));
        const expiredFetch = await fetch(shortSigned.signedUrl);
        expiredStorageStatus = expiredFetch.status;
      }
    }

    assert(
      crossOrderUrlAttempt.status === 404 &&
        ownSignedRes.status === 200 &&
        Boolean(ownSignedJson.signedUrl) &&
        typeof ownSignedJson.expiresInSeconds === 'number' &&
        ownSignedJson.expiresInSeconds > 0 &&
        ownSignedJson.expiresInSeconds <= 600 &&
        expiredStorageStatus >= 400,
      `Attack (g): Cross-order fileId denied (${crossOrderUrlAttempt.status}), valid signed URL uses ${ownSignedJson.expiresInSeconds}s TTL, and expired token rejected by Storage (${expiredStorageStatus})`
    );

    // -------------------------------------------------------------------------
    // (h) & (i) Client-supplied fee/amount/tier/status + Negative/Zero/NaN amounts
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (h) & (i): TAMPERED FEES/STATUS/TIER & NEGATIVE/ZERO/NON-NUMERIC AMOUNTS ---');
    // Dedicated clean Vendor C so Attack (e)'s 4 terminal orders do not trigger velocity/spike block
    const vendorCUserId = crypto.randomUUID();
    const vendorCEmail = `atk-vendor-c-${runTag}@relyvora.com`;
    const vendorCToken = 'tok_atk_vendor_c';
    harness.usersByToken.set(vendorCToken, {
      id: vendorCUserId,
      email: vendorCEmail,
      role: 'authenticated',
      emailConfirmed: true,
    });
    const { data: vendorC, error: vCErr } = await supabase
      .from('vendors')
      .insert({
        user_id: vendorCUserId,
        store_name: `@AtkVendorC_${runTag.slice(-5)}`,
        email: vendorCEmail,
        phone_number: `+234806${runTag.slice(-7)}`,
        phone_hash: `hash_vC_${runTag}`,
        kyc_status: 'verified',
        payout_account_verified: true,
        settlement_account_name_matched: true,
        settlement_bank_code: '058',
        settlement_account_number: '1122334455',
        settlement_account_name: 'ATTACK VENDOR C',
        anchor_deposit_account_id: `anc_atk_c_${runTag}`,
        tier: 'NEW',
        is_allowlisted: true,
      })
      .select('*')
      .single();
    if (vCErr || !vendorC) throw new Error(`Failed seeding vendorC: ${vCErr?.message}`);
    createdVendorIds.push(vendorC.id);

    const tamperRes = await createLinkPost(
      new NextRequest('http://localhost/api/escrow/create-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorCToken}` },
        body: JSON.stringify({
          itemName: 'TEST Tamper Attack Item',
          itemPrice: 50000,
          deliveryFee: 0,
          protectionFee: 0,
          totalAmount: 1,
          status: 'RELEASED',
          tier: 'TRUSTED',
          buyerPhone: `+234805${runTag.slice(-7)}`,
        }),
      })
    );
    const tamperJson = await tamperRes.json();
    if (tamperJson?.transaction?.id) createdTxIds.push(tamperJson.transaction.id);

    const badAmounts = await Promise.all(
      [
        { itemPrice: -100, deliveryFee: 0 },
        { itemPrice: 0, deliveryFee: 0 },
        { itemPrice: 'not-a-number', deliveryFee: 0 },
        { itemPrice: 10000, deliveryFee: -500 },
        { itemPrice: 10000, deliveryFee: 'free' },
      ].map((payload) =>
        createLinkPost(
          new NextRequest('http://localhost/api/escrow/create-link', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorCToken}` },
            body: JSON.stringify({ itemName: 'TEST Bad Amount', buyerPhone: buyerBPhone, ...payload }),
          })
        )
      )
    );

    assert(
      tamperRes.status === 201 &&
        Number(tamperJson.transaction?.protection_fee) === 1500 &&
        Number(tamperJson.transaction?.total_amount) === 51500 &&
        tamperJson.transaction?.status === 'AWAITING_PAYMENT' &&
        badAmounts.every((r) => r.status === 400),
      'Attacks (h) & (i): Server ignores tampered fees/status/tier (uses 3% = ₦1,500 fee) and rejects negative/zero/non-numeric amounts (400)'
    );

    // -------------------------------------------------------------------------
    // (j) Two concurrent releases & two concurrent dispute raises
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (j): CONCURRENT RELEASE & CONCURRENT DISPUTE RACES ---');
    // Reset Vendor A sales baseline and create clean ESTABLISHED order (0h cooling) for concurrent release
    const raceRelOrder = await createAndFundOrder({
      vendorToken: vendorAToken,
      buyerPhone: buyerAPhone,
      label: `TEST Concurrent Release ${runTag}`,
      price: 20000,
    });
    const [rel1, rel2] = await Promise.all([
      releasePost(
        new NextRequest('http://localhost/api/escrow/release', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorAToken}` },
          body: JSON.stringify({ transactionId: raceRelOrder.txId, releaseCode: raceRelOrder.releaseCode }),
        })
      ),
      releasePost(
        new NextRequest('http://localhost/api/escrow/release', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorAToken}` },
          body: JSON.stringify({ transactionId: raceRelOrder.txId, releaseCode: raceRelOrder.releaseCode }),
        })
      ),
    ]);
    const relStatuses = [rel1.status, rel2.status].sort((a, b) => a - b);

    // Concurrent dispute raises on a separate funded order
    const raceDispOrder = await createAndFundOrder({
      vendorToken: vendorAToken,
      buyerPhone: buyerAPhone,
      label: `TEST Concurrent Dispute ${runTag}`,
      price: 20000,
    });
    const dispOtpRace = await disputeSendOtpPost(
      new NextRequest('http://localhost/api/escrow/dispute/send-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: raceDispOrder.buyerCookie },
        body: JSON.stringify({ transactionId: raceDispOrder.txId }),
      })
    );
    const dispOtpRaceJson = await dispOtpRace.json();
    const [d1, d2] = await Promise.all([
      disputePost(
        new NextRequest('http://localhost/api/escrow/dispute', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.111', cookie: raceDispOrder.buyerCookie },
          body: JSON.stringify({ transactionId: raceDispOrder.txId, scenarioId: 2, disputeReason: 'Race 1', otp: dispOtpRaceJson.sandbox_otp }),
        })
      ),
      disputePost(
        new NextRequest('http://localhost/api/escrow/dispute', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.112', cookie: raceDispOrder.buyerCookie },
          body: JSON.stringify({ transactionId: raceDispOrder.txId, scenarioId: 2, disputeReason: 'Race 2', otp: dispOtpRaceJson.sandbox_otp }),
        })
      ),
    ]);
    const dispStatuses = [d1.status, d2.status].sort((a, b) => a - b);

    assert(
      relStatuses[0] === 200 && relStatuses[1] >= 400 && dispStatuses[0] === 200 && dispStatuses[1] >= 400,
      `Attack (j): Concurrent release (${relStatuses.join(',')}) and concurrent dispute (${dispStatuses.join(',')}) allow strictly one winner`
    );

    // -------------------------------------------------------------------------
    // (k) OTP / release code guessing & header-spoofing rate-limit bypass
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (k): BRUTE FORCE & X-FORWARDED-FOR SPOOF RATE-LIMIT BYPASS ---');
    const bruteOrder = await createAndFundOrder({
      vendorToken: vendorAToken,
      buyerPhone: buyerAPhone,
      label: `TEST Brute Force Order ${runTag}`,
      price: 15000,
    });
    // Try 5 wrong release codes rotating X-Forwarded-For / CF-Connecting-IP / X-Real-IP every attempt
    let lockedOut = false;
    for (let i = 1; i <= 5; i++) {
      const wrongCode = String(900000 + i);
      const r = await releasePost(
        new NextRequest('http://localhost/api/escrow/release', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': `203.0.113.${i}`,
            'cf-connecting-ip': `203.0.113.${i}`,
            'x-real-ip': `203.0.113.${i}`,
            authorization: `Bearer ${vendorAToken}`,
          },
          body: JSON.stringify({ transactionId: bruteOrder.txId, releaseCode: wrongCode }),
        })
      );
      const rj = await r.json();
      if (rj.isLocked || r.status === 423) lockedOut = true;
    }

    // Rotate IP headers on dispute/send-otp -> tx bucket (3 max) still blocks on 4th attempt!
    let headerBypassBlocked = false;
    for (let i = 1; i <= 5; i++) {
      const rlRes = await disputeSendOtpPost(
        new NextRequest('http://localhost/api/escrow/dispute/send-otp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': `192.0.2.${i}`,
            'cf-connecting-ip': `192.0.2.${i}`,
            cookie: bruteOrder.buyerCookie,
          },
          body: JSON.stringify({ transactionId: bruteOrder.txId }),
        })
      );
      if (rlRes.status === 429) {
        headerBypassBlocked = true;
        break;
      }
    }

    // Trusted IP test: spoofed x-forwarded-for / x-real-ip / cf-connecting-ip never changes IP or Postgres bucket
    const spoofIpValues = ['198.18.0.1', '198.18.0.2', '198.18.0.3'];
    const spoofDerivedIps = spoofIpValues.map((fakeIp) =>
      getClientIp(
        new NextRequest('http://localhost/api/escrow/release', {
          method: 'POST',
          headers: {
            'x-forwarded-for': fakeIp,
            'x-real-ip': fakeIp,
            'cf-connecting-ip': fakeIp,
          },
        })
      )
    );
    const trustedEdgeIps = spoofIpValues.map((fakeIp) =>
      getClientIp(
        new NextRequest('http://localhost/api/escrow/release', {
          method: 'POST',
          headers: {
            'x-vercel-forwarded-for': '198.51.100.200',
            'x-forwarded-for': fakeIp,
            'x-real-ip': fakeIp,
          },
        })
      )
    );
    const spoofBucketKey = `${spoofDerivedIps[0]}:spoof_bucket_test_${runTag}`;
    const bucketResults: boolean[] = [];
    for (const fakeIp of spoofIpValues) {
      const spoofReq = new NextRequest('http://localhost/api/escrow/release', {
        method: 'POST',
        headers: { 'x-forwarded-for': fakeIp, 'x-real-ip': fakeIp, 'cf-connecting-ip': fakeIp },
      });
      const derivedKey = `${getClientIp(spoofReq)}:spoof_bucket_test_${runTag}`;
      const rl = await checkSharedRateLimit(derivedKey, 2, 60_000, supabase);
      bucketResults.push(rl.allowed);
    }
    await supabase.from('rate_limit_buckets').delete().eq('key', spoofBucketKey);
    const trustedIpSameBucket =
      spoofDerivedIps.every((ip) => ip === 'unverified-ip') &&
      trustedEdgeIps.every((ip) => ip === '198.51.100.200') &&
      bucketResults[0] === true &&
      bucketResults[1] === true &&
      bucketResults[2] === false;

    assert(
      lockedOut && headerBypassBlocked && trustedIpSameBucket,
      'Attack (k): 5 wrong release codes lock escrow, spoofed X-Forwarded-For/X-Real-IP never changes getClientIp or Postgres bucket, and 3rd request hits 429'
    );

    // -------------------------------------------------------------------------
    // (l) Raising dispute AFTER release code was accepted (cooling hold + released)
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (l): DISPUTE AFTER CODE ACCEPTED ---');
    // Order B is Vendor B (tier=NEW -> 2h cooling window upon release code acceptance)
    const atkLIp = `198.51.100.${Math.floor(Math.random() * 140) + 30}`;
    const coolingAcceptRes = await releasePost(
      new NextRequest('http://localhost/api/escrow/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vercel-forwarded-for': atkLIp,
          authorization: `Bearer ${vendorBToken}`,
        },
        body: JSON.stringify({ transactionId: orderB.txId, releaseCode: orderB.releaseCode }),
      })
    );
    const dispAfterAcceptOtp = await disputeSendOtpPost(
      new NextRequest('http://localhost/api/escrow/dispute/send-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': atkLIp, cookie: orderB.buyerCookie },
        body: JSON.stringify({ transactionId: orderB.txId }),
      })
    );
    const dispAfterAcceptPost = await disputePost(
      new NextRequest('http://localhost/api/escrow/dispute', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': atkLIp, cookie: orderB.buyerCookie },
        body: JSON.stringify({ transactionId: orderB.txId, disputeReason: 'Post code accept', otp: '111111' }),
      })
    );
    const dispAfterReleasePost = await disputePost(
      new NextRequest('http://localhost/api/escrow/dispute', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': atkLIp, cookie: raceRelOrder.buyerCookie },
        body: JSON.stringify({ transactionId: raceRelOrder.txId, disputeReason: 'Post release', otp: '111111' }),
      })
    );

    assert(
      coolingAcceptRes.status === 202 &&
        dispAfterAcceptOtp.status === 400 &&
        dispAfterAcceptPost.status === 400 &&
        dispAfterReleasePost.status === 400,
      `Attack (l): HTTP dispute OTP (${dispAfterAcceptOtp.status}) & dispute submission (${dispAfterAcceptPost.status}, ${dispAfterReleasePost.status}) both rejected (400) once release code is accepted (${coolingAcceptRes.status})`
    );

    // -------------------------------------------------------------------------
    // (m) Vendor attempting to suspend or promote/change their own tier/KYC
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (m): VENDOR SELF-SUSPENSION / SELF-PROMOTION / KYC BYPASS ---');
    const selfTierRes = await adminVendorTierPost(
      new NextRequest('http://localhost/api/admin/vendors/tier', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorBToken}` },
        body: JSON.stringify({ vendorId: vendorB.id, tier: 'TRUSTED', capOverrideUnlimited: true, reason: 'Self promote' }),
      })
    );
    const selfSuspendRes = await adminActionsPost(
      new NextRequest('http://localhost/api/admin/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${vendorBToken}` },
        body: JSON.stringify({ action: 'suspend_vendor', vendorId: vendorA.id, reason: 'Attack rival' }),
      })
    );
    // Onboarding payload attempting to inject TRUSTED tier / kyc_status
    const onbToken = 'tok_atk_self_onboard';
    const onbUserId = crypto.randomUUID();
    const onbEmail = `atk-onb-${runTag}@relyvora.com`;
    harness.usersByToken.set(onbToken, {
      id: onbUserId,
      email: onbEmail,
      role: 'authenticated',
      emailConfirmed: true,
    });
    const selfOnboardRes = await vendorOnboardingPost(
      new NextRequest('http://localhost/api/vendor/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${onbToken}` },
        body: JSON.stringify({
          captchaToken: 'sandbox_open_captcha_verified',
          acceptedTermsAndProhibitedItems: true,
          tier: 'TRUSTED',
          capOverrideUnlimited: true,
          kycStatus: 'verified',
          profile: {
            storeName: `@AtkOnb${runTag.slice(-5)}`,
            email: onbEmail,
            phoneNumber: `+234807${runTag.slice(-7)}`,
          },
          regulatoryKyc: {
            legalFirstName: 'ATTACK',
            legalLastName: 'TESTER',
            dateOfBirth: '1992-01-01',
            gender: 'MALE',
            address: '10 Marina Road, Lagos',
            idType: 'BVN',
            idNumber: '22222222222',
            bankCode: '058',
            accountNumber: '0123456789',
            settlementAccountName: 'ATTACK TESTER',
          },
        }),
      })
    );
    const selfOnboardJson = await selfOnboardRes.json();
    if (selfOnboardJson?.data?.vendorId) createdVendorIds.push(selfOnboardJson.data.vendorId);

    assert(
      selfTierRes.status === 403 &&
        selfSuspendRes.status === 403 &&
        (selfOnboardJson?.data?.tier === undefined || selfOnboardJson?.data?.tier === 'NEW'),
      'Attack (m): Vendors cannot call admin tier/suspend endpoints (403) and cannot inject TRUSTED tier via onboarding'
    );

    // -------------------------------------------------------------------------
    // (n) Real-login cross-vendor & Staging PostgREST REST API across ALL 16 tables
    //     Uses live Cloudflare Turnstile test keys + real Staging Supabase Auth JWT (NO SKIPS)
    // -------------------------------------------------------------------------
    console.log('\n--- ATTACK (n): POSTGREST REST API ANON KEY & REAL-LOGIN CROSS-VENDOR JWT ---');

    // Restore real globalThis.fetch so Turnstile & Staging Supabase /auth/v1/user execute LIVE
    harness.restore();

    // Verify Cloudflare Turnstile test keys against live Cloudflare siteverify API
    process.env.TURNSTILE_SECRET_KEY = CLOUDFLARE_TURNSTILE_TEST_SECRET_PASS;
    const turnstilePass = await verifyPublicSignupCaptcha({ token: CLOUDFLARE_TURNSTILE_DUMMY_TOKEN });
    process.env.TURNSTILE_SECRET_KEY = CLOUDFLARE_TURNSTILE_TEST_SECRET_FAIL;
    const turnstileFail = await verifyPublicSignupCaptcha({ token: CLOUDFLARE_TURNSTILE_DUMMY_TOKEN });
    process.env.TURNSTILE_SECRET_KEY = CLOUDFLARE_TURNSTILE_TEST_SECRET_PASS;
    assert(
      turnstilePass.valid === true && turnstileFail.valid === false,
      'Cloudflare Turnstile test keys pass with 1x...AA + XXXX.DUMMY.TOKEN.XXXX and fail with 2x...AA live'
    );

    // Obtain a real signed Staging Supabase Auth JWT for Vendor A (no fetch mock)
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let realAuthMethod = 'password+turnstile_dummy';
    let realVendorAJwt: string | null = null;

    const pwAttempt = await anonClient.auth.signInWithPassword({
      email: vendorAEmail,
      password: realLoginPassword,
      options: { captchaToken: CLOUDFLARE_TURNSTILE_DUMMY_TOKEN },
    });
    if (pwAttempt.data?.session?.access_token) {
      realVendorAJwt = pwAttempt.data.session.access_token;
    } else {
      // Staging Supabase Auth uses live Turnstile secret; exchange admin magiclink OTP for real Staging user JWT
      const linkRes = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: vendorAEmail,
      });
      if (linkRes.error || !linkRes.data?.properties?.email_otp) {
        throw new Error(`Failed minting real Staging login OTP for Vendor A: ${linkRes.error?.message || 'missing email_otp'}`);
      }
      const otpRes = await anonClient.auth.verifyOtp({
        email: vendorAEmail,
        token: linkRes.data.properties.email_otp,
        type: 'magiclink',
      });
      if (otpRes.error || !otpRes.data?.session?.access_token) {
        throw new Error(`Failed verifying real Staging login OTP for Vendor A: ${otpRes.error?.message || 'missing session'}`);
      }
      realVendorAJwt = otpRes.data.session.access_token;
      realAuthMethod = 'real_staging_verifyOtp_jwt';
    }

    const restTables = [
      'vendors',
      'transactions',
      'deposits',
      'webhook_events',
      'transaction_ledger',
      'dispute_resolutions',
      'admin_audit_log',
      'system_settings',
      'buyer_phone_verifications',
      'whatsapp_do_not_contact',
      'whatsapp_message_log',
      'whatsapp_webhook_events',
      'market_waitlist',
      'risk_flags',
      'order_evidence_files',
      'rate_limit_buckets',
    ];

    const leakedAnon: string[] = [];
    const leakedAuthed: string[] = [];
    for (const tbl of restTables) {
      const rAnon = await fetch(`${supabaseUrl}/rest/v1/${tbl}?select=*&limit=5`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      const bAnon = await rAnon.text();
      if (rAnon.status < 400 && bAnon !== '[]') leakedAnon.push(`${tbl}(${rAnon.status}:${bAnon.slice(0, 60)})`);

      const rAuth = await fetch(`${supabaseUrl}/rest/v1/${tbl}?select=*&limit=5`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${realVendorAJwt}` },
      });
      const bAuth = await rAuth.text();
      if (rAuth.status < 400 && bAuth !== '[]') leakedAuthed.push(`${tbl}(${rAuth.status}:${bAuth.slice(0, 60)})`);
    }

    // Real logged-in Vendor A JWT calling GET /api/escrow/[orderB.txId] & /list -> real /auth/v1/user call!
    const vAGetOrderB = await getOrderGet(
      new NextRequest(`http://localhost/api/escrow/${orderB.txId}`, {
        headers: { authorization: `Bearer ${realVendorAJwt}` },
      }),
      { params: Promise.resolve({ id: orderB.txId }) }
    );
    const vAListRes = await listEscrowGet(
      new NextRequest(`http://localhost/api/escrow/list?vendorHandle=${encodeURIComponent(vendorB.store_name)}`, {
        headers: { authorization: `Bearer ${realVendorAJwt}` },
      })
    );
    const vAListJson = await vAListRes.json();
    const vASeesOrderB = (vAListJson?.transactions || []).some((t: any) => t.id === orderB.txId || t.vendor_id === vendorB.id);
    const vASeesOrderA = (vAListJson?.transactions || []).some((t: any) => t.id === orderA.txId);

    assert(
      leakedAnon.length === 0 &&
        leakedAuthed.length === 0 &&
        Boolean(realVendorAJwt) &&
        vAGetOrderB.status === 403 &&
        vAListRes.status === 200 &&
        !vASeesOrderB &&
        vASeesOrderA,
      `Attack (n): Staging REST API denies all ${restTables.length} tables for anon & real authenticated JWT (anonLeaks=${leakedAnon.length}, jwtLeaks=${leakedAuthed.length}), real-login Vendor A denied Order B (${vAGetOrderB.status}) & list isolated (${realAuthMethod})`
    );

    // Zero-bypass verification across runtime code paths (app/, lib/, components/, middleware.ts)
    const runtimeTargets: string[] = [];
    const walkRuntime = (entryPath: string) => {
      const full = path.resolve(process.cwd(), entryPath);
      if (!fs.existsSync(full)) return;
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        if (/\.(ts|tsx|js|jsx)$/.test(full)) runtimeTargets.push(full);
        return;
      }
      for (const item of fs.readdirSync(full, { withFileTypes: true })) {
        walkRuntime(path.join(entryPath, item.name));
      }
    };
    ['app', 'lib', 'components', 'middleware.ts'].forEach(walkRuntime);
    const forbiddenRuntimePatterns = [
      'setWhatsappTransportForTests',
      'resetWhatsappTestState',
      'tok_open_vendor_confirmed',
      'tok_t1_vendor',
      'tok_rc_staging_vendor',
      'x-admin-key',
      'ADMIN_SECRET_KEY',
      'ADMIN_API_KEY',
      'ANCHOR_SKIP_LIVE_ENQUIRY',
      'relyvora_sandbox_pepper',
      'assertTestRouteAccess',
      'x-forwarded-for',
      'cf-connecting-ip',
      'x-real-ip',
    ];
    const bypassHits: string[] = [];
    for (const filePath of runtimeTargets) {
      const src = fs.readFileSync(filePath, 'utf8');
      for (const pat of forbiddenRuntimePatterns) {
        if (src.includes(pat)) {
          bypassHits.push(`${path.relative(process.cwd(), filePath)}:${pat}`);
        }
      }
    }
    assert(
      bypassHits.length === 0,
      `Runtime code contains zero test/bypass hooks or spoofable IP headers (hits=${bypassHits.length}${bypassHits.length ? ': ' + bypassHits.join(', ') : ''})`
    );

    void createdRateLimitPrefixes;
    void buildSyntheticSupabaseJwt;
  } finally {
    harness.restore();

    if (origPaymentsMode === undefined) delete process.env.PAYMENTS_MODE;
    else process.env.PAYMENTS_MODE = origPaymentsMode;
    if (origAllowedRecipients === undefined) delete process.env.WHATSAPP_ALLOWED_RECIPIENTS;
    else process.env.WHATSAPP_ALLOWED_RECIPIENTS = origAllowedRecipients;
    if (origAnchorSecret === undefined) delete process.env.ANCHOR_WEBHOOK_SECRET;
    else process.env.ANCHOR_WEBHOOK_SECRET = origAnchorSecret;
    if (origWaSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = origWaSecret;
    if (origCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origCronSecret;
    if (origAdminIds === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = origAdminIds;
    if (origTurnstileSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = origTurnstileSecret;

    console.log('\n--- CLEANING UP ATTACK SUITE STAGING TEST DATA ---');
    await supabase.from('rate_limit_buckets').delete().ilike('key', '%unverified-ip%');
    await supabase.from('rate_limit_buckets').delete().ilike('key', '%198.51.100.%');
    for (const uid of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(uid).catch(() => {});
    }
    if (createdEventIds.length > 0) {
      await supabase.from('webhook_events').delete().in('event_id', createdEventIds);
      await supabase.from('deposits').delete().in('anchor_event_id', createdEventIds);
      await supabase.from('whatsapp_webhook_events').delete().in('event_key', createdEventIds);
    }
    const phoneHashes = [hashWhatsappPhone(buyerAPhone), hashWhatsappPhone(buyerBPhone)].filter(Boolean);
    if (phoneHashes.length > 0) {
      await supabase.from('whatsapp_do_not_contact').delete().in('phone_hash', phoneHashes);
      await supabase.from('whatsapp_message_log').delete().in('recipient_phone_hash', phoneHashes);
    }
    for (const txId of createdTxIds) {
      await supabase.from('order_evidence_files').delete().eq('transaction_id', txId);
      await supabase.from('risk_flags').delete().eq('transaction_id', txId);
      await supabase.from('buyer_phone_verifications').delete().eq('transaction_id', txId);
      await supabase.from('whatsapp_message_log').delete().eq('transaction_id', txId);
      await supabase.from('admin_audit_log').delete().eq('target_id', txId);
      const { error: delErr } = await supabase.from('transactions').delete().eq('id', txId);
      if (delErr) {
        await supabase.from('transactions').update({ item_name: `TEST - Archived Attack Tx (${txId.slice(0, 8)})` }).eq('id', txId);
      }
    }
    for (const vid of createdVendorIds) {
      await supabase.from('risk_flags').delete().eq('vendor_id', vid);
      await supabase.from('admin_audit_log').delete().eq('target_id', vid);
      const { error: vDelErr } = await supabase.from('vendors').delete().eq('id', vid);
      if (vDelErr) {
        await supabase.from('vendors').update({ store_name: `TEST_ARCHIVED_${vid.slice(0, 8)}`, is_suspended: true }).eq('id', vid);
      }
    }
  }

  console.log('\n======================================================================');
  console.log(`ATTACK HARDENING SUMMARY: ${passed}/${passed + failed} ATTACKS DEFENDED`);
  console.log('======================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runAttackSuite().catch((err) => {
  console.error('Fatal Attack Suite error:', err);
  process.exit(1);
});
