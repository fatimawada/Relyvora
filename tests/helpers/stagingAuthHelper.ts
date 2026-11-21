/**
 * Test Scaffolding: Authenticated Session, Buyer Session Cookie & External Transport Helper
 *
 * Used strictly inside `tests/`. Never imported by runtime application code (`app/`, `lib/`, `components/`).
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST as buyerSessionPost } from '../../app/api/escrow/buyer-session/route';
import { BUYER_OTP_CHALLENGE_COOKIE_NAME, BUYER_SESSION_COOKIE_NAME } from '../../lib/buyerSession';
import type { MetaTemplatePayload } from '../../lib/whatsapp';

export interface MockAuthUserSpec {
  id: string;
  email: string;
  role?: 'authenticated' | 'admin';
  aal?: 'aal1' | 'aal2';
  emailConfirmed?: boolean;
}

export const CLOUDFLARE_TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
export const CLOUDFLARE_TURNSTILE_TEST_SECRET_PASS = '1x0000000000000000000000000000000AA';
export const CLOUDFLARE_TURNSTILE_TEST_SECRET_FAIL = '2x0000000000000000000000000000000AA';
export const CLOUDFLARE_TURNSTILE_DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

export function ensureTestSecrets() {
  if (!process.env.ANCHOR_WEBHOOK_SECRET) {
    process.env.ANCHOR_WEBHOOK_SECRET = 'test_staging_anchor_webhook_secret_v1';
  }
  if (!process.env.WHATSAPP_APP_SECRET) {
    process.env.WHATSAPP_APP_SECRET = 'test_staging_whatsapp_app_secret_v1';
  }
  if (!process.env.WHATSAPP_ACCESS_TOKEN) {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test_staging_wa_access_token';
  }
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID) {
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'test_staging_wa_phone_id';
  }
  if (!process.env.TURNSTILE_SECRET_KEY) {
    process.env.TURNSTILE_SECRET_KEY = CLOUDFLARE_TURNSTILE_TEST_SECRET_PASS;
  }
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = CLOUDFLARE_TURNSTILE_TEST_SITE_KEY;
  }
  if (!process.env.RELEASE_CODE_PEPPER) {
    process.env.RELEASE_CODE_PEPPER = 'test_staging_release_code_pepper_v1';
  }
  if (!process.env.BUYER_SESSION_SECRET) {
    process.env.BUYER_SESSION_SECRET = 'test_staging_buyer_session_secret_v1';
  }
  if (!process.env.CRON_SECRET) {
    process.env.CRON_SECRET = 'test_staging_cron_secret_v1';
  }
  if (!process.env.RISK_HASH_SALT) {
    process.env.RISK_HASH_SALT = 'test_staging_risk_hash_salt_v1';
  }
}

export function buildSyntheticSupabaseJwt(user: MockAuthUserSpec): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: 'authenticated',
      aal: user.aal || 'aal1',
      exp: nowSec + 3600,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-signing-key')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function extractSetCookiePair(response: Response, cookieName: string): {
  pair: string | null;
  rawHeader: string | null;
} {
  const anyHeaders = response.headers as any;
  const rawList: string[] =
    typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : response.headers.get('set-cookie')
        ? [String(response.headers.get('set-cookie'))]
        : [];

  for (const header of rawList) {
    const firstPart = header.split(';')[0]?.trim() || '';
    if (firstPart.startsWith(`${cookieName}=`)) {
      const eq = firstPart.indexOf('=');
      const val = eq >= 0 ? firstPart.slice(eq + 1) : '';
      return { pair: val ? `${cookieName}=${val}` : null, rawHeader: header };
    }
  }
  return { pair: null, rawHeader: null };
}

export interface CapturedWhatsappDispatch {
  messageId: string;
  transactionId?: string;
  templateName: string;
  to: string;
  parameters: string[];
  payload: MetaTemplatePayload;
}

export function captureMetaCloudDispatch(
  payload: MetaTemplatePayload,
  messageId?: string
): CapturedWhatsappDispatch {
  const id = messageId || `wamid.test.${crypto.randomBytes(8).toString('hex')}`;
  const bodyComp = payload.template?.components?.find((c) => c.type === 'body') as any;
  const params = (Array.isArray(bodyComp?.parameters) ? bodyComp.parameters : []).map((p: any) =>
    String(p.text || p.payload || '')
  );
  return {
    messageId: id,
    templateName: payload.template.name,
    to: payload.to,
    parameters: params,
    payload,
  };
}

export function clearWhatsappRetryMemoryCacheForTests() {
  const g = globalThis as unknown as {
    __relyvoraWhatsappStore?: { recentPayloadsByWamid?: Map<string, unknown> };
  };
  g.__relyvoraWhatsappStore?.recentPayloadsByWamid?.clear();
}

export function installTestTransportMocks(options?: {
  usersByToken?: Map<string, MockAuthUserSpec>;
  capturedWhatsapp?: CapturedWhatsappDispatch[];
  onAnchorBalanceKobo?: number;
}) {
  const realFetch = globalThis.fetch;
  const usersByToken = options?.usersByToken || new Map<string, MockAuthUserSpec>();
  const capturedWhatsapp = options?.capturedWhatsapp || [];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // 0a. Mock Meta WhatsApp Cloud API /messages
    if (urlStr.includes('graph.facebook.com/') && urlStr.endsWith('/messages')) {
      const payload = JSON.parse(String(init?.body || '{}')) as MetaTemplatePayload;
      const entry = captureMetaCloudDispatch(payload);
      capturedWhatsapp.push(entry);
      return new Response(
        JSON.stringify({
          messaging_product: 'whatsapp',
          messages: [{ id: entry.messageId, message_status: 'sent' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    // 0b. Mock Cloudflare Turnstile CAPTCHA siteverify in tests
    if (urlStr.includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
      const params = new URLSearchParams(String(init?.body || ''));
      const tok = (params.get('response') || '').trim();
      const valid = Boolean(tok) && tok.toLowerCase() !== 'invalid' && tok.toLowerCase() !== 'fail' && tok.length >= 8;
      return new Response(
        JSON.stringify(
          valid ? { success: true } : { success: false, 'error-codes': ['invalid-input-response'] }
        ),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    // 1. Mock Supabase Auth /auth/v1/user for synthetic test tokens
    if (urlStr.includes('/auth/v1/user')) {
      const headers = new Headers(init?.headers || (typeof input !== 'string' && !(input instanceof URL) ? input.headers : undefined));
      const auth = headers.get('authorization') || '';
      const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
      const spec = usersByToken.get(token);
      if (spec) {
        return new Response(
          JSON.stringify({
            id: spec.id,
            email: spec.email,
            email_confirmed_at: spec.emailConfirmed === false ? null : new Date().toISOString(),
            app_metadata: spec.role === 'admin' ? { role: 'admin' } : { role: 'vendor' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (token.startsWith('eyJ')) {
        // Explicit invalid/expired synthetic test token must return 401
        const parsedOwner = [...usersByToken.keys()].length > 0;
        if (parsedOwner && !usersByToken.has(token)) {
          return new Response(JSON.stringify({ error: 'invalid JWT' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
    }

    // 2. Intercept Resend emails so tests never spam external inboxes
    if (urlStr.includes('api.resend.com/emails')) {
      return new Response(JSON.stringify({ id: `email_test_${Date.now()}` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    // 3. Intercept Anchor API during sandbox API tests when needed
    if (urlStr.includes('api.getanchor.co') || urlStr.includes('sandbox.getanchor.co')) {
      if (urlStr.includes('/accounts/') && (!init?.method || init.method.toUpperCase() === 'GET')) {
        return new Response(
          JSON.stringify({
            data: {
              attributes: {
                availableBalance: options?.onAnchorBalanceKobo ?? 0,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            id: `anc_test_${crypto.randomBytes(6).toString('hex')}`,
            attributes: { status: 'COMPLETED' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    return realFetch(input as any, init);
  };

  return {
    usersByToken,
    capturedWhatsapp,
    restore() {
      globalThis.fetch = realFetch;
      clearWhatsappRetryMemoryCacheForTests();
    },
  };
}

/**
 * Performs the REAL two-step WhatsApp OTP -> Signed HttpOnly Buyer Session Cookie flow
 * against POST /api/escrow/buyer-session.
 */
export async function mintBuyerSessionCookieViaApi(params: {
  transactionId: string;
  capturedWhatsapp: CapturedWhatsappDispatch[];
  ipAddress?: string;
}): Promise<{ sessionCookie: string; rawSetCookie: string | null }> {
  const beforeLen = params.capturedWhatsapp.length;
  const ip = params.ipAddress || '198.51.100.40';

  const reqCodeRes = await buyerSessionPost(
    new NextRequest('http://localhost/api/escrow/buyer-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': ip },
      body: JSON.stringify({ transactionId: params.transactionId, action: 'request_code' }),
    })
  );
  const reqCodeJson = await reqCodeRes.json().catch(() => ({}));
  if (!reqCodeRes.ok || !reqCodeJson.success) {
    throw new Error(`buyer-session request_code failed (${reqCodeRes.status}): ${reqCodeJson.error || 'Unknown'}`);
  }

  const challengeCookie = extractSetCookiePair(reqCodeRes, BUYER_OTP_CHALLENGE_COOKIE_NAME);
  if (!challengeCookie.pair) {
    throw new Error('buyer-session request_code did not set HttpOnly challenge cookie');
  }

  const newMsgs = params.capturedWhatsapp.slice(beforeLen);
  const otpMsg = newMsgs.find((m) => m.templateName === 'verification_otp_v1');
  const otpCode = otpMsg?.parameters?.[0];
  if (!otpCode || !/^\d{6}$/.test(otpCode)) {
    throw new Error('Could not capture 6-digit buyer_session OTP from mocked WhatsApp transport');
  }

  const verifyRes = await buyerSessionPost(
    new NextRequest('http://localhost/api/escrow/buyer-session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vercel-forwarded-for': ip,
        cookie: challengeCookie.pair,
      },
      body: JSON.stringify({
        transactionId: params.transactionId,
        action: 'verify_code',
        code: otpCode,
      }),
    })
  );
  const verifyJson = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok || !verifyJson.success) {
    throw new Error(`buyer-session verify_code failed (${verifyRes.status}): ${verifyJson.error || 'Unknown'}`);
  }

  const sessionCookie = extractSetCookiePair(verifyRes, BUYER_SESSION_COOKIE_NAME);
  if (!sessionCookie.pair) {
    throw new Error('buyer-session verify_code did not set HttpOnly session cookie');
  }

  return {
    sessionCookie: sessionCookie.pair,
    rawSetCookie: sessionCookie.rawHeader,
  };
}
