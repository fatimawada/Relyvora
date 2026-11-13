'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTransactionById } from '@/lib/supabase';
import { isLiveMode } from '@/lib/paymentsMode';
import { isCheckoutEnabled } from '@/lib/safetyLimits';
import { Transaction } from '@/lib/types';
import { formatNaira } from '@/lib/pricing';
import { Logo } from '@/components/brand/Logo';
import { StatusBadge } from '@/components/StatusBadge';
import { SimulatedPaymentModal } from '@/components/SimulatedPaymentModal';
import { AnchorBrandText } from '@/components/common/AnchorBrandText';
import { 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight, 
  ShieldAlert, 
  Check, 
  HelpCircle,
  Truck,
  KeyRound,
  AlertCircle,
  Copy,
  Building2,
  RefreshCw,
  ArrowLeft,
  MessageCircle
} from 'lucide-react';

export default function BuyerCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isResendingWhatsapp, setIsResendingWhatsapp] = useState(false);
  const [resendWhatsappNotice, setResendWhatsappNotice] = useState<string | null>(null);
  const [resendWhatsappError, setResendWhatsappError] = useState<string | null>(null);
  const [storedReleaseCode, setStoredReleaseCode] = useState<string | null>(null);
  const [storedAuthToken, setStoredAuthToken] = useState<string | null>(null);

  const liveMode = isLiveMode() || transaction?.payments_mode === 'live';

  // Restore buyer session and release code from localStorage ONLY in sandbox mode
  useEffect(() => {
    if (liveMode) {
      setStoredReleaseCode(null);
      return;
    }
    if (typeof window !== 'undefined' && id) {
      const cached = localStorage.getItem(`relyvora_buyer_escrow_${id}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.releaseCode) {
            setStoredReleaseCode(parsed.releaseCode);
            setStoredAuthToken(parsed.authToken || null);
          }
        } catch {
          // ignore cache parse errors
        }
      }
    }
  }, [id, liveMode]);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setIsLoading(true);
      const { data, error } = await getTransactionById(id);
      if (data) {
        setTransaction(data);
      } else {
        setError(error || 'Transaction not found.');
      }
      setIsLoading(false);
    }
    load();
  }, [id]);

  // Real-time polling for incoming bank transfer and WhatsApp confirmation status
  useEffect(() => {
    if (!id || !transaction || transaction.status !== 'AWAITING_PAYMENT') return;

    const interval = setInterval(async () => {
      const { data } = await getTransactionById(id);
      if (data) {
        if (
          data.status !== transaction.status ||
          data.buyer_phone_verified !== transaction.buyer_phone_verified ||
          data.whatsapp_blocked !== transaction.whatsapp_blocked
        ) {
          setTransaction(data);
        }
        if (data.status === 'FUNDS_LOCKED') {
          router.push(`/order/${data.id}?new_payment=true`);
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [
    id,
    transaction?.status,
    transaction?.buyer_phone_verified,
    transaction?.whatsapp_blocked,
    router,
  ]);

  const handleConfirmPayment = async (method: string) => {
    if (!transaction) return;

    try {
      const res = await fetch('/api/escrow/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: transaction.id,
          paymentMethod: method,
        }),
      });

      const json = await res.json();
      if (json.success && json.transaction) {
        const code = json.sandbox_release_code || '';
        const token = json.buyer_auth_token || '';

        // Owner Rule 3 Step B: Save in buyer localStorage
        if (typeof window !== 'undefined' && code) {
          localStorage.setItem(`relyvora_buyer_escrow_${transaction.id}`, JSON.stringify({
            transactionId: transaction.id,
            releaseCode: code,
            authToken: token,
            timestamp: Date.now(),
          }));
        }

        setStoredReleaseCode(code);
        setStoredAuthToken(token);
        setTransaction(json.transaction);
        setIsPaymentModalOpen(false);

        // Redirect to order tracker with code param
        router.push(`/order/${transaction.id}?new_payment=true&code=${code}`);
      } else {
        alert(`Payment error: ${json.error || 'Failed to process payment'}`);
      }
    } catch (err: any) {
      alert(`Network error during payment confirmation: ${err.message}`);
    }
  };

  const handleCheckStatus = async () => {
    if (!id) return;
    setIsCheckingStatus(true);
    try {
      const { data } = await getTransactionById(id);
      if (data) {
        setTransaction(data);
        if (data.status !== 'AWAITING_PAYMENT') {
          router.push(`/order/${data.id}?new_payment=true`);
        }
      }
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleCopyAccount = () => {
    if (!transaction?.virtual_account_number) return;
    navigator.clipboard.writeText(transaction.virtual_account_number);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const handleResendWhatsapp = async () => {
    if (!transaction) return;
    setIsResendingWhatsapp(true);
    setResendWhatsappNotice(null);
    setResendWhatsappError(null);
    try {
      const res = await fetch(`/api/escrow/${encodeURIComponent(transaction.id)}/resend-whatsapp`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setResendWhatsappNotice(
          `Confirmation sent on WhatsApp to ${json.buyer_phone_masked || transaction.buyer_phone_masked || 'your number'}. Tap "Confirm this is me" in WhatsApp.`
        );
      } else {
        setResendWhatsappError(json.error || 'Could not re-send WhatsApp confirmation message.');
      }
    } catch (err: any) {
      setResendWhatsappError(err?.message || 'Network error re-sending WhatsApp confirmation.');
    } finally {
      setIsResendingWhatsapp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-muted">Loading secure checkout...</p>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-surface rounded-3xl border border-border text-center space-y-4 shadow-card">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-heading font-semibold text-main">Invalid Checkout Link</h2>
        <p className="text-xs text-muted">
          {error || 'This transaction could not be located in our escrow database.'}
        </p>
        <Link
          href="/vendor"
          className="inline-block px-4 py-2 bg-surface hover:bg-site text-main border border-border text-xs font-semibold rounded-xl transition-colors"
        >
          Return to Marketplace
        </Link>
      </div>
    );
  }

  const isAlreadyPaid = transaction.status !== 'AWAITING_PAYMENT';

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-10 space-y-6 w-full">
      {/* Top Brand Link */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-main transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Relyvora</span>
        </Link>

        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" />
          <span>Buyer Escrow Protected</span>
        </div>
      </div>

      {/* Main Checkout Card */}
      <div className="bg-surface rounded-3xl border border-border shadow-card overflow-hidden transition-colors">
        {/* Card Header */}
        <div className="p-6 border-b border-border bg-site/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo variant="symbol" height={32} withLink={false} />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted block">
                Relyvora Escrow
              </span>
              <span className="text-xs font-semibold text-main">
                Vendor: {transaction.vendor_handle}
              </span>
            </div>
          </div>
          <StatusBadge status={transaction.status} size="sm" />
        </div>

        <div className="p-6 sm:p-7 space-y-6">
          {/* Order Item & Price Summary */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
              Purchase Details
            </span>
            <h1 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
              {transaction.item_name}
            </h1>
            {transaction.buyer_notes && (
              <p className="text-xs text-muted mt-1 italic">
                Note: {transaction.buyer_notes}
              </p>
            )}
          </div>

          {/* Transparent Price Breakdown */}
          <div className="bg-site border border-border rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm text-muted">
              <span>Item Agreed Price:</span>
              <span className="font-semibold text-main">
                {formatNaira(Number(transaction.item_price))}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm text-muted">
              <div>
                <span className="flex items-center gap-1 font-medium">
                  <span>Relyvora Protection Fee (3%):</span>
                  <span title="3% buyer protection fee (minimum ₦500)">
                    <HelpCircle className="w-3.5 h-3.5 text-muted" />
                  </span>
                </span>
                <p className="text-[10px] text-muted">Held until delivery inspection</p>
              </div>
              <span className="font-semibold text-accent">
                +{formatNaira(Number(transaction.protection_fee))}
              </span>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between">
              <div>
                <span className="text-xs sm:text-sm font-bold text-main">Total Payable in Escrow:</span>
                <p className="text-[11px] text-accent font-medium">Funds held safely in custody</p>
              </div>
              <span className="text-xl sm:text-2xl font-heading font-bold text-main">
                {formatNaira(Number(transaction.total_amount))}
              </span>
            </div>
          </div>

          {/* How You Are Protected (3-Step Visual Timeline) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-muted uppercase tracking-wide flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-accent" />
              <span>How Relyvora Protects Your Money</span>
            </h3>

            <div className="grid grid-cols-1 gap-2.5">
              <div className="flex items-start gap-3 p-3 bg-accent/5 rounded-xl border border-accent/20">
                <div className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                  1
                </div>
                <div>
                  <h4 className="text-xs font-bold text-main">1. Safe Escrow Lock</h4>
                  <p className="text-[11px] text-muted leading-snug">
                    Your money is safely locked with Relyvora. The vendor does <strong>NOT</strong> receive payment until you inspect and approve delivery.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-accent/5 rounded-xl border border-accent/20">
                <div className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                  2
                </div>
                <div>
                  <h4 className="text-xs font-bold text-main">2. Inspect Item First</h4>
                  <p className="text-[11px] text-muted leading-snug">
                    The vendor ships your package. When the dispatch rider arrives, unpack and inspect your purchase.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-accent/5 rounded-xl border border-accent/20">
                <div className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                  3
                </div>
                <div>
                  <h4 className="text-xs font-bold text-main">3. Release With 6-Digit Code</h4>
                  <p className="text-[11px] text-muted leading-snug">
                    You receive a six-digit release code. Give the code to the dispatch rider only after you have opened the package and checked the items.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button or Already Paid Alert */}
          {isAlreadyPaid ? (
            !liveMode && storedReleaseCode ? (
              /* Sandbox Mode Success Screen */
              <div className="bg-surface border-2 border-accent/40 rounded-2xl p-6 sm:p-7 text-center space-y-4 shadow-card transition-colors">
                <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto border border-accent/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
                    Payment Protected in Escrow
                  </span>
                  <h3 className="text-lg sm:text-xl font-heading font-bold text-main mt-2">
                    Your 6-Digit Delivery Release Code
                  </h3>
                  <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                    Give the code to the dispatch rider only after you have opened the package and checked the items.
                  </p>
                </div>
                <div className="py-1">
                  <div className="bg-site border-2 border-dashed border-accent rounded-xl py-3 px-6 inline-block font-heading tabular-nums text-3xl font-bold tracking-widest text-accent select-all shadow-inner">
                    {storedReleaseCode}
                  </div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-left flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 max-w-md mx-auto">
                  <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    Keep this code confidential. Give the code to the dispatch rider only after you have opened the package and checked the items.
                  </span>
                </div>
                <div className="pt-1">
                  <Link
                    href={`/order/${transaction.id}?code=${storedReleaseCode}`}
                    className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xl bg-accent hover:opacity-90 text-[#071229] font-bold text-xs sm:text-sm transition-colors shadow-card"
                  >
                    <span>Open Live Escrow Tracker</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              /* Live Mode (or reloaded page) Success Screen: Never renders plaintext code on page */
              <div className="bg-surface border-2 border-accent/40 rounded-2xl p-6 sm:p-7 text-center space-y-4 shadow-card transition-colors">
                <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto border border-accent/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
                    Payment Protected in Escrow
                  </span>
                  <h3 className="text-lg sm:text-xl font-heading font-bold text-main mt-2">
                    Your release code was sent to {transaction.buyer_phone_masked || '******1234'}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted max-w-md mx-auto leading-relaxed">
                    Give the code to the dispatch rider only after you have opened the package and checked the items.
                  </p>
                </div>
                <Link
                  href={`/order/${transaction.id}`}
                  className="w-full py-3.5 px-4 rounded-xl bg-accent hover:opacity-90 text-[#071229] font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-card"
                >
                  <span>Go to Escrow Tracker</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )
          ) : !isCheckoutEnabled() ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
              <h3 className="text-sm font-heading font-semibold text-main">Checkout Temporarily Suspended</h3>
              <p className="text-xs text-muted">
                Payment collection is temporarily paused for scheduled maintenance. Please try again shortly or contact your vendor.
              </p>
            </div>
          ) : transaction.whatsapp_blocked ? (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-5 text-center space-y-2.5">
              <ShieldAlert className="w-8 h-8 text-rose-600 dark:text-rose-400 mx-auto" />
              <h3 className="text-sm font-heading font-semibold text-main">Order Blocked</h3>
              <p className="text-xs text-muted leading-relaxed">
                This payment link has been blocked because the recipient reported &quot;Not me&quot; or opted out on WhatsApp. Virtual account details are unavailable.
              </p>
            </div>
          ) : !transaction.buyer_phone_verified ? (
            <div className="bg-site border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent border border-accent/30 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-heading font-semibold text-main">
                    Confirm your WhatsApp number to continue
                  </h3>
                  <p className="text-xs text-muted leading-relaxed">
                    {transaction.has_buyer_phone
                      ? `For your security, open WhatsApp on ${transaction.buyer_phone_masked || 'your number'} and tap "Confirm this is me" before viewing the bank transfer details.`
                      : 'This payment link requires a verified WhatsApp number from your vendor before bank transfer details can be shown.'}
                  </p>
                </div>
              </div>

              {resendWhatsappNotice && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-700 dark:text-emerald-300">
                  {resendWhatsappNotice}
                </div>
              )}

              {resendWhatsappError && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300">
                  {resendWhatsappError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                {transaction.has_buyer_phone && (
                  <button
                    type="button"
                    onClick={handleResendWhatsapp}
                    disabled={isResendingWhatsapp}
                    className="flex-1 py-3 px-4 rounded-xl bg-accent hover:opacity-90 text-[#071229] font-bold text-xs flex items-center justify-center gap-2 transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{isResendingWhatsapp ? 'Sending on WhatsApp...' : 'Re-send confirmation message'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCheckStatus}
                  disabled={isCheckingStatus}
                  className="flex-1 py-3 px-4 rounded-xl bg-surface hover:bg-site border border-border text-main font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-accent ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingStatus ? 'Checking Verification...' : "I've confirmed • Refresh"}</span>
                </button>
              </div>
            </div>
          ) : liveMode ? (
            /* Live Mode: Bank Transfer ONLY via Anchor Virtual Account Card */
            <div className="space-y-4 pt-2">
              <div className="bg-navy-950 text-white rounded-2xl p-5 space-y-4 border border-border shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-accent" />
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      Virtual Bank Transfer Account
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-accent/20 text-accent border border-accent/30">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span>Awaiting Transfer</span>
                  </span>
                </div>

                <div className="space-y-3 bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Bank:</span>
                    <span className="font-bold text-white">{transaction.virtual_bank_name || 'Providus Bank'}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Account Name:</span>
                    <span className="font-semibold text-slate-200 truncate max-w-[220px]">
                      {transaction.virtual_account_name || `Relyvora Escrow / ${transaction.vendor_handle}`}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-400 font-medium block">Account Number:</span>
                      <span className="text-2xl font-bold font-heading tabular-nums tracking-widest text-accent select-all">
                        {transaction.virtual_account_number || 'Generating...'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyAccount}
                      disabled={!transaction.virtual_account_number}
                      className="px-3.5 py-2 bg-accent hover:opacity-90 text-[#071229] text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {copiedAccount ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedAccount ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Exact Amount:</span>
                    <span className="text-base font-bold font-heading tabular-nums text-accent">
                      {formatNaira(Number(transaction.total_amount))}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Expiry:</span>
                    <span className="font-heading tabular-nums font-medium text-slate-200">
                      {transaction.code_expires_at
                        ? new Date(transaction.code_expires_at).toLocaleString('en-NG', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : transaction.created_at
                          ? `${new Date(new Date(transaction.created_at).getTime() + 24 * 60 * 60 * 1000).toLocaleString('en-NG', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })} (24h window)`
                          : '24 hours'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed font-medium">
                  Pay by bank transfer from your bank app, internet banking or your bank&apos;s USSD code. Transfer the exact amount.
                </p>

                <button
                  type="button"
                  onClick={handleCheckStatus}
                  disabled={isCheckingStatus}
                  className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-accent ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingStatus ? 'Checking Escrow Balance...' : "I've Sent the Transfer • Check Status"}</span>
                </button>
              </div>

              <div className="flex items-center justify-center gap-4 text-[11px] text-muted text-center">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                  Protected Escrow Custody
                </span>
                <span>•</span>
                <AnchorBrandText>Payments powered by Anchor</AnchorBrandText>
                <span>•</span>
                <span>Bank Transfer Only</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className="w-full py-4 px-5 rounded-2xl bg-accent hover:opacity-90 text-[#071229] font-bold text-base sm:text-lg flex items-center justify-center gap-2 shadow-card transition-all transform active:scale-[0.99] cursor-pointer"
              >
                <Lock className="w-5 h-5 text-[#071229]" />
                <span>Lock {formatNaira(Number(transaction.total_amount))} in Safe Escrow</span>
              </button>

              <div className="flex items-center justify-center gap-4 text-[11px] text-muted text-center">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                  Simulated Gateway
                </span>
                <span>•</span>
                <span>Sandbox Mode</span>
                <span>•</span>
                <span>Code Issued on Payment</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Simulated Payment Modal — Rendered ONLY in sandbox mode */}
      {!liveMode && (
        <SimulatedPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onConfirmPayment={handleConfirmPayment}
          totalAmount={Number(transaction.total_amount)}
          itemName={transaction.item_name}
        />
      )}
    </div>
  );
}
