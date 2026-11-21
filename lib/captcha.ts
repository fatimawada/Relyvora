/**
 * Server-side CAPTCHA Verification for Open Vendor Signup
 * Supports Cloudflare Turnstile (TURNSTILE_SECRET_KEY) and hCaptcha (HCAPTCHA_SECRET_KEY).
 * Never bypasses real CAPTCHAs in live/production mode.
 */

export interface CaptchaVerificationResult {
  valid: boolean;
  provider: 'turnstile' | 'hcaptcha';
  error?: string;
}

export async function verifyPublicSignupCaptcha(params: {
  token?: string | null;
  remoteIp?: string | null;
}): Promise<CaptchaVerificationResult> {
  const token = String(params.token || '').trim();
  const provider: 'turnstile' | 'hcaptcha' = process.env.HCAPTCHA_SECRET_KEY && !process.env.TURNSTILE_SECRET_KEY
    ? 'hcaptcha'
    : 'turnstile';

  if (!token) {
    return {
      valid: false,
      provider,
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

  return {
    valid: false,
    provider,
    error: 'Server CAPTCHA verification secret (TURNSTILE_SECRET_KEY or HCAPTCHA_SECRET_KEY) is not configured.',
  };
}
