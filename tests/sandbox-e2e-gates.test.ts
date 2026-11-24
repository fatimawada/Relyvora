/**
 * End-to-End Sandbox Gates, Privacy, Session Carry & Escrow Lifecycle Verification Suite
 *
 * Covers:
 * 1. Gate-only-live isolation: only the 4 live capabilities are gated on PAYMENTS_MODE=live + LAUNCH_STATUS=live;
 *    everything else runs openly in PAYMENTS_MODE=sandbox.
 * 2. Strict DB privacy guarantee: BVN, NIN, DOB, gender, address, and bank details NEVER reach Supabase Postgres.
 * 3. Single 6-digit email OTP path + session carry directly from Step 1 OTP verification into Step 2 (zero re-entry).
 * 4. Strict WHATSAPP_ALLOWED_RECIPIENTS enforcement through the test number in sandbox, plus release code on-screen copy.
 * 5. Complete sandbox escrow lifecycle: create link (Anchor Sandbox virtual NUBAN) -> confirm order -> fund -> dispatch proof
 *    -> release (payout + fee transfers) -> dispute + evidence + admin resolution -> expired unpaid link reconciliation.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

import {
  isLiveLaunchReady,
  evaluateRealMoneyMovementGateServer,
  evaluateLiveKycGateServer,
  evaluateReleaseCodeWhatsappGateServer,
  getVendorGateSnapshotServer,
  isKycEnabledServer,
} from '../lib/launchGates';
import { clearSafetySettingsCache } from '../lib/safetyLimits';
import { isPhoneAllowedByStagingList, sendOtpWhatsappTemplate } from '../lib/whatsapp';
import { sendReleaseCodeSmsOrWhatsapp } from '../lib/smsDelivery';

import { GET as authCallbackGet } from '../app/auth/callback/route';
import { POST as onboardingPost } from '../app/api/vendor/onboarding/route';
import { GET as vendorStatusGet } from '../app/api/vendor/status/route';
import { POST as createLinkPost } from '../app/api/escrow/create-link/route';
import { POST as consentPost } from '../app/api/escrow/[id]/consent/route';
import { POST as confirmPaymentPost } from '../app/api/escrow/confirm-payment/route';
import { POST as dispatchPost } from '../app/api/escrow/dispatch/route';
import { POST as releasePost } from '../app/api/escrow/release/route';
import { POST as disputeSendOtpPost } from '../app/api/escrow/dispute/send-otp/route';
import { POST as disputePost } from '../app/api/escrow/dispute/route';
import { POST as disputeRespondPost } from '../app/api/escrow/dispute/respond/route';
import { POST as adminResolvePost } from '../app/api/admin/disputes/resolve/route';
import { GET as reconcileGet } from '../app/api/cron/reconcile/route';

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

const VALID_1PX_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII=';

async function main() {
  console.log('======================================================================');
  console.log('RELYVORA END-TO-END SANDBOX GATES, PRIVACY & LIFECYCLE TEST SUITE');
  console.log('======================================================================\n');

  const origFetch = globalThis.fetch;
  const origEnv: Record<string, string | undefined> = {
    PAYMENTS_MODE: process.env.PAYMENTS_MODE,
    NEXT_PUBLIC_PAYMENTS_MODE: process.env.NEXT_PUBLIC_PAYMENTS_MODE,
    LAUNCH_STATUS: process.env.LAUNCH_STATUS,
    NEXT_PUBLIC_LAUNCH_STATUS: process.env.NEXT_PUBLIC_LAUNCH_STATUS,
    RELEASE_CODE_TEMPLATE_APPROVED: process.env.RELEASE_CODE_TEMPLATE_APPROVED,
    WHATSAPP_ALLOWED_RECIPIENTS: process.env.WHATSAPP_ALLOWED_RECIPIENTS,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    ADMIN_USER_IDS: process.env.ADMIN_USER_IDS,
    CRON_SECRET: process.env.CRON_SECRET,
    ANCHOR_BASE_URL: process.env.ANCHOR_BASE_URL,
    ANCHOR_SECRET_KEY: process.env.ANCHOR_SECRET_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  };

  try {
    // -------------------------------------------------------------------
    // 1. UI SANDBOX RIBBON, SINGLE SIGN-UP COPY, LIGHT MODE & NO LINK BUTTONS
    // -------------------------------------------------------------------
    console.log('--- 1. UI SANDBOX RIBBON, HEADER, COPY & DARK MODE AUDIT ---');
    const demoBannerSrc = fs.readFileSync('components/DemoBanner.tsx', 'utf8');
    const navbarSrc = fs.readFileSync('components/Navbar.tsx', 'utf8');
    const themeToggleSrc = fs.readFileSync('components/ui/ThemeToggle.tsx', 'utf8');
    const footerSrc = fs.readFileSync('components/ProductFooter.tsx', 'utf8');
    const ngPageSrc = fs.readFileSync('app/(app)/ng/page.tsx', 'utf8');
    const onboardingSrc = fs.readFileSync('components/vendor/VendorOnboardingFlow.tsx', 'utf8');
    const portalSrc = fs.readFileSync('components/vendor/VendorPortalClient.tsx', 'utf8');
    const paySrc = fs.readFileSync('app/(app)/pay/[id]/page.tsx', 'utf8');
    const orderSrc = fs.readFileSync('app/(app)/order/[id]/page.tsx', 'utf8');
    const disputesSrc = fs.readFileSync('app/(app)/admin/disputes/page.tsx', 'utf8');
    const securitySrc = fs.readFileSync('app/(app)/admin/security/page.tsx', 'utf8');

    assert(
      demoBannerSrc.includes('Test mode: no real money moves') &&
        !navbarSrc.includes('Sandbox Mode') &&
        !navbarSrc.includes('Corporate Site') &&
        !navbarSrc.includes('Vendor Portal') &&
        navbarSrc.includes('href="/"'),
      'Single slim "Test mode: no real money moves" ribbon renders without duplicate header pill or extra header links'
    );

    assert(
      themeToggleSrc.includes('isLightOnlySurface') &&
        !disputesSrc.includes('dark:') &&
        !securitySrc.includes('dark:') &&
        !paySrc.includes('bg-navy-950') &&
        !orderSrc.includes('bg-navy-950'),
      'Dark mode toggle hidden on NG surfaces and zero dark:/bg-navy-950 styling remains on NG/Admin pages'
    );

    assert(
      !onboardingSrc.includes('Use a confirmation link instead') &&
        !portalSrc.includes('Send a sign-in link instead') &&
        !orderSrc.includes('Send a sign-in link instead') &&
        ngPageSrc.includes('Create your seller account') &&
        footerSrc.includes('Create your seller account') &&
        onboardingSrc.includes('Create your seller account') &&
        portalSrc.includes('Create your seller account') &&
        paySrc.includes('Test code: in live mode this is sent by WhatsApp.') &&
        orderSrc.includes('Test code: in live mode this is sent by WhatsApp.') &&
        !portalSrc.includes('Payments open soon') &&
        !portalSrc.includes('Waitlisted'),
      'One 6-digit OTP UI flow, consistent "Create your seller account" label, accurate test-code copy, and zero sandbox Waitlisted/Payments-open-soon copy'
    );

    // -------------------------------------------------------------------
    // 2. GATE ISOLATION & WHATSAPP ALLOWLIST ENFORCEMENT
    // -------------------------------------------------------------------
    console.log('\n--- 2. LIVE-ONLY 4 GATES & WHATSAPP ALLOWLIST ---');
    process.env.PAYMENTS_MODE = 'sandbox';
    process.env.NEXT_PUBLIC_PAYMENTS_MODE = 'sandbox';
    process.env.LAUNCH_STATUS = 'launching';
    process.env.RELEASE_CODE_TEMPLATE_APPROVED = 'false';
    process.env.WHATSAPP_ALLOWED_RECIPIENTS = '+2348150722573,+2347033841860';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1400996356437628';
    process.env.WHATSAPP_ACCESS_TOKEN = 'wa_sandbox_test_token';
    process.env.ANCHOR_BASE_URL = 'https://api.sandbox.getanchor.co/api/v1';
    process.env.ANCHOR_SECRET_KEY = 'anc_sandbox_test_secret';
    process.env.CRON_SECRET = 'cron_sandbox_test_secret';
    process.env.VERCEL_ENV = 'preview';
    process.env.TURNSTILE_SECRET_KEY = 'turnstile_sandbox_test_secret';
    clearSafetySettingsCache();

    const verifiedVendorStub = {
      id: '00000000-0000-4000-8000-000000000010',
      kyc_status: 'verified',
      is_suspended: false,
      payout_account_verified: true,
      settlement_account_name_matched: true,
    };
    const adminUserId = '73d726ec-c27e-4814-85e7-c7119a5871cc';
    const adminMockJwt =
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') +
      '.' +
      Buffer.from(
        JSON.stringify({
          sub: adminUserId,
          email: 'admin@relyvora.com',
          aal: 'aal2',
          iat: Math.floor(Date.now() / 1000),
        })
      ).toString('base64url') +
      '.sandboxsig';
    process.env.ADMIN_USER_IDS = adminUserId;

    const gate1Sandbox = await evaluateRealMoneyMovementGateServer({ vendor: verifiedVendorStub });
    const gate2Sandbox = await evaluateLiveKycGateServer();
    const gate4Sandbox = await evaluateReleaseCodeWhatsappGateServer();
    const snapSandbox = await getVendorGateSnapshotServer(verifiedVendorStub);

    assert(
      !isLiveLaunchReady() &&
        (await isKycEnabledServer()) === true &&
        gate1Sandbox.allowed === true &&
        gate2Sandbox.allowed === true &&
        gate4Sandbox.allowed === false &&
        snapSandbox.canCreateLinks === true &&
        snapSandbox.liveGates.realMoneyMovement === false &&
        snapSandbox.liveGates.liveAnchorKyc === false &&
        snapSandbox.liveGates.liveWhatsappBuyers === false &&
        snapSandbox.liveGates.releaseCodeWhatsapp === false,
      'In sandbox, KYC & sandbox orders work openly while all 4 live gates remain false'
    );

    const waGraphCalls: Array<{ url: string; to?: string }> = [];
    const anchorCalls: Array<{ method: string; url: string; body: any }> = [];
    const supabaseVendorWrites: Array<{ method: string; body: any }> = [];

    const vendorUserId = '11111111-1111-4111-8111-111111111111';
    const vendorEmail = 'seller-e2e@relyvora.com';
    let vendorRow: Record<string, any> = {
      id: verifiedVendorStub.id,
      user_id: vendorUserId,
      store_name: 'Lagos Leather Studio',
      email: vendorEmail,
      phone_number: '+2348150722573',
      phone_verified: false,
      kyc_status: 'pending',
      payout_account_verified: false,
      settlement_account_name_matched: false,
      is_allowlisted: false,
      is_suspended: false,
      tier: 'NEW',
      successful_sales_count: 0,
      completed_orders_count: 0,
      disputes_count: 0,
      compliance_strikes: 0,
      daily_volume_ngn: 0,
      anchor_customer_id: null,
      anchor_deposit_account_id: null,
    };

    const txRows: Record<string, Record<string, any>> = {};
    const evidenceRows: Record<string, any>[] = [];
    let nubanSeq = 9001122330;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || 'GET').toUpperCase();
      const rawBody = typeof init?.body === 'string' ? init.body : '';
      let parsedBody: any = null;
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        parsedBody = null;
      }

      // Cloudflare Turnstile mock
      if (urlStr.includes('challenges.cloudflare.com/turnstile')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Meta Graph WhatsApp API spy
      if (urlStr.includes('graph.facebook.com')) {
        waGraphCalls.push({ url: urlStr, to: parsedBody?.to });
        return new Response(JSON.stringify({ messages: [{ id: `wamid.test.${waGraphCalls.length}` }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Anchor Sandbox API mock
      if (urlStr.includes('getanchor.co')) {
        anchorCalls.push({ method, url: urlStr, body: parsedBody });
        if (urlStr.includes('/payments/verify-account/')) {
          return new Response(
            JSON.stringify({
              data: {
                attributes: {
                  accountName: 'CHINEDU OKAFOR',
                  accountNumber: '0123456789',
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (urlStr.includes('/customers') && urlStr.includes('/verification/individual')) {
          return new Response(JSON.stringify({ data: { id: 'anc_kyc_ok_1', status: 'verified' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (urlStr.includes('/customers') && method === 'POST') {
          return new Response(
            JSON.stringify({ data: { id: 'anc_cust_sandbox_1', attributes: { status: 'created' } } }),
            { status: 201, headers: { 'content-type': 'application/json' } }
          );
        }
        if (urlStr.includes('/counterparties') && method === 'POST') {
          return new Response(
            JSON.stringify({ data: { id: 'anc_cp_sandbox_1' } }),
            { status: 201, headers: { 'content-type': 'application/json' } }
          );
        }
        if (urlStr.includes('/accounts') && method === 'POST') {
          return new Response(
            JSON.stringify({ data: { id: 'anc_dep_acc_sandbox_1' } }),
            { status: 201, headers: { 'content-type': 'application/json' } }
          );
        }
        if (urlStr.includes('/virtual-nubans') && method === 'POST') {
          nubanSeq += 1;
          return new Response(
            JSON.stringify({
              data: {
                id: `anc_vnuban_${nubanSeq}`,
                attributes: {
                  accountNumber: String(nubanSeq),
                  accountName: 'Relyvora Escrow / Lagos Leather Studio',
                  bank: { name: 'Providus Bank' },
                },
              },
            }),
            { status: 201, headers: { 'content-type': 'application/json' } }
          );
        }
        if (urlStr.includes('/virtual-nubans/') && method === 'DELETE') {
          return new Response(JSON.stringify({ data: { closed: true } }), { status: 200 });
        }
        if (urlStr.includes('/transfers') && method === 'POST') {
          return new Response(
            JSON.stringify({ data: { id: `anc_tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` } }),
            { status: 201, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      }

      // Supabase Auth mock
      if (urlStr.includes('/auth/v1/user')) {
        const authHdr = new Headers(init?.headers).get('authorization') || '';
        if (authHdr.includes(adminMockJwt) || authHdr.includes('admin_jwt')) {
          return new Response(
            JSON.stringify({
              id: adminUserId,
              email: 'admin@relyvora.com',
              email_confirmed_at: '2026-01-01T00:00:00.000Z',
              aal: 'aal2',
              factors: [{ id: 'f_totp_1', factor_type: 'totp', status: 'verified' }],
              app_metadata: { role: 'admin', aal: 'aal2' },
              user_metadata: {},
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (authHdr.includes('vendor_jwt')) {
          return new Response(
            JSON.stringify({
              id: vendorUserId,
              email: vendorEmail,
              email_confirmed_at: '2026-01-01T00:00:00.000Z',
              app_metadata: {},
              user_metadata: { store_name: 'Lagos Leather Studio', phone_number: '+2348150722573' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      }

      if (urlStr.includes('/auth/v1/factors') || urlStr.includes('/auth/v1/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'vendor_jwt',
            refresh_token: 'vendor_refresh',
            expires_in: 3600,
            token_type: 'bearer',
            currentLevel: 'aal2',
            user: {
              id: vendorUserId,
              email: vendorEmail,
              email_confirmed_at: '2026-01-01T00:00:00.000Z',
              user_metadata: { store_name: 'Lagos Leather Studio', phone_number: '+2348150722573' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr.includes('/auth/v1/verify')) {
        return new Response(
          JSON.stringify({
            access_token: 'vendor_jwt',
            refresh_token: 'vendor_refresh',
            expires_in: 3600,
            token_type: 'bearer',
            user: {
              id: vendorUserId,
              email: vendorEmail,
              email_confirmed_at: '2026-01-01T00:00:00.000Z',
              user_metadata: { store_name: 'Lagos Leather Studio', phone_number: '+2348150722573' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      // Supabase Storage upload mock
      if (urlStr.includes('/storage/v1/object/')) {
        return new Response(JSON.stringify({ Key: 'relyvora-evidence/mock-proof.png' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Supabase REST & RPC mock
      if (urlStr.includes('/rest/v1/rpc/')) {
        const rpcName = urlStr.split('/rest/v1/rpc/')[1]?.split('?')[0];
        if (rpcName === 'rpc_check_rate_limit') {
          return new Response(
            JSON.stringify({
              allowed: true,
              count: 1,
              remaining: 99,
              reset_at: new Date(Date.now() + 60_000).toISOString(),
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (rpcName === 'rpc_verify_and_prepare_release') {
          const tx = txRows[parsedBody.p_transaction_id];
          if (!tx) return new Response(JSON.stringify({ success: false, message: 'Not found' }), { status: 200 });
          if (!parsedBody.p_hmac_hash || parsedBody.p_hmac_hash !== tx.release_code_hash) {
            return new Response(JSON.stringify({ success: false, error: 'INVALID_CODE', remaining_attempts: 4 }), { status: 200 });
          }
          tx.status = 'RELEASING';
          tx.code_verified_at = new Date().toISOString();
          return new Response(
            JSON.stringify({
              success: true,
              cooling_active: false,
              item_price: tx.item_price,
              protection_fee: tx.protection_fee,
              anchor_deposit_account_id: vendorRow.anchor_deposit_account_id,
              vendor_id: vendorRow.id,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (rpcName === 'rpc_finalize_release_step') {
          const tx = txRows[parsedBody.p_transaction_id];
          if (parsedBody.p_step === 'VENDOR_PAID') {
            tx.status = 'VENDOR_PAID';
            tx.anchor_vendor_transfer_id = parsedBody.p_transfer_id;
            tx.payout_transfer_id = parsedBody.p_transfer_id;
            tx.vendor_paid_at = new Date().toISOString();
          } else if (parsedBody.p_step === 'RELEASED' || parsedBody.p_step === 'COMPLETED') {
            tx.status = 'RELEASED';
            tx.anchor_fee_transfer_id = parsedBody.p_transfer_id;
            tx.released_at = new Date().toISOString();
          }
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (rpcName === 'rpc_raise_dispute_with_lock') {
          const tx = txRows[parsedBody.p_transaction_id];
          tx.status = 'DISPUTED';
          tx.dispute_reason = parsedBody.p_dispute_reason;
          tx.dispute_scenario = parsedBody.p_scenario_id || 1;
          tx.disputed_by = parsedBody.p_raised_by || 'BUYER';
          tx.disputed_at = new Date().toISOString();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (rpcName === 'rpc_admin_prepare_dispute_resolution') {
          const tx = txRows[parsedBody.p_transaction_id];
          tx.status = 'RESOLVING';
          return new Response(
            JSON.stringify({
              success: true,
              buyer_refund_amount: 0,
              vendor_payout_amount: Number(tx.item_price),
              relyvora_fee: Number(tx.protection_fee),
              resolution_action: 'FULL_PAYOUT_VENDOR',
              scenario_name: 'Sandbox Vendor Release Resolution',
              existing_refund_transfer_id: null,
              existing_payout_transfer_id: null,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (rpcName === 'rpc_admin_finalize_dispute_resolution') {
          const tx = txRows[parsedBody.p_transaction_id];
          tx.status = 'RELEASED';
          tx.resolution_action = parsedBody.p_resolution_action;
          tx.resolution_notes = parsedBody.p_resolution_notes;
          tx.payout_transfer_id = parsedBody.p_anchor_payout_transfer_id;
          tx.resolved_at = new Date().toISOString();
          return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (urlStr.includes('/rest/v1/system_settings')) {
        return new Response(
          JSON.stringify([
            { key: 'checkout_enabled', value: true },
            { key: 'payouts_enabled', value: true },
            { key: 'vendor_allowlist_mode', value: false },
            { key: 'kyc_enabled', value: true },
            { key: 'release_code_template_approved', value: false },
            { key: 'launch_status', value: 'launching' },
            { key: 'tier1_order_limit_ngn', value: 200000 },
            { key: 'tier_upgrade_threshold', value: 5 },
            { key: 'max_order_ngn', value: 10000000 },
            { key: 'max_daily_vendor_volume_ngn', value: 20000000 },
            { key: 'max_daily_vendor_whatsapp_messages', value: 50 },
            { key: 'max_daily_buyer_whatsapp_messages', value: 5 },
            {
              key: 'retention_and_storage_config',
              value: {
                evidence_retention_days: 180,
                ip_hash_retention_days: 90,
                whatsapp_message_log_retention_days: 180,
                max_image_bytes: 10485760,
                max_video_bytes: 26214400,
                signed_url_ttl_seconds: 300,
              },
            },
            {
              key: 'tier_config',
              value: {
                tiers: {
                  NEW: { per_order_cap_ngn: 2500000, daily_volume_cap_ngn: 5000000 },
                  ESTABLISHED: { per_order_cap_ngn: 10000000, daily_volume_cap_ngn: 20000000 },
                  TRUSTED: { per_order_cap_ngn: null, daily_volume_cap_ngn: null },
                },
                promotion: {
                  established_min_completed_orders: 5,
                  established_min_days_since_first_order: 14,
                  established_max_disputes: 0,
                },
              },
            },
            {
              key: 'payout_safety_config',
              value: {
                name_match_min_score: 0.7,
                settlement_change_wait_hours: 48,
                require_whatsapp_confirm_on_bank_change: true,
              },
            },
            {
              key: 'risk_engine_config',
              value: {
                review_hold_threshold: 3,
                block_threshold: 6,
                amount_review_threshold_ngn: 500000,
                near_cap_ratio_min: 0.85,
                velocity_window_minutes: 60,
                velocity_max_orders: 5,
                repeat_pair_window_hours: 24,
                repeat_pair_max_orders: 3,
                spike_multiplier: 3,
                spike_min_baseline_ngn: 50000,
                ip_hash_retention_hours: 72,
                weights: {
                  ABOVE_REVIEW_AMOUNT: 2,
                  HIGH_VELOCITY_VENDOR: 2,
                  REPEATED_BUYER_VENDOR_PAIR: 2,
                  REPEATED_NEAR_CAP_ORDER: 2,
                  SUDDEN_AMOUNT_SPIKE: 2,
                  SHARED_DEVICE_OR_IP: 3,
                  MISSING_DEPOSIT_SENDER_NAME: 3,
                  DEPOSIT_EXCEEDS_TIER_CAP: 3,
                  SETTLEMENT_HOLD_ACTIVE: 3,
                  SHARED_PHONE_VENDOR_BUYER: 6,
                  SELF_DEALING_NAME_MATCH: 6,
                  SELF_DEALING_ACCOUNT_MATCH: 6,
                },
              },
            },
            {
              key: 'cooling_window_config',
              value: {
                hours_by_tier: { NEW: 2, ESTABLISHED: 0, TRUSTED: 0 },
                high_value_cooling_hours: 2,
                notify_buyer_on_code_use: true,
              },
            },
            {
              key: 'admin_safety_config',
              value: {
                session_max_age_minutes: 15,
                high_value_confirm_threshold_ngn: 500000,
                require_typed_confirmation: true,
                alert_on_every_admin_action: true,
              },
            },
            {
              key: 'delivery_window_config',
              value: {
                same_city_days: 3,
                interstate_days: 7,
                grace_days: 3,
                hard_max_days: 14,
                dispatch_deadline_days: 3,
                reminder_hours_before_expiry: 24,
              },
            },
            {
              key: 'dispute_policy_config',
              value: {
                timezone: 'Africa/Lagos',
                start_hour: 8,
                end_hour: 20,
                work_days: [1, 2, 3, 4, 5, 6],
              },
            },
            {
              key: 'dispatch_proof_config',
              value: {
                require_upload: true,
                require_courier_name: true,
                require_courier_phone: true,
                require_tracking_for_interstate: true,
              },
            },
            {
              key: 'order_lifecycle_config',
              value: {
                payment_expiry_hours: 24,
                stuck_settlement_minutes: 15,
                refund_fee_on_vendor_cancel: true,
              },
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr.includes('/rest/v1/rate_limit_buckets')) {
        return new Response(JSON.stringify({ count: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (urlStr.includes('/rest/v1/vendors')) {
        const hdrs = new Headers(init?.headers);
        const accept = hdrs.get('accept') || '';
        const single = accept.includes('vnd.pgrst.object+json') || urlStr.includes('limit=1');
        if (method === 'POST' || method === 'PATCH') {
          supabaseVendorWrites.push({ method, body: parsedBody });
          vendorRow = { ...vendorRow, ...(Array.isArray(parsedBody) ? parsedBody[0] : parsedBody) };
          return new Response(JSON.stringify(single ? vendorRow : [vendorRow]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(single ? vendorRow : [vendorRow]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (urlStr.includes('/rest/v1/order_evidence_files')) {
        const hdrs = new Headers(init?.headers);
        const single = (hdrs.get('accept') || '').includes('vnd.pgrst.object+json');
        if (method === 'POST') {
          const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...(Array.isArray(parsedBody) ? parsedBody[0] : parsedBody) };
          evidenceRows.push(rec);
          return new Response(JSON.stringify(single ? rec : [rec]), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(evidenceRows), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (urlStr.includes('/rest/v1/transactions')) {
        const hdrs = new Headers(init?.headers);
        const single = (hdrs.get('accept') || '').includes('vnd.pgrst.object+json');
        const decodedUrl = decodeURIComponent(urlStr);
        if (method === 'POST') {
          const rec = {
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(Array.isArray(parsedBody) ? parsedBody[0] : parsedBody),
          };
          txRows[rec.id] = rec;
          return new Response(JSON.stringify(single ? rec : [rec]), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (method === 'PATCH') {
          const eqMatch = decodedUrl.match(/id=eq\.([0-9a-f-]+)/i);
          if (eqMatch && txRows[eqMatch[1]]) {
            txRows[eqMatch[1]] = { ...txRows[eqMatch[1]], ...parsedBody, updated_at: new Date().toISOString() };
            return new Response(JSON.stringify(single ? txRows[eqMatch[1]] : [txRows[eqMatch[1]]]), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          const inMatch = decodedUrl.match(/id=in\.\(([^)]+)\)/i);
          if (inMatch) {
            const ids = inMatch[1]
              .split(',')
              .map((s) => s.trim().replace(/^"|"$/g, ''));
            const updated: any[] = [];
            for (const tid of ids) {
              if (txRows[tid]) {
                txRows[tid] = { ...txRows[tid], ...parsedBody, updated_at: new Date().toISOString() };
                updated.push(txRows[tid]);
              }
            }
            return new Response(JSON.stringify(updated), { status: 200, headers: { 'content-type': 'application/json' } });
          }
          // Bulk status update e.g. Cron reconcile expiry
          const nowIso = new Date().toISOString();
          const updated: any[] = [];
          for (const tx of Object.values(txRows)) {
            if (decodedUrl.includes('AWAITING_PAYMENT') && tx.status === 'AWAITING_PAYMENT' && tx.expires_at && tx.expires_at < nowIso) {
              Object.assign(tx, parsedBody);
              updated.push(tx);
            }
          }
          return new Response(JSON.stringify(updated), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        const match = decodedUrl.match(/id=eq\.([0-9a-f-]+)/i);
        if (match) {
          const found = txRows[match[1]] ? { ...txRows[match[1]], vendors: vendorRow } : null;
          if (single) {
            return new Response(JSON.stringify(found), { status: found ? 200 : 406, headers: { 'content-type': 'application/json' } });
          }
          return new Response(JSON.stringify(found ? [found] : []), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        const allTx = Object.values(txRows).filter((tx) => {
          const statusMatch = decodedUrl.match(/status=eq\.([A-Z_]+)/);
          if (statusMatch && tx.status !== statusMatch[1]) return false;
          const statusInMatch = decodedUrl.match(/status=in\.\(([^)]+)\)/i);
          if (statusInMatch) {
            const allowed = statusInMatch[1]
              .split(',')
              .map((s) => s.trim().replace(/^"|"$/g, ''));
            if (!allowed.includes(tx.status)) return false;
          }
          return true;
        });
        return new Response(JSON.stringify(allTx), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (urlStr.includes('/rest/v1/whatsapp_message_log')) {
        if (method === 'HEAD') {
          return new Response(null, { status: 200, headers: { 'content-range': '0-0/0' } });
        }
        return new Response(JSON.stringify([]), {
          status: method === 'POST' ? 201 : 200,
          headers: { 'content-type': 'application/json', 'content-range': '0-0/0' },
        });
      }

      if (urlStr.includes('/rest/v1/audit_logs') || urlStr.includes('/rest/v1/admin_audit_logs') || urlStr.includes('/rest/v1/')) {
        const hdrs = new Headers(init?.headers);
        const accept = hdrs.get('accept') || '';
        if (accept.includes('vnd.pgrst.object+json') && method === 'GET') {
          return new Response(JSON.stringify({ code: 'PGRST116', details: '0 rows' }), {
            status: 406,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify([]), {
          status: method === 'POST' ? 201 : 200,
          headers: { 'content-type': 'application/json', 'content-range': '0-0/0' },
        });
      }

      return origFetch(input as any, init);
    };

    // Verify Gate 3 & Gate 4 WhatsApp behavior against live Graph spy
    const nonAllowedCheck = await sendOtpWhatsappTemplate({
      transactionId: '00000000-0000-4000-8000-000000000099',
      buyerPhone: '+2348099998888',
      otp: '123456',
      purpose: 'dispute',
    });
    const allowedCheck = await sendOtpWhatsappTemplate({
      transactionId: '00000000-0000-4000-8000-000000000099',
      buyerPhone: '08150722573',
      otp: '123456',
      purpose: 'dispute',
    });
    const releaseCodeBlockedCheck = await sendReleaseCodeSmsOrWhatsapp({
      transactionId: '00000000-0000-4000-8000-000000000099',
      vendorId: verifiedVendorStub.id,
      buyerPhone: '+2348150722573',
      releaseCode: '654321',
      itemName: 'Test Item',
      totalAmount: 10500,
      vendorHandle: 'Lagos Leather Studio',
    });

    assert(
      isPhoneAllowedByStagingList('+2348150722573') === true &&
        isPhoneAllowedByStagingList('+2348099998888') === false &&
        nonAllowedCheck.success === false &&
        allowedCheck.success === true &&
        waGraphCalls.length === 1 &&
        waGraphCalls[0].url.includes('/1400996356437628/messages') &&
        releaseCodeBlockedCheck.success === false &&
        releaseCodeBlockedCheck.channel === 'on_screen_test',
      'Sandbox WhatsApp sends strictly to WHATSAPP_ALLOWED_RECIPIENTS via test phone ID and never sends release codes'
    );

    // -------------------------------------------------------------------
    // 3. SESSION CARRY (STEP 1 OTP / CALLBACK -> STEP 2 NO RE-ENTRY)
    // -------------------------------------------------------------------
    console.log('\n--- 3. SESSION CARRY TO STEP 2 & DB PRIVACY GUARANTEE ON KYC ---');
    const cbRes = await authCallbackGet(
      new NextRequest('https://staging.relyvora.com/auth/callback?token_hash=otp_step1_hash&type=email', {
        method: 'GET',
        headers: { host: 'staging.relyvora.com' },
      })
    );
    const statusRes = await vendorStatusGet(
      new NextRequest('https://staging.relyvora.com/api/vendor/status', {
        method: 'GET',
        headers: { authorization: 'Bearer vendor_jwt' },
      })
    );
    const statusJson = await statusRes.json();

    assert(
      cbRes.headers.get('location') === 'https://staging.relyvora.com/vendor/onboarding?confirmed=1&step=2' &&
        statusJson.authenticated === true &&
        statusJson.firstIncompleteStep === 2 &&
        statusJson.user?.storeName === 'Lagos Leather Studio' &&
        statusJson.user?.phoneNumber === '+2348150722573' &&
        statusJson.gates?.kycEnabled === true,
      'Successful email confirmation/OTP carries session directly to Step 2 with store name & WhatsApp pre-filled (no second sign-in)'
    );

    // Step 2 Sandbox KYC + DB Privacy Check
    const kycRes = await onboardingPost(
      new NextRequest('https://staging.relyvora.com/api/vendor/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer vendor_jwt',
          'x-vercel-forwarded-for': '102.89.55.1',
        },
        body: JSON.stringify({
          acceptedTermsAndProhibitedItems: true,
          captchaToken: 'mock_captcha_token',
          profile: {
            storeName: 'Lagos Leather Studio',
            email: vendorEmail,
            phoneNumber: '08150722573',
          },
          regulatoryKyc: {
            legalFirstName: 'Chinedu',
            legalLastName: 'Okafor',
            dateOfBirth: '1993-04-12',
            gender: 'MALE',
            address: '14 Ademola Adetokunbo Cres, Lagos',
            idType: 'BVN',
            idNumber: '22211122211',
            bankCode: '058',
            accountNumber: '0123456789',
          },
        }),
      })
    );
    const kycJson = await kycRes.json();
    const writtenJson = JSON.stringify(supabaseVendorWrites);
    const forbiddenDbFields = [
      'bvn',
      'nin',
      'id_number',
      'idNumber',
      'date_of_birth',
      'dateOfBirth',
      'gender',
      'address',
      'settlement_bank_code',
      'settlement_account_number',
      'settlement_account_name',
      'pending_settlement_bank_code',
      'pending_settlement_account_number',
      'pending_settlement_account_name',
      'account_last4',
      'bank_code',
    ];
    const forbiddenValues = ['22211122211', '12345678901', '1993-04-12', 'Ademola Adetokunbo', '0123456789'];
    const leakedFields = forbiddenDbFields.filter((f) =>
      supabaseVendorWrites.some((w) => {
        const rows = Array.isArray(w.body) ? w.body : [w.body];
        return rows.some((r: any) => r && r[f] !== undefined && r[f] !== null);
      })
    );
    const leakedValues = forbiddenValues.filter((v) => writtenJson.includes(v));

    if (kycRes.status !== 200 || kycJson.success !== true || leakedFields.length > 0 || leakedValues.length > 0) {
      console.error('DEBUG kycRes:', kycRes.status, kycJson, { leakedFields, leakedValues, supabaseVendorWrites });
    }

    assert(
      kycRes.status === 200 &&
        kycJson.success === true &&
        kycJson.data?.dbKycStatus === 'verified' &&
        kycJson.data?.kycStatus === 'VERIFIED' &&
        Boolean(kycJson.data?.anchorSandboxResponse?.customerId) &&
        leakedFields.length === 0 &&
        leakedValues.length === 0 &&
        anchorCalls.some((c) => c.url.includes('/verification/individual')),
      `Step 2 Anchor Sandbox KYC succeeded & zero BVN/NIN/DOB/address/bank fields reached Supabase (leaks: fields=${leakedFields.length}, vals=${leakedValues.length})`
    );

    // -------------------------------------------------------------------
    // 4. COMPLETE 9-STEP SANDBOX ESCROW LIFECYCLE
    // -------------------------------------------------------------------
    console.log('\n--- 4. FULL SANDBOX ESCROW LIFECYCLE (LINK -> FUND -> DISPATCH -> RELEASE + DISPUTE + EXPIRED) ---');

    // Order A: Happy path -> Link (Anchor NUBAN) -> Confirm -> Fund -> Dispatch -> Release (Payout + Fee Transfer)
    const createRes = await createLinkPost(
      new NextRequest('https://staging.relyvora.com/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer vendor_jwt',
          'x-vercel-forwarded-for': '102.89.55.2',
        },
        body: JSON.stringify({
          itemName: 'TEST - Handcrafted Leather Bag',
          itemPrice: 25000,
          deliveryType: 'same_city',
          buyerPhone: '+2348099997777', // Not on allowlist -> safely skipped
          buyerWhatsappConsent: true,
        }),
      })
    );
    const createJson = await createRes.json();
    const orderId = createJson.transaction?.id;
    if (!orderId) {
      console.error('DEBUG createResA:', createRes.status, createJson);
    }

    const consentRes = await consentPost(
      new NextRequest(`https://staging.relyvora.com/api/escrow/${orderId}/consent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '102.89.55.3' },
        body: JSON.stringify({ acceptedTerms: true, sandboxConfirmOrder: true }),
      }),
      { params: Promise.resolve({ id: orderId }) }
    );
    const consentJson = await consentRes.json();

    const fundRes = await confirmPaymentPost(
      new NextRequest('https://staging.relyvora.com/api/escrow/confirm-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '102.89.55.4' },
        body: JSON.stringify({ transactionId: orderId, paymentMethod: 'SANDBOX_VIRTUAL_NUBAN' }),
      })
    );
    const fundJson = await fundRes.json();
    const releaseCode = fundJson.sandbox_release_code;

    const dispatchRes = await dispatchPost(
      new NextRequest('https://staging.relyvora.com/api/escrow/dispatch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer vendor_jwt',
          'x-vercel-forwarded-for': '102.89.55.5',
        },
        body: JSON.stringify({
          transactionId: orderId,
          carrierName: 'GIG Logistics Rider',
          carrierPhone: '08030001122',
          trackingReference: 'TEST-WAYBILL-01',
          dispatchNotes: 'Packed safely',
          proofFile: {
            fileName: 'dispatch-proof.png',
            mimeType: 'image/png',
            base64Data: VALID_1PX_PNG_DATA_URI,
          },
        }),
      })
    );
    const dispatchJson = await dispatchRes.json();

    const releaseRes = await releasePost(
      new NextRequest('https://staging.relyvora.com/api/escrow/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer vendor_jwt',
          'x-vercel-forwarded-for': '102.89.55.6',
        },
        body: JSON.stringify({
          transactionId: orderId,
          releaseCode,
          sandboxSkipCoolingHold: true,
        }),
      })
    );
    const releaseJson = await releaseRes.json();

    if (releaseRes.status !== 200 || releaseJson.transaction?.status !== 'RELEASED') {
      console.error('DEBUG OrderA:', {
        create: [createRes.status, createJson],
        consent: [consentRes.status, consentJson],
        fund: [fundRes.status, fundJson],
        dispatch: [dispatchRes.status, dispatchJson],
        release: [releaseRes.status, releaseJson],
      });
    }

    assert(
      (createRes.status === 200 || createRes.status === 201) &&
        Boolean(createJson.transaction?.virtual_account_number || txRows[orderId]?.virtual_account_number) &&
        consentRes.status === 200 &&
        consentJson.success === true &&
        txRows[orderId]?.buyer_phone_verified === true &&
        fundRes.status === 200 &&
        /^\d{6}$/.test(String(releaseCode)) &&
        fundJson.code_notice === 'Test code: in live mode this is sent by WhatsApp.' &&
        dispatchRes.status === 200 &&
        dispatchJson.transaction?.status === 'DISPATCHED' &&
        releaseRes.status === 200 &&
        releaseJson.transaction?.status === 'RELEASED' &&
        Boolean(releaseJson.payoutTransfer?.transferId) &&
        Boolean(releaseJson.feeTransfer?.transferId),
      'Order A full lifecycle works: Sandbox Virtual NUBAN -> Test confirm -> Funds locked + Test code -> Dispatch proof -> Release (Payout + Fee transfers)'
    );

    // Order B: Dispute + Evidence + Admin Resolution
    const createResB = await createLinkPost(
      new NextRequest('https://staging.relyvora.com/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer vendor_jwt',
          'x-vercel-forwarded-for': '102.89.55.7',
        },
        body: JSON.stringify({
          itemName: 'TEST - Silk Scarf Order B',
          itemPrice: 18000,
          deliveryType: 'same_city',
          buyerPhone: '+2347033841860', // Second allowlisted test number (distinct from seller)
          buyerWhatsappConsent: true,
        }),
      })
    );
    const createBJson = await createResB.json();
    const orderBId = createBJson.transaction?.id;
    if (!orderBId) {
      console.error('DEBUG createResB:', createResB.status, createBJson);
    }

    const fundResB = await confirmPaymentPost(
      new NextRequest('https://staging.relyvora.com/api/escrow/confirm-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '102.89.55.8' },
        body: JSON.stringify({ transactionId: orderBId }),
      })
    );
    const buyerCookieHeader = fundResB.headers.get('set-cookie')?.split(';')[0] || '';

    const otpRes = await disputeSendOtpPost(
      new NextRequest('https://staging.relyvora.com/api/escrow/dispute/send-otp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: buyerCookieHeader,
          'x-vercel-forwarded-for': '102.89.55.9',
        },
        body: JSON.stringify({ transactionId: orderBId }),
      })
    );
    const otpJson = await otpRes.json();

    const disputeRes = await disputePost(
      new NextRequest('https://staging.relyvora.com/api/escrow/dispute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: buyerCookieHeader,
          'x-vercel-forwarded-for': '102.89.55.10',
        },
        body: JSON.stringify({
          transactionId: orderBId,
          disputeReason: 'Buyer claims wrong item color',
          scenarioId: 3,
          otp: otpJson.sandbox_otp,
          evidenceFiles: [
            {
              fileName: 'buyer-dispute.png',
              mimeType: 'image/png',
              base64Data: VALID_1PX_PNG_DATA_URI,
            },
          ],
        }),
      })
    );

    const respondRes = await disputeRespondPost(
      new NextRequest('https://staging.relyvora.com/api/escrow/dispute/respond', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer vendor_jwt',
          'x-vercel-forwarded-for': '102.89.55.11',
        },
        body: JSON.stringify({ transactionId: orderBId, responseText: 'Dispatched exact brown scarf as ordered' }),
      })
    );

    // Fetch exact expected typedConfirmation phrase from fail-closed 400 first, then resolve
    const phraseProbe = await adminResolvePost(
      new NextRequest('https://staging.relyvora.com/api/admin/disputes/resolve', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminMockJwt}`,
          'x-vercel-forwarded-for': '102.89.55.12',
        },
        body: JSON.stringify({ transactionId: orderBId, scenarioId: 3, resolutionNotes: 'Sandbox vendor release test' }),
      })
    );
    const probeJson = await phraseProbe.json();
    const expectedPhrase = probeJson.expectedPhrase;

    const resolveRes = await adminResolvePost(
      new NextRequest('https://staging.relyvora.com/api/admin/disputes/resolve', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminMockJwt}`,
          'x-vercel-forwarded-for': '102.89.55.13',
        },
        body: JSON.stringify({
          transactionId: orderBId,
          scenarioId: 3,
          resolutionNotes: 'Sandbox vendor release test',
          typedConfirmation: expectedPhrase,
        }),
      })
    );
    const resolveJson = await resolveRes.json();
    if (resolveRes.status !== 200 || !resolveJson.success) {
      console.error('DEBUG OrderB:', {
        otp: [otpRes.status],
        dispute: [disputeRes.status],
        respond: [respondRes.status],
        probe: [phraseProbe.status, probeJson],
        resolve: [resolveRes.status, resolveJson],
      });
    }

    assert(
      otpRes.status === 200 &&
        disputeRes.status === 200 &&
        respondRes.status === 200 &&
        resolveRes.status === 200 &&
        resolveJson.success === true &&
        txRows[orderBId]?.status === 'RELEASED',
      'Order B dispute + evidence + vendor response + Admin resolution succeeded cleanly'
    );

    // Order C: Unpaid expired order reconciled to EXPIRED
    const createResC = await createLinkPost(
      new NextRequest('https://staging.relyvora.com/api/escrow/create-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer vendor_jwt',
          'x-vercel-forwarded-for': '102.89.55.14',
        },
        body: JSON.stringify({
          itemName: 'TEST - Unpaid Expiry Item C',
          itemPrice: 12000,
          deliveryType: 'same_city',
        }),
      })
    );
    const createCJson = await createResC.json();
    const orderCId = createCJson.transaction?.id;
    if (!orderCId || !txRows[orderCId]) {
      console.error('DEBUG createResC:', createResC.status, createCJson);
    } else {
      txRows[orderCId].expires_at = new Date(Date.now() - 3600_000).toISOString();
    }

    const cronRes = await reconcileGet(
      new NextRequest('https://staging.relyvora.com/api/cron/reconcile', {
        method: 'GET',
        headers: { authorization: 'Bearer cron_sandbox_test_secret' },
      })
    );
    const cronJson = await cronRes.json();
    if (cronRes.status !== 200 || cronJson.success !== true || txRows[orderCId]?.status !== 'EXPIRED') {
      console.error('DEBUG OrderC:', { status: cronRes.status, cronJson, tx: txRows[orderCId] });
    }

    assert(
      cronRes.status === 200 && cronJson.success === true && txRows[orderCId]?.status === 'EXPIRED',
      'Order C unpaid order past expiry is reconciled to EXPIRED'
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
  console.log(`SANDBOX E2E GATES SUITE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('======================================================================');
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
