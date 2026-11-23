'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  supabase,
  getTransactions,
} from '@/lib/supabase';
import { Transaction } from '@/lib/types';
import { calculatePricing, formatNaira, MINIMUM_PROTECTION_FEE } from '@/lib/pricing';
import { StatusBadge } from '@/components/StatusBadge';
import { TurnstileWidget } from '@/components/common/TurnstileWidget';
import { Logo } from '@/components/brand/Logo';
import type { VendorGateSnapshot } from '@/lib/launchGates';
import {
  ShieldCheck,
  Copy,
  Check,
  Lock,
  Package,
  ArrowUpRight,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Info,
  Truck,
  XCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  KeyRound,
  Mail,
  Loader2,
} from 'lucide-react';

interface VendorStatusApiPayload {
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    emailConfirmed: boolean;
    storeName: string | null;
    phoneNumber: string | null;
  };
  vendor?: {
    id: string;
    storeName: string;
    email: string;
    phoneNumber: string | null;
    phoneVerified: boolean;
    kycStatus: string;
    payoutAccountVerified: boolean;
    settlementAccountNameMatched: boolean;
    settlementAccountMasked: string | null;
    isAllowlisted: boolean;
    isSuspended: boolean;
  } | null;
  waitlistRecorded?: boolean;
  gates?: VendorGateSnapshot;
}

function getOrderPlainSummary(tx: Transaction): { statusLabel: string; nextStep: string } {
  switch (tx.status) {
    case 'AWAITING_PAYMENT':
      return {
        statusLabel: 'Waiting for payment',
        nextStep: tx.buyer_phone_verified
          ? 'Buyer confirmed WhatsApp and can now transfer.'
          : 'Waiting for buyer to confirm link and pay.',
      };
    case 'PARTIALLY_FUNDED':
      return {
        statusLabel: 'Part payment received',
        nextStep: 'Waiting for buyer to pay the remaining balance.',
      };
    case 'FUNDS_LOCKED':
      return {
        statusLabel: 'Paid into escrow',
        nextStep: 'Pack the item, ship to buyer, and upload dispatch details.',
      };
    case 'DISPATCHED':
      return {
        statusLabel: 'Out for delivery',
        nextStep: 'Collect the 6-digit release code after buyer checks the item.',
      };
    case 'RELEASING':
    case 'VENDOR_PAID':
      return {
        statusLabel: 'Payout in progress',
        nextStep: 'Settlement transfer to your bank is running.',
      };
    case 'RELEASED':
      return {
        statusLabel: 'Completed',
        nextStep: 'Paid out to your settlement bank account.',
      };
    case 'DISPUTED':
    case 'RESOLVING':
      return {
        statusLabel: 'In dispute',
        nextStep: 'Open the order page to reply and upload any evidence.',
      };
    case 'REFUNDED':
      return {
        statusLabel: 'Refunded',
        nextStep: 'Closed. Buyer was refunded.',
      };
    case 'CANCELLED':
      return {
        statusLabel: 'Cancelled',
        nextStep: 'Closed. Order was cancelled.',
      };
    case 'EXPIRED':
      return {
        statusLabel: 'Link expired',
        nextStep: 'Closed. Create a new link if the buyer still wants the item.',
      };
    default:
      return {
        statusLabel: String(tx.status),
        nextStep: 'Open order details to review status.',
      };
  }
}

export interface VendorPortalClientProps {
  initialGates: VendorGateSnapshot;
}

export function VendorPortalClient({ initialGates }: VendorPortalClientProps) {
  const [gates, setGates] = useState<VendorGateSnapshot>(initialGates);
  const [vendorStatus, setVendorStatus] = useState<VendorStatusApiPayload | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Auth states (logged-out sign-in uses 6-digit email OTP by default)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPhase, setLoginPhase] = useState<'email' | 'otp'>('email');
  const [loginOtpCode, setLoginOtpCode] = useState('');
  const [loginCaptchaToken, setLoginCaptchaToken] = useState('');
  const [loginCaptchaResetKey, setLoginCaptchaResetKey] = useState(0);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [loginNeedsSignup, setLoginNeedsSignup] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  // Create Payment Link state (only rendered when all 4 Option B live gates pass)
  const [isCreateLinkOpen, setIsCreateLinkOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemPriceInput, setItemPriceInput] = useState('');
  const [deliveryType, setDeliveryType] = useState<'same_city' | 'interstate'>('same_city');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerWhatsappConsent, setBuyerWhatsappConsent] = useState(false);
  const [buyerNotes, setBuyerNotes] = useState('');
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [generatedTx, setGeneratedTx] = useState<Transaction | null>(null);
  const [whatsappNotice, setWhatsappNotice] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const turnstileSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();

  const pricing = useMemo(() => {
    return calculatePricing(itemPriceInput);
  }, [itemPriceInput]);

  const getVendorAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const refreshVendorPortal = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      const accessToken = sessionData?.session?.access_token || null;
      const email = user?.email?.trim().toLowerCase() || null;

      const statusRes = await fetch('/api/vendor/status', {
        cache: 'no-store',
        credentials: 'include',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      }).catch(() => null);

      const statusJson = (statusRes ? await statusRes.json().catch(() => null) : null) as
        | VendorStatusApiPayload
        | null;

      if (statusJson?.gates) {
        setGates(statusJson.gates);
      }

      if (email && accessToken) {
        setSessionEmail(email);
        setVendorStatus(statusJson);
        const { data } = await getTransactions();
        setTransactions(data || []);
      } else {
        setSessionEmail(null);
        setVendorStatus(null);
        setTransactions([]);
        setIsCreateLinkOpen(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshVendorPortal();
  }, [refreshVendorPortal]);

  const handleSendOtpCode = async (e?: React.FormEvent, asFallbackMagicLink = false) => {
    if (e) e.preventDefault();
    setLoginError(null);
    setLoginNotice(null);
    setLoginNeedsSignup(false);

    const targetEmail = loginEmail.trim().toLowerCase();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setLoginError('Enter a valid email address.');
      return;
    }

    if (turnstileSiteKey && !loginCaptchaToken.trim()) {
      setLoginError('Security check is still finishing. Please try again in a moment.');
      return;
    }

    setIsSendingCode(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          ...(loginCaptchaToken.trim() ? { captchaToken: loginCaptchaToken.trim() } : {}),
        },
      });

      setLoginCaptchaToken('');
      setLoginCaptchaResetKey((k) => k + 1);

      if (error) {
        if (/signups not allowed|user not found/i.test(error.message || '')) {
          setLoginNeedsSignup(true);
          setLoginError('No vendor account found for that email. Create a vendor account first.');
        } else {
          setLoginError(error.message || 'Could not send sign-in code. Please try again.');
        }
        return;
      }

      setLoginEmail(targetEmail);
      setLoginOtpCode('');
      setLoginPhase('otp');
      if (asFallbackMagicLink) {
        setLoginNotice(`We sent a sign-in link and fresh code to ${targetEmail}. Open the link in your email if you prefer not to enter the code.`);
      } else {
        setLoginNotice(`We sent a 6-digit code to ${targetEmail}.`);
      }
    } catch {
      setLoginError('Network error while sending code. Please try again.');
      setLoginCaptchaToken('');
      setLoginCaptchaResetKey((k) => k + 1);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyOtpCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginNotice(null);

    const cleanCode = loginOtpCode.replace(/\D/g, '').trim();
    if (cleanCode.length !== 6) {
      setLoginError('Enter the 6-digit code from your email.');
      return;
    }

    setIsVerifyingCode(true);
    try {
      const targetEmail = loginEmail.trim().toLowerCase();
      let res = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: cleanCode,
        type: 'email',
      });

      if (res.error) {
        const signupFallback = await supabase.auth.verifyOtp({
          email: targetEmail,
          token: cleanCode,
          type: 'signup',
        });
        if (!signupFallback.error && signupFallback.data?.session) {
          res = signupFallback;
        }
      }

      if (res.error || !res.data?.session) {
        setLoginError('That 6-digit code is invalid or has expired. Tap "Send a new code" to get a fresh one.');
        return;
      }

      setLoginOtpCode('');
      setLoginPhase('email');
      await refreshVendorPortal();
    } catch {
      setLoginError('Unable to verify that code. Send a new code and try again.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleVendorSignOut = async () => {
    await supabase.auth.signOut();
    setSessionEmail(null);
    setVendorStatus(null);
    setTransactions([]);
    setGeneratedTx(null);
    setIsCreateLinkOpen(false);
    setLoginPhase('email');
    setLoginOtpCode('');
    setLoginError(null);
    setLoginNotice(null);
  };

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gates.canCreateLinks) return;
    if (!itemName.trim() || pricing.itemPrice <= 0) return;

    setIsSubmittingLink(true);
    setLinkError(null);
    setWhatsappNotice(null);
    try {
      const authHeaders = await getVendorAuthHeaders();
      const res = await fetch('/api/escrow/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          itemName: itemName.trim(),
          itemPrice: pricing.itemPrice,
          deliveryFee: pricing.deliveryFee,
          deliveryType,
          buyerPhone: buyerPhone.trim() || null,
          buyerWhatsappConsent,
          buyerNotes: buyerNotes.trim() || null,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.transaction) {
        setGeneratedTx(json.transaction);
        setBuyerWhatsappConsent(false);
        setItemName('');
        setItemPriceInput('');
        setBuyerPhone('');
        setBuyerNotes('');
        if (json.whatsapp_error) {
          setWhatsappNotice(json.whatsapp_error);
        }
        await refreshVendorPortal();
      } else {
        setLinkError(json.error || 'Could not create payment link.');
      }
    } catch (err: any) {
      setLinkError(err?.message || 'Network error while creating payment link.');
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const handleCancelOrder = async (tx: Transaction) => {
    if (!gates.canCreateLinks) return;
    const reason = window.prompt(
      `Cancel order "${tx.item_name}" before dispatch? Enter a short reason (min 3 characters):`,
      'Out of stock'
    );
    if (!reason || reason.trim().length < 3) return;

    setCancellingId(tx.id);
    setActionFeedback(null);
    try {
      const authHeaders = await getVendorAuthHeaders();
      const res = await fetch('/api/escrow/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          transactionId: tx.id,
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setActionFeedback(json.error || 'Could not cancel order.');
      } else {
        await refreshVendorPortal();
      }
    } catch (err: any) {
      setActionFeedback(err?.message || 'Network error cancelling order.');
    } finally {
      setCancellingId(null);
    }
  };

  const getPayUrl = (id: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/pay/${id}`;
    }
    return `/pay/${id}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Initial check while determining auth session
  if (isLoading && !sessionEmail) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3 w-full">
        <Loader2 className="w-7 h-7 animate-spin text-accent mx-auto" />
        <p className="text-xs sm:text-sm text-muted">Checking your session...</p>
      </div>
    );
  }

  // LOGGED-OUT VIEW: Sign-in card ONLY (no order form, no transactions list, no bank rails, no payment actions)
  if (!sessionEmail) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 sm:py-16 w-full">
        <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 shadow-card space-y-6">
          <div className="space-y-2 text-center">
            <div className="flex justify-center pb-1">
              <Logo variant="full" height={34} withLink={false} />
            </div>
            <h1 className="text-xl font-heading font-bold text-main tracking-tight">
              Vendor sign in
            </h1>
            <p className="text-xs sm:text-sm text-muted">
              Enter your store email and we will send you a six-digit sign-in code.
            </p>
          </div>

          {loginError && (
            <div role="status" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
              {loginNeedsSignup && (
                <div>
                  <Link href="/vendor/onboarding" className="font-bold text-accent hover:underline">
                    Create a vendor account
                  </Link>
                </div>
              )}
            </div>
          )}

          {loginNotice && (
            <div role="status" className="p-3.5 rounded-xl bg-accent/10 border border-accent/25 text-xs text-main">
              {loginNotice}
            </div>
          )}

          {loginPhase === 'email' ? (
            <form onSubmit={(e) => handleSendOtpCode(e, false)} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="vendor-signin-email" className="block text-xs font-semibold text-main">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="vendor-signin-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@yourstore.com"
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      if (loginError) setLoginError(null);
                    }}
                    className="w-full bg-site border border-border rounded-xl pl-10 pr-3.5 py-3 text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:border-accent focus:ring-accent/20"
                  />
                </div>
              </div>

              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetKey={loginCaptchaResetKey}
                theme="light"
                appearance="interaction-only"
                onVerify={(token) => {
                  setLoginCaptchaToken(token);
                  setLoginError(null);
                }}
                onExpire={() => setLoginCaptchaToken('')}
              />

              <button
                type="submit"
                disabled={isSendingCode}
                className="w-full py-3.5 px-4 rounded-xl bg-accent hover:opacity-90 text-white font-bold text-sm cursor-pointer disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 shadow-card"
              >
                {isSendingCode ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending code...</span>
                  </>
                ) : (
                  <span>Send me a code</span>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtpCode} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="vendor-signin-otp" className="block text-xs font-semibold text-main">
                  6-digit email code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="vendor-signin-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    value={loginOtpCode}
                    onChange={(e) => {
                      setLoginOtpCode(e.target.value.replace(/\D/g, ''));
                      setLoginError(null);
                    }}
                    className="w-full bg-site border border-border rounded-xl pl-10 pr-3.5 py-3 text-center text-lg font-heading tabular-nums font-bold tracking-[0.25em] text-main placeholder:text-sm placeholder:font-sans placeholder:tracking-normal placeholder:font-normal placeholder:text-muted focus:outline-none focus:ring-2 focus:border-accent focus:ring-accent/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifyingCode || loginOtpCode.trim().length !== 6}
                className="w-full py-3.5 px-4 rounded-xl bg-accent hover:opacity-90 text-white font-bold text-sm cursor-pointer disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 shadow-card"
              >
                {isVerifyingCode ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Verify code</span>
                )}
              </button>

              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetKey={loginCaptchaResetKey}
                theme="light"
                appearance="interaction-only"
                onVerify={(token) => setLoginCaptchaToken(token)}
                onExpire={() => setLoginCaptchaToken('')}
              />

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 text-xs">
                <button
                  type="button"
                  disabled={isSendingCode}
                  onClick={() => handleSendOtpCode(undefined, false)}
                  className="font-semibold text-accent hover:underline cursor-pointer disabled:opacity-50"
                >
                  {isSendingCode ? 'Sending...' : 'Send a new code'}
                </button>
                <button
                  type="button"
                  disabled={isSendingCode}
                  onClick={() => handleSendOtpCode(undefined, true)}
                  className="text-muted hover:text-main hover:underline cursor-pointer disabled:opacity-50"
                >
                  Send a sign-in link instead
                </button>
              </div>

              <div className="text-center pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setLoginPhase('email');
                    setLoginOtpCode('');
                    setLoginError(null);
                    setLoginNotice(null);
                  }}
                  className="text-xs text-muted hover:text-main cursor-pointer"
                >
                  Use a different email
                </button>
              </div>
            </form>
          )}

          <div className="pt-3 border-t border-border text-center text-xs text-muted">
            New vendor?{' '}
            <Link href="/vendor/onboarding" className="font-semibold text-accent hover:underline">
              Create your account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // SIGNED-IN VENDOR DASHBOARD
  const storeName =
    vendorStatus?.vendor?.storeName ||
    vendorStatus?.user?.storeName ||
    sessionEmail;
  const avatarInitials = storeName.replace('@', '').slice(0, 2).toUpperCase() || 'RV';
  const kycStatusRaw = vendorStatus?.vendor?.kycStatus || 'pending';
  const kycVerified = kycStatusRaw === 'verified';
  const payoutReady = Boolean(
    vendorStatus?.vendor?.payoutAccountVerified &&
      vendorStatus?.vendor?.settlementAccountNameMatched
  );
  const whatsappConfirmed = Boolean(vendorStatus?.vendor?.phoneVerified);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 w-full">
      {/* Header & Store Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-5 sm:p-6 rounded-3xl border border-border shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-accent text-white flex items-center justify-center font-bold text-lg shadow-xs shrink-0">
            {avatarInitials}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                {storeName}
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  kycVerified
                    ? 'bg-accent/10 text-accent border-accent/20'
                    : 'bg-site text-muted border-border'
                }`}
              >
                {kycVerified ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-accent" />
                    <span>Verified vendor</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3 text-muted" />
                    <span>{vendorStatus?.waitlistRecorded ? 'Waitlisted' : 'Pending'}</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted mt-0.5">{sessionEmail}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshVendorPortal}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-semibold text-main bg-site hover:bg-border/40 rounded-xl transition-colors flex items-center gap-1.5 border border-border cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleVendorSignOut}
            className="px-3 py-2 text-xs font-semibold text-muted hover:text-main bg-site rounded-xl border border-border cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Vendor Status Panel (KYC, Payout Account, WhatsApp Confirmation) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. KYC */}
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Identity (KYC)</span>
            {kycVerified ? (
              <CheckCircle2 className="w-4 h-4 text-accent" />
            ) : !gates.kycEnabled ? (
              <Lock className="w-4 h-4 text-muted" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div className="text-sm font-heading font-semibold text-main">
            {kycVerified
              ? 'Verified'
              : !gates.kycEnabled
                ? 'Locked until launch'
                : 'Verification needed'}
          </div>
          <p className="text-xs text-muted leading-snug">
            {kycVerified
              ? 'Your identity details are verified.'
              : !gates.kycEnabled
                ? 'Verification opens when payments go live.'
                : 'Complete KYC to unlock link creation.'}
          </p>
          {!kycVerified && gates.kycEnabled && (
            <Link href="/vendor/onboarding?step=2" className="inline-block text-xs font-semibold text-accent hover:underline pt-1">
              Continue verification
            </Link>
          )}
        </div>

        {/* 2. Payout Account */}
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Payout account</span>
            {payoutReady ? (
              <CheckCircle2 className="w-4 h-4 text-accent" />
            ) : (
              <Clock className="w-4 h-4 text-muted" />
            )}
          </div>
          <div className="text-sm font-heading font-semibold text-main">
            {payoutReady
              ? vendorStatus?.vendor?.settlementAccountMasked || 'Bank account confirmed'
              : !gates.kycEnabled
                ? 'Opens with verification'
                : 'Not set up'}
          </div>
          <p className="text-xs text-muted leading-snug">
            {payoutReady
              ? 'Name-matched settlement account on file.'
              : 'Your payout bank account is added when verification opens.'}
          </p>
        </div>

        {/* 3. WhatsApp Confirmation */}
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">WhatsApp confirmation</span>
            {whatsappConfirmed ? (
              <CheckCircle2 className="w-4 h-4 text-accent" />
            ) : (
              <MessageCircle className="w-4 h-4 text-muted" />
            )}
          </div>
          <div className="text-sm font-heading font-semibold text-main">
            {whatsappConfirmed
              ? 'Confirmed'
              : !gates.releaseCodeTemplateApproved
                ? 'Pending approval'
                : 'Pending confirmation'}
          </div>
          <p className="text-xs text-muted leading-snug">
            {whatsappConfirmed
              ? 'WhatsApp number confirmed for order updates.'
              : 'WhatsApp confirmation opens once message templates are approved.'}
          </p>
        </div>
      </div>

      {/* Primary Action Card: "Create payment link" (or calm "Payments open soon" gated state) */}
      <div className="bg-surface p-5 sm:p-6 rounded-3xl border border-border shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            {!gates.canCreateLinks ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Payments open soon</span>
                </span>
                <h2 className="text-lg font-heading font-semibold text-main pt-1">
                  Payment links are not active yet
                </h2>
                <p className="text-xs sm:text-sm text-muted max-w-xl">
                  {gates.kycEnabled && !kycVerified
                    ? 'Finish your identity and bank verification on your onboarding page before creating payment links.'
                    : 'Your store is registered. Payment links will turn on as soon as verification, WhatsApp templates, and live payments go live.'}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-heading font-semibold text-main">
                  Payment links
                </h2>
                <p className="text-xs sm:text-sm text-muted">
                  Create a checkout link for your buyer and track release confirmation.
                </p>
              </>
            )}
          </div>

          <div className="shrink-0">
            <button
              type="button"
              disabled={!gates.canCreateLinks}
              onClick={() => {
                if (gates.canCreateLinks) {
                  setIsCreateLinkOpen((open) => !open);
                  setLinkError(null);
                }
              }}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-accent hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>Create payment link</span>
            </button>
          </div>
        </div>

        {/* Create Payment Link Form (ONLY shown when live gates allow AND vendor clicked primary button) */}
        {gates.canCreateLinks && isCreateLinkOpen && (
          <form onSubmit={handleGenerateLink} className="pt-5 border-t border-border space-y-4">
            {linkError && (
              <div role="status" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {linkError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-main mb-1.5">
                  Item name or description <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="What are you selling?"
                  className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:border-accent focus:ring-accent/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-main mb-1.5">
                  Agreed price (₦) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted font-bold text-sm">₦</span>
                  <input
                    type="number"
                    min="500"
                    step="100"
                    required
                    value={itemPriceInput}
                    onChange={(e) => setItemPriceInput(e.target.value)}
                    placeholder="Enter price in Naira"
                    className="w-full bg-site border border-border rounded-xl pl-8 pr-3.5 py-2.5 text-sm font-semibold text-main placeholder:text-muted placeholder:font-normal focus:outline-none focus:ring-2 focus:border-accent focus:ring-accent/20"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-main mb-1.5 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-accent" />
                <span>Delivery option</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeliveryType('same_city')}
                  className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    deliveryType === 'same_city'
                      ? 'bg-accent/10 border-accent text-main'
                      : 'bg-site border-border text-muted hover:border-accent/40'
                  }`}
                >
                  <span className="font-bold text-main block">Same-city dispatch</span>
                  <span className="text-[11px] text-muted block mt-0.5">
                    Up to 3 days delivery + 3 days grace
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryType('interstate')}
                  className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    deliveryType === 'interstate'
                      ? 'bg-accent/10 border-accent text-main'
                      : 'bg-site border-border text-muted hover:border-accent/40'
                  }`}
                >
                  <span className="font-bold text-main block">Interstate waybill</span>
                  <span className="text-[11px] text-muted block mt-0.5">
                    Up to 7 days delivery + 3 days grace
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-main mb-1.5">
                  Buyer WhatsApp number
                </label>
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="Buyer WhatsApp number"
                  className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:border-accent focus:ring-accent/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-main mb-1.5">
                  Delivery notes (optional)
                </label>
                <input
                  type="text"
                  value={buyerNotes}
                  onChange={(e) => setBuyerNotes(e.target.value)}
                  placeholder="Size, colour, or delivery area"
                  className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:border-accent focus:ring-accent/20"
                />
              </div>
            </div>

            <div className="bg-site border border-border rounded-2xl p-3.5">
              <label htmlFor="buyerWhatsappConsent" className="flex items-start gap-2.5 cursor-pointer">
                <input
                  id="buyerWhatsappConsent"
                  type="checkbox"
                  checked={buyerWhatsappConsent}
                  onChange={(e) => setBuyerWhatsappConsent(e.target.checked)}
                  required={Boolean(buyerPhone.trim())}
                  className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent cursor-pointer shrink-0"
                />
                <span className="text-xs text-main leading-snug">
                  <span className="font-semibold">
                    The buyer asked for this link and agrees to receive it on WhatsApp.
                  </span>{' '}
                  <span className="text-muted block mt-0.5 text-[11px]">
                    If left unticked, you can copy and share the payment link directly in chat.
                  </span>
                </span>
              </label>
            </div>

            <div className="bg-site border border-border rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Item price</span>
                <span className="font-semibold text-main">{formatNaira(pricing.itemPrice)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1">
                  <span>Protection fee (3%)</span>
                  <span title={`Minimum fee is ${formatNaira(MINIMUM_PROTECTION_FEE)}`}>
                    <Info className="w-3.5 h-3.5 text-muted" />
                  </span>
                </span>
                <span className="font-semibold text-accent">+{formatNaira(pricing.protectionFee)}</span>
              </div>
              <div className="pt-2 border-t border-border flex items-center justify-between">
                <span className="text-xs font-bold text-main">Total buyer pays</span>
                <span className="text-base font-heading font-bold text-main">
                  {formatNaira(pricing.totalAmount)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreateLinkOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted hover:text-main cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingLink || pricing.itemPrice <= 0}
                className="px-5 py-3 rounded-xl bg-accent hover:opacity-90 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingLink ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating link...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Generate payment link</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Newly Generated Link Card */}
        {generatedTx && (
          <div className="bg-accent/10 border border-accent/30 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wide">
                <Check className="w-4 h-4 text-accent" />
                <span>Payment link ready</span>
              </div>
              <StatusBadge status={generatedTx.status} size="sm" />
            </div>

            {whatsappNotice && (
              <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                WhatsApp notice: {whatsappNotice} Share the link manually below.
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={getPayUrl(generatedTx.id)}
                className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-xs text-main select-all"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(getPayUrl(generatedTx.id))}
                className="px-3.5 py-2 bg-accent hover:opacity-90 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy link'}</span>
              </button>
            </div>

            <Link
              href={`/pay/${generatedTx.id}`}
              target="_blank"
              className="w-full py-2.5 px-3 rounded-xl bg-surface hover:bg-site border border-border text-main text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Open checkout page</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted" />
            </Link>
          </div>
        )}
      </div>

      {/* Orders List with Plain Status and Next Step */}
      <div className="bg-surface rounded-3xl border border-border shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-heading font-semibold text-main tracking-tight">
              Orders ({transactions.length})
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Track payment status and the next step for each order.
            </p>
          </div>
        </div>

        {actionFeedback && (
          <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {actionFeedback}
          </div>
        )}

        {isLoading ? (
          <div className="p-10 text-center text-muted text-xs flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
            <span>Loading orders...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Package className="w-9 h-9 text-muted mx-auto" />
            <h3 className="text-sm font-heading font-semibold text-main">No orders yet</h3>
            <p className="text-xs text-muted max-w-sm mx-auto">
              {gates.canCreateLinks
                ? 'Click Create payment link above to generate your first buyer link.'
                : 'Your buyer orders will appear here once payments open.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {transactions.map((tx) => {
              const summary = getOrderPlainSummary(tx);
              return (
                <div
                  key={tx.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-site/50 transition-colors"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-main">{tx.item_name}</span>
                      <StatusBadge status={tx.status} size="sm" />
                    </div>
                    <p className="text-xs text-muted">
                      <strong className="text-main">{summary.statusLabel}:</strong> {summary.nextStep}
                    </p>
                    <p className="text-[11px] text-muted">
                      Total {formatNaira(Number(tx.total_amount))} (Item {formatNaira(Number(tx.item_price))}) •{' '}
                      {new Date(tx.created_at).toLocaleDateString('en-NG', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {gates.canCreateLinks && ['AWAITING_PAYMENT', 'FUNDS_LOCKED'].includes(tx.status) && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(tx)}
                        disabled={cancellingId === tx.id}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{cancellingId === tx.id ? 'Cancelling...' : 'Cancel'}</span>
                      </button>
                    )}
                    <Link
                      href={tx.status === 'AWAITING_PAYMENT' ? `/pay/${tx.id}` : `/order/${tx.id}`}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-site text-main border border-border hover:bg-border/30 inline-flex items-center gap-1"
                    >
                      <span>{tx.status === 'AWAITING_PAYMENT' ? 'Checkout link' : 'Open order'}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
