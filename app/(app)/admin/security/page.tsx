'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ArrowRight,
  Copy,
  Check,
  Lock,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { TurnstileWidget } from '@/components/common/TurnstileWidget';
import { supabase } from '@/lib/supabase';

interface ServerSecurityState {
  authorized: boolean;
  statusCode: number;
  code?: string;
  error?: string;
  user?: {
    id: string;
    email: string;
  };
  aal?: string;
  mfaEnrolled?: boolean;
  aal2Verified?: boolean;
}

interface TotpFactorSummary {
  id: string;
  friendly_name?: string;
  status: string;
  created_at?: string;
}

export default function AdminSecurityPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Auth & MFA state
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [serverState, setServerState] = useState<ServerSecurityState | null>(null);
  const [currentAal, setCurrentAal] = useState<string>('aal1');
  const [nextAal, setNextAal] = useState<string>('aal1');
  const [verifiedFactors, setVerifiedFactors] = useState<TotpFactorSummary[]>([]);

  // Sign-in form (when unauthenticated)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginCaptchaToken, setLoginCaptchaToken] = useState('');
  const [loginCaptchaResetKey, setLoginCaptchaResetKey] = useState(0);
  const turnstileSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();

  // TOTP enrollment state
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  // OTP verification code input
  const [otpCode, setOtpCode] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

  const loadSecurityStatus = useCallback(async () => {
    setLoading(true);
    setStatusError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (!session?.access_token) {
        setSessionEmail(null);
        setServerState(null);
        setCurrentAal('aal1');
        setNextAal('aal1');
        setVerifiedFactors([]);
        return;
      }

      setSessionEmail(session.user?.email || null);

      const [aalRes, factorsRes, apiRes] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
        fetch('/api/admin/security', {
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
      ]);

      const aalCurrent = aalRes.data?.currentLevel || 'aal1';
      const aalNext = aalRes.data?.nextLevel || 'aal1';
      setCurrentAal(aalCurrent);
      setNextAal(aalNext);

      const verifiedList: TotpFactorSummary[] = (factorsRes.data?.totp || []).filter(
        (f: any) => f.status === 'verified'
      );
      setVerifiedFactors(verifiedList);

      const apiJson = await apiRes.json().catch(() => ({}));
      setServerState({
        authorized: Boolean(apiRes.ok && apiJson.authorized),
        statusCode: apiRes.status,
        code: apiJson.code,
        error: apiJson.error,
        user: apiJson.user,
        aal: apiJson.aal || aalCurrent,
        mfaEnrolled:
          typeof apiJson.mfaEnrolled === 'boolean'
            ? apiJson.mfaEnrolled
            : verifiedList.length > 0,
        aal2Verified: Boolean(apiJson.aal2Verified),
      });
    } catch (err: any) {
      setStatusError(err?.message || 'Unable to verify admin security session.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSecurityStatus();
  }, [loadSecurityStatus]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusError(null);
    setStatusSuccess(null);
    if (turnstileSiteKey && !loginCaptchaToken.trim()) {
      setStatusError('Please complete the Cloudflare Turnstile verification check before signing in.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: loginCaptchaToken.trim()
          ? { captchaToken: loginCaptchaToken.trim() }
          : undefined,
      });
      if (error) {
        setStatusError(error.message);
        setLoginCaptchaToken('');
        setLoginCaptchaResetKey((k) => k + 1);
        return;
      }
      setPassword('');
      setLoginCaptchaToken('');
      await loadSecurityStatus();
    } catch (err: any) {
      setStatusError(err?.message || 'Sign-in failed.');
      setLoginCaptchaToken('');
      setLoginCaptchaResetKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const handleStartEnrollment = async () => {
    setBusy(true);
    setStatusError(null);
    setStatusSuccess(null);
    try {
      // Remove any leftover unverified TOTP factors so enrollment never collides
      const { data: existingFactors } = await supabase.auth.mfa.listFactors();
      const unverifiedTotp = (existingFactors?.all || []).filter(
        (f: any) => f.factor_type === 'totp' && f.status === 'unverified'
      );
      for (const factor of unverifiedTotp) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Relyvora Admin (${new Date().toISOString().slice(0, 10)})`,
      });

      if (error || !data) {
        setStatusError(error?.message || 'Failed to start TOTP enrollment.');
        return;
      }

      setEnrollFactorId(data.id);
      setQrCodeSvg(data.totp.qr_code);
      setTotpSecret(data.totp.secret);
      setOtpCode('');
    } catch (err: any) {
      setStatusError(err?.message || 'Unexpected error starting MFA enrollment.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollFactorId) return;

    const cleanCode = otpCode.replace(/\s+/g, '');
    if (cleanCode.length !== 6) {
      setStatusError('Enter the 6-digit code shown in your authenticator app.');
      return;
    }

    setBusy(true);
    setStatusError(null);
    setStatusSuccess(null);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollFactorId,
        code: cleanCode,
      });

      if (error) {
        setStatusError(error.message || 'Verification code invalid or expired. Try again.');
        return;
      }

      await supabase.auth.refreshSession();
      setEnrollFactorId(null);
      setQrCodeSvg(null);
      setTotpSecret(null);
      setOtpCode('');
      setStatusSuccess('TOTP MFA enrolled and verified. Admin session upgraded to AAL2.');
      await loadSecurityStatus();
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to verify TOTP enrollment.');
    } finally {
      setBusy(false);
    }
  };

  const handleElevateAal2 = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetFactor = verifiedFactors[0];
    if (!targetFactor) {
      setStatusError('No verified TOTP factor found. Enroll one first.');
      return;
    }

    const cleanCode = otpCode.replace(/\s+/g, '');
    if (cleanCode.length !== 6) {
      setStatusError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setBusy(true);
    setStatusError(null);
    setStatusSuccess(null);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: targetFactor.id,
        code: cleanCode,
      });

      if (error) {
        setStatusError(error.message || 'Invalid TOTP verification code.');
        return;
      }

      await supabase.auth.refreshSession();
      setOtpCode('');
      setStatusSuccess('Session verified at AAL2. Admin access unlocked.');
      await loadSecurityStatus();
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to verify AAL2 challenge.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopySecret = async () => {
    if (!totpSecret) return;
    await navigator.clipboard.writeText(totpSecret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  };

  const handleSignOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    setEnrollFactorId(null);
    setQrCodeSvg(null);
    setTotpSecret(null);
    setOtpCode('');
    setStatusSuccess(null);
    setStatusError(null);
    await loadSecurityStatus();
    setBusy(false);
  };

  const isAllowlistedAdmin = Boolean(serverState?.authorized);
  const isMfaEnrolled = verifiedFactors.length > 0 || Boolean(serverState?.mfaEnrolled);
  const isAal2Active =
    isAllowlistedAdmin &&
    isMfaEnrolled &&
    (serverState?.aal === 'aal2' || currentAal === 'aal2');

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 w-full space-y-6 font-sans text-main">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface border border-border text-muted">
              Admin Security & MFA
            </span>
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-tight text-main">
            Administrator TOTP Authentication
          </h1>
          <p className="text-sm text-muted">
            Every administrator page and API endpoint requires an allowlisted account verified at AAL2.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={loadSecurityStatus}
            disabled={loading || busy}
            className="px-3.5 py-2 rounded-btn bg-surface hover:opacity-90 border border-border text-main text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {sessionEmail && (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className="px-3.5 py-2 rounded-btn bg-surface hover:opacity-90 border border-border text-main text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback alerts */}
      {statusError && (
        <div className="p-4 rounded-card bg-rose-500/10 border border-rose-500/30 text-rose-700 text-sm flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{statusError}</span>
        </div>
      )}

      {statusSuccess && (
        <div className="p-4 rounded-card bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{statusSuccess}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-surface border border-border rounded-card p-8 text-center text-sm text-muted">
          Checking administrator session and MFA assurance level...
        </div>
      ) : !sessionEmail ? (
        /* Unauthenticated: Admin Sign-In */
        <div className="bg-surface border border-border rounded-card p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-accent" />
            <h2 className="font-heading text-xl font-semibold text-main">
              Sign in as Administrator
            </h2>
          </div>
          <p className="text-sm text-muted">
            Sign in with your confirmed Relyvora admin email and password to enrol or verify your TOTP authenticator.
          </p>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="block text-xs font-semibold text-main">
                Admin Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@relyvora.com"
                className="w-full px-3.5 py-2.5 rounded-btn bg-site border border-border text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="block text-xs font-semibold text-main">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3.5 py-2.5 rounded-btn bg-site border border-border text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              resetKey={loginCaptchaResetKey}
              onVerify={(token) => {
                setLoginCaptchaToken(token);
                setStatusError(null);
              }}
              onExpire={() => setLoginCaptchaToken('')}
            />
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 rounded-btn bg-accent text-accent-contrast text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Signing in...' : 'Continue to MFA Check'}
            </button>
          </form>
        </div>
      ) : !isAllowlistedAdmin ? (
        /* Authenticated but failed role / email confirmation / ADMIN_USER_IDS allowlist */
        <div className="bg-surface border border-rose-500/30 rounded-card p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2.5 text-rose-700">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h2 className="font-heading text-xl font-semibold">Admin Access Denied</h2>
          </div>
          <p className="text-sm text-main">
            Signed in as <strong>{sessionEmail}</strong>, but this account does not meet administrator requirements.
          </p>
          <p className="text-xs text-muted">
            {serverState?.error ||
              'Administrator access requires a confirmed email, app_metadata.role = "admin", and membership in ADMIN_USER_IDS.'}
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="px-4 py-2 rounded-btn bg-site border border-border text-sm font-semibold text-main cursor-pointer"
          >
            Sign in with a different account
          </button>
        </div>
      ) : isAal2Active ? (
        /* Confirmed: Enrolled + AAL2 Active */
        <div className="bg-surface border border-emerald-500/40 rounded-card p-6 sm:p-8 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-700">
                <ShieldCheck className="w-6 h-6" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Verified AAL2 Session
                </span>
              </div>
              <h2 className="font-heading text-xl font-semibold text-main">
                TOTP Multi-Factor Authentication Confirmed
              </h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
              AAL2 Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-site p-4 rounded-btn border border-border">
            <div>
              <div className="text-xs text-muted">Allowlisted Admin</div>
              <div className="font-medium text-main break-all">{serverState?.user?.email || sessionEmail}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Enrolled TOTP Factors</div>
              <div className="font-medium text-main">
                {verifiedFactors.length} verified ({verifiedFactors[0]?.friendly_name || 'Authenticator'})
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Session Assurance Level</div>
              <div className="font-medium text-main">
                current: {serverState?.aal || currentAal} / next: {nextAal}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Admin User ID</div>
              <div className="font-medium text-main break-all">{serverState?.user?.id}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/admin/disputes"
              className="px-5 py-2.5 rounded-btn bg-accent text-accent-contrast text-sm font-semibold inline-flex items-center gap-2"
            >
              <span>Open Admin Disputes Console</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : !isMfaEnrolled ? (
        /* Enrollment Flow: No verified TOTP factor yet */
        <div className="bg-surface border border-border rounded-card p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-amber-700">
              <KeyRound className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                MFA Enrollment Required ({serverState?.aal || currentAal})
              </span>
            </div>
            <h2 className="font-heading text-xl font-semibold text-main">
              Enroll a TOTP Authenticator App
            </h2>
            <p className="text-sm text-muted">
              Signed in as <strong>{sessionEmail}</strong>. Your account is allowlisted, but TOTP MFA is not yet enrolled. Complete enrollment below to reach AAL2.
            </p>
          </div>

          {!qrCodeSvg ? (
            <button
              type="button"
              onClick={handleStartEnrollment}
              disabled={busy}
              className="px-5 py-2.5 rounded-btn bg-accent text-accent-contrast text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Generating QR Code...' : 'Generate TOTP QR Code'}
            </button>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row items-start gap-6">
                <div className="bg-white p-3 rounded-btn border border-border shrink-0">
                  <img
                    src={qrCodeSvg}
                    alt="Scan this QR code in your authenticator app"
                    className="w-44 h-44"
                  />
                </div>
                <div className="space-y-3 flex-1">
                  <p className="text-sm text-main font-medium">
                    1. Scan the QR code with Google Authenticator, 1Password, or Authy.
                  </p>
                  <p className="text-xs text-muted">
                    Or enter the setup secret key manually:
                  </p>
                  {totpSecret && (
                    <div className="flex items-center gap-2 bg-site border border-border rounded-btn px-3 py-2">
                      <code className="text-xs text-main break-all select-all flex-1">
                        {totpSecret}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        className="text-xs font-semibold text-accent inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {secretCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{secretCopied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleVerifyEnrollment} className="space-y-3 pt-2 border-t border-border">
                <label htmlFor="totp-enroll-code" className="block text-sm font-medium text-main">
                  2. Enter the 6-digit code from your authenticator app to confirm enrollment
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="totp-enroll-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="w-full sm:w-48 px-4 py-2.5 rounded-btn bg-site border border-border text-base tracking-widest text-main focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <button
                    type="submit"
                    disabled={busy || otpCode.length !== 6}
                    className="px-5 py-2.5 rounded-btn bg-accent text-accent-contrast text-sm font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {busy ? 'Verifying...' : 'Verify & Confirm Enrollment'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : (
        /* Step-up Verification: Factor enrolled, current session is still AAL1 */
        <div className="bg-surface border border-border rounded-card p-6 sm:p-8 space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-amber-700">
              <KeyRound className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                AAL2 Step-Up Required (Currently AAL1)
              </span>
            </div>
            <h2 className="font-heading text-xl font-semibold text-main">
              Verify Your TOTP Code
            </h2>
            <p className="text-sm text-muted">
              Signed in as <strong>{sessionEmail}</strong>. Your authenticator app is enrolled, but this session must be elevated to AAL2 before you can access admin operations.
            </p>
          </div>

          <form onSubmit={handleElevateAal2} className="space-y-3">
            <label htmlFor="totp-stepup-code" className="block text-sm font-medium text-main">
              6-digit Authenticator Code
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="totp-stepup-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full sm:w-48 px-4 py-2.5 rounded-btn bg-site border border-border text-base tracking-widest text-main focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={busy || otpCode.length !== 6}
                className="px-5 py-2.5 rounded-btn bg-accent text-accent-contrast text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Verifying...' : 'Unlock Admin Session (AAL2)'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
