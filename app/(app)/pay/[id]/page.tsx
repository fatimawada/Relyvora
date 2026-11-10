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
  Mail,
  ArrowLeft
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
  const [buyerEmail, setBuyerEmail] = useState('');
  const [storedReleaseCode, setStoredReleaseCode] = useState<string | null>(null);
  const [storedAuthToken, setStoredAuthToken] = useState<string | null>(null);

  const liveMode = isLiveMode() || transaction?.payments_mode === 'live' || Boolean(transaction?.virtual_account_number);

  // Restore buyer session and release code from localStorage (Owner Rule 3 Step B)
  useEffect(() => {
    if (typeof window !== 'undefined' && id) {
      const cached = localStorage.getItem(`relyvora_buyer_escrow_${id}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.releaseCode) {
            setStoredReleaseCode(parsed.releaseCode);
            setStoredAuthToken(parsed.authToken || null);
            if (parsed.buyerEmail) {
              setBuyerEmail(parsed.buyerEmail);
            }
          }
        } catch {
          // ignore cache parse errors
        }
      }
    }
  }, [id]);

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

  // Real-time polling for incoming bank transfer (Anchor Webhook updates status)
  useEffect(() => {
    if (!id || !transaction || transaction.status !== 'AWAITING_PAYMENT') return;

    const interval = setInterval(async () => {
      const { data } = await getTransactionById(id);
      if (data && data.status !== 'AWAITING_PAYMENT') {
        setTransaction(data);
        if (data.status === 'FUNDS_LOCKED') {
          router.push(`/order/${data.id}?new_payment=true`);
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [id, transaction?.status, router]);

  const handleConfirmPayment = async (method: string) => {
    if (!transaction) return;

    try {
      const res = await fetch('/api/escrow/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: transaction.id,
          paymentMethod: method,
          buyerEmail: buyerEmail.trim(),
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
            buyerEmail: buyerEmail.trim(),
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
                <p className="text-[10px] text-muted">Guarantees delivery inspection before release</p>
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

          {/* Optional Buyer Email Field (Owner Rule 3) */}
          {!isAlreadyPaid && (
            <div className="bg-site border border-border rounded-2xl p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="buyerEmail" className="text-xs font-bold text-main uppercase tracking-wide flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-accent" />
                  <span>Email Address (for receipt)</span>
                </label>
                <span className="text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full">
                  Optional Backup Receipt
                </span>
              </div>
              <input
                type="email"
                id="buyerEmail"
                placeholder="e.g. buyer@example.com"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="text-[11px] text-muted leading-snug">
                We will email your official payment receipt and your secret 6-digit delivery release code so you have it ready on delivery day.
              </p>
            </div>
          )}

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
                    You receive a secret 6-digit release code. Only tell the rider your code when 100% satisfied. If anything is wrong, freeze the escrow with 1 click!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button or Already Paid Alert */}
          {isAlreadyPaid ? (
            storedReleaseCode ? (
              /* Step B: Restored from Buyer localStorage - PROMINENT SUCCESS SCREEN */
              <div className="bg-surface border-2 border-accent/40 rounded-2xl p-6 sm:p-7 text-center space-y-4 shadow-card transition-colors">
                <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto border border-accent/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
                    Payment Protected in Escrow
                  </span>
                  <h3 className="text-lg sm:text-xl font-heading font-bold text-main mt-2">
                    Your Secret 6-Digit Delivery Release Code
                  </h3>
                  <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                    Give this 6-digit code to the dispatch rider upon delivery <strong>only AFTER inspecting your items</strong>.
                  </p>
                </div>
                <div className="py-1">
                  <div className="bg-site border-2 border-dashed border-accent rounded-xl py-3 px-6 inline-block font-mono text-3xl font-black tracking-widest text-accent select-all shadow-inner">
                    {storedReleaseCode}
                  </div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-left flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 max-w-md mx-auto">
                  <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    Keep this code confidential. Do not share this code over the phone or before inspecting the delivery.
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
              <div className="bg-site border border-border rounded-2xl p-4 text-center space-y-3">
                <p className="text-xs font-medium text-main">
                  This transaction has already been funded in safe escrow!
                </p>
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
          ) : liveMode && transaction.virtual_account_number ? (
            /* Live Mode: Dedicated Virtual NUBAN Bank Transfer Details */
            <div className="space-y-4 pt-2">
              <div className="bg-navy-950 text-white rounded-2xl p-5 space-y-4 border border-border shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-accent" />
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      Providus Bank Escrow NUBAN
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
                      <span className="text-2xl font-black font-mono tracking-widest text-accent select-all">
                        {transaction.virtual_account_number}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyAccount}
                      className="px-3.5 py-2 bg-accent hover:opacity-90 text-[#071229] text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedAccount ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedAccount ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Exact Amount to Transfer:</span>
                    <span className="text-base font-bold font-heading text-accent">
                      {formatNaira(Number(transaction.total_amount))}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-snug">
                  Transfer the exact amount above from your bank app. Your payment will be locked safely in Relyvora escrow immediately upon credit.
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
                  NDIC Protected Escrow
                </span>
                <span>•</span>
                <span>Providus Bank Rails</span>
                <span>•</span>
                <span>Instant Code Generation</span>
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
                <span>Zero Risk Demo</span>
                <span>•</span>
                <span>Instant Code Generation</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Simulated Payment Modal */}
      <SimulatedPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onConfirmPayment={handleConfirmPayment}
        totalAmount={Number(transaction.total_amount)}
        itemName={transaction.item_name}
      />
    </div>
  );
}
