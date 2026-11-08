'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTransactionById } from '@/lib/supabase';
import { isLiveMode } from '@/lib/paymentsMode';
import { Transaction } from '@/lib/types';
import { formatNaira } from '@/lib/pricing';
import { Logo } from '@/components/Logo';
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
  RefreshCw
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

  const liveMode = isLiveMode() || transaction?.payments_mode === 'live' || Boolean(transaction?.virtual_account_number);

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
        }),
      });

      const json = await res.json();
      if (json.success && json.transaction) {
        setTransaction(json.transaction);
        setIsPaymentModalOpen(false);
        router.push(`/order/${transaction.id}?new_payment=true`);
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
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-500">Loading secure checkout...</p>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-3xl border border-slate-200 text-center space-y-4 shadow-xs">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Order Not Found</h2>
        <p className="text-xs text-slate-500">
          This payment link may be invalid or expired. Check the link with your vendor.
        </p>
        <Link
          href="/vendor"
          className="inline-block px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // If already paid, give immediate path to tracker
  const isAlreadyPaid = transaction.status !== 'AWAITING_PAYMENT';

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-10 space-y-6 w-full">
      {/* Checkout Header Branding */}
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <Logo size="lg" withLink={false} />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Buyer Protection Escrow Active</span>
        </div>
      </div>

      {/* Main Checkout Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
        {/* Vendor Header Pill */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 font-bold">
              {transaction.vendor_handle.slice(1, 3).toUpperCase()}
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Paying Verified Vendor:</div>
              <div className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                <span>{transaction.vendor_handle}</span>
                <span className="text-emerald-400 text-xs">⭐</span>
              </div>
            </div>
          </div>
          <StatusBadge status={transaction.status} size="sm" />
        </div>

        <div className="p-6 sm:p-7 space-y-6">
          {/* Order Item & Price Summary */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Purchase Details
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {transaction.item_name}
            </h1>
            {transaction.buyer_notes && (
              <p className="text-xs text-slate-500 mt-1 italic">
                Note: {transaction.buyer_notes}
              </p>
            )}
          </div>

          {/* Transparent Price Breakdown */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm text-slate-600">
              <span>Item Agreed Price:</span>
              <span className="font-semibold text-slate-900 font-mono">
                {formatNaira(Number(transaction.item_price))}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm text-slate-600">
              <div>
                <span className="flex items-center gap-1 font-medium">
                  <span>Relyvora Protection Fee (3%):</span>
                  <span title="3% buyer protection fee (minimum ₦500)">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  </span>
                </span>
                <p className="text-[10px] text-slate-400">Guarantees delivery inspection before release</p>
              </div>
              <span className="font-semibold text-emerald-700 font-mono">
                +{formatNaira(Number(transaction.protection_fee))}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs sm:text-sm font-bold text-slate-900">Total Payable in Escrow:</span>
                <p className="text-[11px] text-emerald-600 font-medium">Funds held safely in custody</p>
              </div>
              <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                {formatNaira(Number(transaction.total_amount))}
              </span>
            </div>
          </div>

          {/* How You Are Protected (3-Step Visual Timeline) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>How Relyvora Protects Your Money</span>
            </h3>

            <div className="grid grid-cols-1 gap-2.5">
              <div className="flex items-start gap-3 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                  1
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">1. Safe Escrow Lock</h4>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    Your money is safely locked with Relyvora. The vendor does <strong>NOT</strong> receive the payment until delivery is confirmed.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                  2
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">2. Inspect Item First</h4>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    The vendor ships your package. When the dispatch rider arrives, unpack and inspect your purchase.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                  3
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">3. Release With 6-Digit Code</h4>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    You receive a secret 6-digit release code. Only tell the rider your code when 100% satisfied. If anything is wrong, freeze the escrow with 1 click!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button or Already Paid Alert */}
          {isAlreadyPaid ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-3">
              <p className="text-xs font-medium text-slate-600">
                This transaction has already been funded in safe escrow!
              </p>
              <Link
                href={`/order/${transaction.id}`}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <span>Go to Escrow Tracker & Release Code</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : liveMode && transaction.virtual_account_number ? (
            /* Live Mode: Dedicated Virtual NUBAN Bank Transfer Details */
            <div className="space-y-4 pt-2">
              <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 border border-slate-800 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Providus Bank Escrow NUBAN
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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
                      <span className="text-2xl font-black font-mono tracking-widest text-emerald-400 select-all">
                        {transaction.virtual_account_number}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyAccount}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedAccount ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedAccount ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Exact Amount to Transfer:</span>
                    <span className="text-base font-bold font-mono text-emerald-400">
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
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingStatus ? 'Checking Escrow Balance...' : "I've Sent the Transfer • Check Status"}</span>
                </button>
              </div>

              <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500 text-center">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
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
                className="w-full py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 transition-all transform active:scale-[0.99] cursor-pointer"
              >
                <Lock className="w-5 h-5 text-emerald-200" />
                <span>Lock {formatNaira(Number(transaction.total_amount))} in Safe Escrow</span>
              </button>

              <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500 text-center">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
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
