/**
 * Server-Issued Signed HttpOnly Buyer Session & OTP Challenge Engine
 *
 * Properties:
 * - Signed with HMAC-SHA256 (`crypto.timingSafeEqual` verification)
 * - Short-lived (2h session TTL; 10m OTP challenge TTL)
 * - Bound strictly to ONE escrow transaction (`txId`) and the verified buyer WhatsApp number (`phoneHash`)
 * - Minted ONLY after WhatsApp verification (`buyer_phone_verified === true`) and live WhatsApp OTP proof
 * - Delivered exclusively via HttpOnly cookie (never accepted from query params, body, or custom headers)
 */

import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { sendSystemAlert } from '@/lib/alerts';
import {
  isPhoneOnDoNotContact,
  maskWhatsappNumber,
  normalizeWhatsappPhone,
} from '@/lib/whatsapp';

export const BUYER_SESSION_COOKIE_NAME = '__relyvora_buyer_session';
export const BUYER_OTP_CHALLENGE_COOKIE_NAME = '__relyvora_buyer_otp_challenge';
export const BUYER_SESSION_TTL_SECONDS = 2 * 60 * 60; // 2 hours
export const BUYER_OTP_CHALLENGE_TTL_SECONDS = 10 * 60; // 10 minutes
export const MAX_BUYER_OTP_CHALLENGE_ATTEMPTS = 5;

export interface BuyerSessionClaims {
  v: 1;
  role: 'BUYER';
  txId: string;
  phoneHash: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface BuyerOtpChallengeClaims {
  v: 1;
  purpose: 'buyer_session_otp';
  txId: string;
  phoneHash: string;
  otpHash: string;
  nonce: string;
  iat: number;
  exp: number;
}

export interface BuyerSessionVerificationResult {
  present: boolean;
  valid: boolean;
  statusCode: number;
  code?:
    | 'BUYER_SESSION_MISSING'
    | 'BUYER_SESSION_INVALID'
    | 'BUYER_SESSION_EXPIRED'
    | 'BUYER_SESSION_ORDER_MISMATCH'
    | 'BUYER_PHONE_NOT_VERIFIED'
    | 'BUYER_PHONE_CHANGED'
    | 'BUYER_WHATSAPP_OPTED_OUT';
  error?: string;
  claims?: BuyerSessionClaims;
  maskedPhone?: string;
}

function getBuyerSessionHmacKey(): Buffer {
  const explicitSecret = process.env.BUYER_SESSION_SECRET?.trim();
  if (!explicitSecret) {
    void sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'BUYER_SESSION_SECRET Missing (Fail Closed)',
      details: { env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown' },
    }).catch(() => {});
    throw new Error('CRITICAL SECURITY CONFIGURATION ERROR: BUYER_SESSION_SECRET is required.');
  }

  return crypto
    .createHmac('sha256', explicitSecret)
    .update('relyvora:buyer_session_master_v1', 'utf8')
    .digest();
}

export function computeBuyerPhoneBindingHash(phone?: string | null): string {
  if (!phone || !phone.trim()) return '';
  const e164 = normalizeWhatsappPhone(phone) || phone.trim();
  const key = getBuyerSessionHmacKey();
  return crypto.createHmac('sha256', key).update(`buyer_phone:${e164}`, 'utf8').digest('hex');
}

function signPayloadToken<T extends object>(payloadObj: T): string {
  const key = getBuyerSessionHmacKey();
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', key)
    .update(`v1.${payloadB64}`, 'utf8')
    .digest('base64url');
  return `v1.${payloadB64}.${sigB64}`;
}

function verifySignedPayloadToken<T extends object>(token: string): { valid: boolean; payload?: T; expired?: boolean } {
  if (!token || typeof token !== 'string') return { valid: false };
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return { valid: false };

  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return { valid: false };

  try {
    const key = getBuyerSessionHmacKey();
    const expectedSigB64 = crypto
      .createHmac('sha256', key)
      .update(`v1.${payloadB64}`, 'utf8')
      .digest('base64url');

    const providedBuf = Buffer.from(sigB64, 'utf8');
    const expectedBuf = Buffer.from(expectedSigB64, 'utf8');
    if (providedBuf.length === 0 || providedBuf.length !== expectedBuf.length) {
      return { valid: false };
    }
    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return { valid: false };
    }

    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as any;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.exp !== 'number' || typeof parsed.iat !== 'number') {
      return { valid: false };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (parsed.iat > nowSec + 60) {
      return { valid: false };
    }
    if (nowSec > parsed.exp) {
      return { valid: false, expired: true };
    }

    return { valid: true, payload: parsed as T };
  } catch {
    return { valid: false };
  }
}

export function isRequestHttps(request: NextRequest): boolean {
  const forwardedProto = (request.headers.get('x-forwarded-proto') || '').toLowerCase();
  if (forwardedProto === 'https') return true;
  if (request.nextUrl?.protocol === 'https:') return true;
  return false;
}

export function extractCookieValue(request: NextRequest, cookieName: string): string | null {
  try {
    const direct = request.cookies?.get?.(cookieName)?.value;
    if (direct && direct.trim()) return direct.trim();
  } catch {
    // Fallback to raw Cookie header parsing if NextRequest mock omits .cookies
  }

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const segments = cookieHeader.split(';');
  for (const segment of segments) {
    const eqIdx = segment.indexOf('=');
    if (eqIdx === -1) continue;
    const name = segment.slice(0, eqIdx).trim();
    if (name === cookieName) {
      const rawVal = segment.slice(eqIdx + 1).trim();
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }
  return null;
}

export function mintBuyerSessionToken(params: {
  txId: string;
  buyerPhone: string;
  ttlSeconds?: number;
}): { token: string; claims: BuyerSessionClaims; expiresAt: string } {
  const ttl = Math.max(60, Math.min(BUYER_SESSION_TTL_SECONDS, params.ttlSeconds ?? BUYER_SESSION_TTL_SECONDS));
  const nowSec = Math.floor(Date.now() / 1000);
  const claims: BuyerSessionClaims = {
    v: 1,
    role: 'BUYER',
    txId: params.txId,
    phoneHash: computeBuyerPhoneBindingHash(params.buyerPhone),
    jti: crypto.randomBytes(16).toString('hex'),
    iat: nowSec,
    exp: nowSec + ttl,
  };
  return {
    token: signPayloadToken(claims),
    claims,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}

export function attachBuyerSessionCookie(
  response: NextResponse,
  request: NextRequest,
  token: string,
  ttlSeconds: number = BUYER_SESSION_TTL_SECONDS
) {
  response.cookies.set(BUYER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isRequestHttps(request),
    path: '/',
    maxAge: ttlSeconds,
  });
}

export function clearBuyerSessionCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(BUYER_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isRequestHttps(request),
    path: '/',
    maxAge: 0,
  });
}

export function mintBuyerOtpChallengeToken(params: {
  txId: string;
  buyerPhone: string;
  otp: string;
  ttlSeconds?: number;
}): { token: string; claims: BuyerOtpChallengeClaims; expiresAt: string } {
  const ttl = Math.max(60, Math.min(BUYER_OTP_CHALLENGE_TTL_SECONDS, params.ttlSeconds ?? BUYER_OTP_CHALLENGE_TTL_SECONDS));
  const nowSec = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  const phoneHash = computeBuyerPhoneBindingHash(params.buyerPhone);
  const key = getBuyerSessionHmacKey();
  const otpHash = crypto
    .createHmac('sha256', key)
    .update(`buyer_otp:${params.txId}:${phoneHash}:${nonce}:${params.otp.trim()}`, 'utf8')
    .digest('hex');

  const claims: BuyerOtpChallengeClaims = {
    v: 1,
    purpose: 'buyer_session_otp',
    txId: params.txId,
    phoneHash,
    otpHash,
    nonce,
    iat: nowSec,
    exp: nowSec + ttl,
  };

  return {
    token: signPayloadToken(claims),
    claims,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}

export function attachBuyerOtpChallengeCookie(
  response: NextResponse,
  request: NextRequest,
  token: string,
  ttlSeconds: number = BUYER_OTP_CHALLENGE_TTL_SECONDS
) {
  response.cookies.set(BUYER_OTP_CHALLENGE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isRequestHttps(request),
    path: '/',
    maxAge: ttlSeconds,
  });
}

export function clearBuyerOtpChallengeCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(BUYER_OTP_CHALLENGE_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isRequestHttps(request),
    path: '/',
    maxAge: 0,
  });
}

export function verifyBuyerOtpChallengeCookie(
  request: NextRequest,
  params: { txId: string; buyerPhone: string; submittedOtp: string }
): {
  valid: boolean;
  code: string;
  error?: string;
  claims?: BuyerOtpChallengeClaims;
} {
  const raw = extractCookieValue(request, BUYER_OTP_CHALLENGE_COOKIE_NAME);
  if (!raw) {
    return {
      valid: false,
      code: 'CHALLENGE_MISSING',
      error: 'No active WhatsApp sign-in challenge found. Please request a fresh 6-digit code.',
    };
  }

  const verified = verifySignedPayloadToken<BuyerOtpChallengeClaims>(raw);
  if (!verified.valid || !verified.payload) {
    return {
      valid: false,
      code: verified.expired ? 'CHALLENGE_EXPIRED' : 'CHALLENGE_INVALID',
      error: verified.expired
        ? 'Your WhatsApp sign-in code has expired. Please request a new code.'
        : 'Invalid WhatsApp sign-in challenge. Please request a new code.',
    };
  }

  const claims = verified.payload;
  if (claims.v !== 1 || claims.purpose !== 'buyer_session_otp') {
    return { valid: false, code: 'CHALLENGE_INVALID', error: 'Malformed OTP challenge token.' };
  }

  if (claims.txId !== params.txId) {
    return {
      valid: false,
      code: 'CHALLENGE_ORDER_MISMATCH',
      error: 'WhatsApp sign-in code is bound to a different order.',
    };
  }

  const expectedPhoneHash = computeBuyerPhoneBindingHash(params.buyerPhone);
  const phoneBuf = Buffer.from(claims.phoneHash || '', 'utf8');
  const expectedPhoneBuf = Buffer.from(expectedPhoneHash, 'utf8');
  if (
    phoneBuf.length === 0 ||
    phoneBuf.length !== expectedPhoneBuf.length ||
    !crypto.timingSafeEqual(phoneBuf, expectedPhoneBuf)
  ) {
    return {
      valid: false,
      code: 'CHALLENGE_PHONE_MISMATCH',
      error: 'Buyer phone number changed since the code was requested. Please request a new code.',
    };
  }

  const key = getBuyerSessionHmacKey();
  const computedOtpHash = crypto
    .createHmac('sha256', key)
    .update(`buyer_otp:${claims.txId}:${claims.phoneHash}:${claims.nonce}:${params.submittedOtp.trim()}`, 'utf8')
    .digest('hex');

  const computedBuf = Buffer.from(computedOtpHash, 'hex');
  const storedBuf = Buffer.from(claims.otpHash || '', 'hex');
  if (
    computedBuf.length === 0 ||
    computedBuf.length !== storedBuf.length ||
    !crypto.timingSafeEqual(computedBuf, storedBuf)
  ) {
    return {
      valid: false,
      code: 'OTP_INCORRECT',
      error: 'Incorrect 6-digit WhatsApp sign-in code.',
      claims,
    };
  }

  return { valid: true, code: 'OK', claims };
}

export async function verifyBuyerSessionForOrder(
  request: NextRequest,
  tx: {
    id: string;
    buyer_phone?: string | null;
    buyer_phone_verified?: boolean | null;
    whatsapp_blocked?: boolean | null;
  },
  supabaseClient?: SupabaseClient
): Promise<BuyerSessionVerificationResult> {
  const token = extractCookieValue(request, BUYER_SESSION_COOKIE_NAME);
  if (!token) {
    return {
      present: false,
      valid: false,
      statusCode: 401,
      code: 'BUYER_SESSION_MISSING',
      error: 'Buyer WhatsApp session required.',
    };
  }

  const verified = verifySignedPayloadToken<BuyerSessionClaims>(token);
  if (!verified.valid || !verified.payload) {
    return {
      present: true,
      valid: false,
      statusCode: 401,
      code: verified.expired ? 'BUYER_SESSION_EXPIRED' : 'BUYER_SESSION_INVALID',
      error: verified.expired
        ? 'Your buyer session has expired. Verify via WhatsApp OTP again.'
        : 'Invalid buyer session token.',
    };
  }

  const claims = verified.payload;
  if (claims.v !== 1 || claims.role !== 'BUYER' || !claims.txId || !claims.phoneHash) {
    return {
      present: true,
      valid: false,
      statusCode: 401,
      code: 'BUYER_SESSION_INVALID',
      error: 'Malformed buyer session claims.',
    };
  }

  if (claims.txId !== tx.id) {
    return {
      present: true,
      valid: false,
      statusCode: 403,
      code: 'BUYER_SESSION_ORDER_MISMATCH',
      error: 'Forbidden: This buyer session belongs to a different escrow order.',
    };
  }

  if (tx.buyer_phone_verified !== true || tx.whatsapp_blocked === true || !tx.buyer_phone) {
    return {
      present: true,
      valid: false,
      statusCode: 403,
      code: 'BUYER_PHONE_NOT_VERIFIED',
      error: 'Forbidden: Buyer WhatsApp number is not verified or is blocked for this order.',
    };
  }

  const expectedPhoneHash = computeBuyerPhoneBindingHash(tx.buyer_phone);
  const claimPhoneBuf = Buffer.from(claims.phoneHash, 'utf8');
  const expectedPhoneBuf = Buffer.from(expectedPhoneHash, 'utf8');
  if (
    claimPhoneBuf.length === 0 ||
    claimPhoneBuf.length !== expectedPhoneBuf.length ||
    !crypto.timingSafeEqual(claimPhoneBuf, expectedPhoneBuf)
  ) {
    return {
      present: true,
      valid: false,
      statusCode: 403,
      code: 'BUYER_PHONE_CHANGED',
      error: 'Forbidden: Buyer WhatsApp binding does not match the current verified phone.',
    };
  }

  const supabase = supabaseClient || getServiceSupabase();
  const dnc = await isPhoneOnDoNotContact(tx.buyer_phone, supabase as any);
  if (dnc.blocked) {
    return {
      present: true,
      valid: false,
      statusCode: 403,
      code: 'BUYER_WHATSAPP_OPTED_OUT',
      error: 'Forbidden: This WhatsApp number is on the do-not-contact list.',
    };
  }

  return {
    present: true,
    valid: true,
    statusCode: 200,
    claims,
    maskedPhone: maskWhatsappNumber(tx.buyer_phone),
  };
}
