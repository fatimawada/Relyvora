/**
 * Server-side CAPTCHA Verification for Open Vendor Signup
 * Supports Cloudflare Turnstile (TURNSTILE_SECRET_KEY) and hCaptcha (HCAPTCHA_SECRET_KEY).
 * Never bypasses real CAPTCHAs in live/production mode.
 */

export interface CaptchaVerificationResult {
  valid: boolean;
  provider: 'turnstile' | 'hcaptcha' | 'sandbox';
  error?: string;
}

export async function verifyPublicSignupCaptcha(params: {
  token?: string | null;
  remoteIp?: string | null;
}): Promise<CaptchaVerificationResult> {
  const token = String(params.token || '').trim();
  const isProduction =
    process.env.PAYMENTS_MODE === 'live' || process.env.NODE_ENV === 'production';

  if (!token) {
    return {
      valid: false,
      provider: process.env.TURNSTILE_SECRET_KEY
        ? 'turnstile'
        : process.env.HCAPTCHA_SECRET_KEY
          ? 'hcaptcha'
          : 'sandbox',
      error: 'CAPTCHA verification token is required for public vendor signup.',
    };
  }

  const turnstileSecret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (turnstileSecret) {
    try {
      const form = new URLSearchParams();
      form.set('secret', turnstileSecret);
      form.set('response', token);
      if (params.remoteIp) form.set('remoteip', params.remoteIp);

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; 'error-codes'?: string[] };
      if (!res.ok || !json.success) {
        return {
          valid: false,
          provider: 'turnstile',
          error: `Turnstile CAPTCHA verification failed (${(json['error-codes'] || []).join(', ') || 'invalid-token'}).`,
        };
      }
      return { valid: true, provider: 'turnstile' };
    } catch (err: any) {
      return {
        valid: false,
        provider: 'turnstile',
        error: `Turnstile verification service error: ${err?.message || 'network failure'}`,
      };
    }
  }

  const hcaptchaSecret = (process.env.HCAPTCHA_SECRET_KEY || '').trim();
  if (hcaptchaSecret) {
    try {
      const form = new URLSearchParams();
      form.set('secret', hcaptchaSecret);
      form.set('response', token);
      if (params.remoteIp) form.set('remoteip', params.remoteIp);

      const res = await fetch('https://api.hcaptcha.com/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; 'error-codes'?: string[] };
      if (!res.ok || !json.success) {
        return {
          valid: false,
          provider: 'hcaptcha',
          error: `hCaptcha verification failed (${(json['error-codes'] || []).join(', ') || 'invalid-token'}).`,
        };
      }
      return { valid: true, provider: 'hcaptcha' };
    } catch (err: any) {
      return {
        valid: false,
        provider: 'hcaptcha',
        error: `hCaptcha verification service error: ${err?.message || 'network failure'}`,
      };
    }
  }

  if (isProduction) {
    return {
      valid: false,
      provider: 'turnstile',
      error: 'Server CAPTCHA verification secret (TURNSTILE_SECRET_KEY or HCAPTCHA_SECRET_KEY) is not configured in production.',
    };
  }

  // Non-production staging/sandbox mode when no external CAPTCHA secret is configured:
  // still require an explicit non-empty challenge token and reject explicit invalid test markers.
  if (token.toLowerCase() === 'invalid' || token.toLowerCase() === 'fail' || token.length < 8) {
    return {
      valid: false,
      provider: 'sandbox',
      error: 'Invalid or expired CAPTCHA challenge token.',
    };
  }

  return { valid: true, provider: 'sandbox' };
}
