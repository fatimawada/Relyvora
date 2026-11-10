'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getTransactionById } from '@/lib/supabase';
import { Transaction } from '@/lib/types';
import { formatNaira } from '@/lib/pricing';
import { StatusBadge } from '@/components/StatusBadge';
import { EscrowStepper } from '@/components/EscrowStepper';
import confetti from 'canvas-confetti';
import { 
  ShieldCheck, 
  Lock, 
  KeyRound, 
  Truck, 
  AlertTriangle, 
  Copy, 
  Check, 
  Eye, 
  RefreshCw, 
  CheckCircle2, 
  Store, 
  User, 
  ArrowLeft,
  X,
  Send,
  Sparkles,
  HelpCircle,
  AlertOctagon
} from 'lucide-react';

function EscrowTrackerContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const isNewPayment = searchParams?.get('new_payment') === 'true';

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [perspective, setPerspective] = useState<'buyer' | 'vendor'>('buyer');
  
  // Vendor verification code input
  const [enteredCode, setEnteredCode] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);

  // Buyer dispute modal & OTP verification state (Addendum Item 7)
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeOtp, setDisputeOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);

  // Buyer release code from localStorage (Owner Rule 3 Step B)
  const [buyerReleaseCode, setBuyerReleaseCode] = useState<string | null>(null);

  // Copy code feedback
  const [copiedCode, setCopiedCode] = useState(false);

  // Restore buyer release code from localStorage or query param
  useEffect(() => {
    const queryCode = searchParams?.get('code');
    if (queryCode) {
      setBuyerReleaseCode(queryCode);
    } else if (typeof window !== 'undefined' && id) {
      const cached = localStorage.getItem(`relyvora_buyer_escrow_${id}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.releaseCode) {
            setBuyerReleaseCode(parsed.releaseCode);
          }
        } catch {
          // ignore
        }
      }
    }
  }, [id, searchParams]);

  const loadTransaction = async () => {
    if (!id) return;
    setIsLoading(true);
    const { data } = await getTransactionById(id);
    if (data) {
      setTransaction(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadTransaction();
  }, [id]);

  // Trigger celebration if new payment or released
  useEffect(() => {
    if (isNewPayment && transaction?.status === 'FUNDS_LOCKED') {
      try {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {
        // ignore if not supported in environment
      }
    }
  }, [isNewPayment, transaction?.status]);

  const activeReleaseCode = buyerReleaseCode || transaction?.release_code || null;

  const handleCopyCode = () => {
    if (!activeReleaseCode) return;
    navigator.clipboard.writeText(activeReleaseCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Vendor Action: Mark as Dispatched
  const handleMarkDispatched = async () => {
    if (!transaction || transaction.status !== 'FUNDS_LOCKED') return;
    setIsDispatching(true);
    try {
      const res = await fetch('/api/escrow/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.id }),
      });
      const json = await res.json();
      if (json.success && json.transaction) {
        setTransaction(json.transaction);
      } else {
        alert(`Dispatch update failed: ${json.error || 'Failed to dispatch'}`);
      }
    } catch (err: any) {
      alert(`Network error during dispatch: ${err.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  // Vendor Action: Verify 6-digit Code to Release Funds
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    setVerificationError(null);

    // Rule: Opening a dispute disables the release code action
    if (transaction.status === 'DISPUTED') {
      setVerificationError('Transaction is in dispute. Release code verification is disabled.');
      return;
    }

    if (transaction.code_locked || (transaction.failed_code_attempts || 0) >= 5) {
      setVerificationError('SECURITY LOCKOUT: Maximum verification attempts exceeded. Escrow is locked.');
      return;
    }

    const cleanInput = enteredCode.trim();
    if (cleanInput.length !== 6) {
      setVerificationError('Please enter a complete 6-digit release code.');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch('/api/escrow/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: transaction.id,
          releaseCode: cleanInput,
        }),
      });

      const json = await res.json();
      if (json.success && json.transaction) {
        setTransaction(json.transaction);
        setEnteredCode('');
        try {
          confetti({
            particleCount: 100,
            spread: 90,
            origin: { y: 0.5 }
          });
        } catch (e) {}
      } else {
        if (json.isLocked) {
          setVerificationError('SECURITY LOCKOUT: 5 incorrect attempts exceeded. Escrow is now locked to protect against brute-force.');
          if (json.transaction) {
            setTransaction(json.transaction);
          } else {
            setTransaction(prev => prev ? { ...prev, code_locked: true, failed_code_attempts: 5 } : null);
          }
        } else if (json.remainingAttempts !== undefined) {
          setVerificationError(`Invalid 6-digit release code. ${json.remainingAttempts} attempt(s) remaining before security lockout.`);
          if (json.transaction) {
            setTransaction(json.transaction);
          }
        } else {
          setVerificationError(json.error || 'Invalid 6-digit release code.');
        }
      }
    } catch (err: any) {
      setVerificationError(`Network error during code verification: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  // Buyer Action: Send OTP to Phone (Addendum Item 7)
  const handleSendDisputeOtp = async () => {
    if (!transaction || !disputeReason.trim()) {
      setDisputeError('Please describe the reason for your dispute first.');
      return;
    }

    setIsSendingOtp(true);
    setDisputeError(null);
    try {
      const res = await fetch('/api/escrow/dispute/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.id }),
      });

      const json = await res.json();
      if (json.success) {
        setOtpSent(true);
        setMaskedPhone(json.maskedPhone || 'your registered phone');
        if (json.sandbox_otp) {
          setDisputeOtp(json.sandbox_otp); // Auto-populate in sandbox
        }
      } else {
        setDisputeError(json.error || 'Failed to send verification code.');
      }
    } catch (err: any) {
      setDisputeError(`Network error sending code: ${err.message}`);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Buyer Action: Freeze Escrow & Open Dispute with Verified OTP
  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction || !disputeReason.trim()) return;

    if (!otpSent) {
      handleSendDisputeOtp();
      return;
    }

    if (!disputeOtp || disputeOtp.trim().length !== 6) {
      setDisputeError('Please enter the 6-digit verification code sent to your phone.');
      return;
    }

    setIsSubmittingDispute(true);
    setDisputeError(null);
    try {
      const res = await fetch('/api/escrow/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: transaction.id,
          disputeReason: disputeReason.trim(),
          otp: disputeOtp.trim(),
        }),
      });

      const json = await res.json();
      if (json.success && json.transaction) {
        setTransaction(json.transaction);
        setIsDisputeModalOpen(false);
        setOtpSent(false);
        setDisputeOtp('');
      } else {
        setDisputeError(json.error || 'Dispute verification failed.');
        if (json.requiresOtpRequest) {
          setOtpSent(false);
        }
      }
    } catch (err: any) {
      setDisputeError(`Network error during dispute submission: ${err.message}`);
    } finally {
      setIsSubmittingDispute(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-500">Loading escrow tracker...</p>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-3xl border border-slate-200 text-center space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Order Not Found</h2>
        <Link
          href="/vendor"
          className="inline-block px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const isDisputed = transaction.status === 'DISPUTED';
  const isReleased = transaction.status === 'RELEASED';
  const isAwaitingPayment = transaction.status === 'AWAITING_PAYMENT';
  const isCodeLocked = Boolean(transaction.code_locked || (transaction.failed_code_attempts || 0) >= 5);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6 w-full">
      {/* Top Navigation & Perspective Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/vendor"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Vendor Dashboard</span>
        </Link>

        {/* Dual-Perspective Toggle */}
        <div className="bg-slate-200/80 p-1 rounded-2xl flex items-center self-start sm:self-auto border border-slate-300/80 shadow-xs">
          <button
            type="button"
            onClick={() => setPerspective('buyer')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              perspective === 'buyer'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5 text-emerald-600" />
            <span>Buyer Perspective</span>
          </button>
          <button
            type="button"
            onClick={() => setPerspective('vendor')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              perspective === 'vendor'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Store className="w-3.5 h-3.5 text-emerald-600" />
            <span>Vendor Perspective</span>
          </button>
        </div>
      </div>

      {/* Perspective Info Pill */}
      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 flex items-center justify-between text-xs text-emerald-900">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-emerald-600" />
          <span>
            Viewing as: <strong>{perspective === 'buyer' ? 'Customer / Buyer' : 'Seller / Vendor'}</strong> (Toggle above to test both sides)
          </span>
        </div>
        <button
          onClick={loadTransaction}
          className="p-1 hover:bg-emerald-100 rounded-lg transition-colors"
          title="Refresh transaction state"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-700" />
        </button>
      </div>

      {/* Escrow Stepper */}
      <EscrowStepper status={transaction.status} />

      {/* Order Overview Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Order Reference
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {transaction.item_name}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-mono">
              <span>ID: {transaction.id.slice(0, 8)}...</span>
              <span>•</span>
              <span>Vendor: {transaction.vendor_handle}</span>
            </div>
          </div>
          <div className="self-start sm:self-auto flex flex-col sm:items-end">
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {formatNaira(Number(transaction.total_amount))}
            </span>
            <div className="mt-1">
              <StatusBadge status={transaction.status} size="sm" />
            </div>
          </div>
        </div>

        {/* If awaiting payment */}
        {isAwaitingPayment && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center space-y-2">
            <p className="text-xs text-amber-900 font-medium">
              This order has not been paid yet. The buyer must first lock the funds in escrow.
            </p>
            <Link
              href={`/pay/${transaction.id}`}
              className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs"
            >
              Go to Buyer Checkout Page
            </Link>
          </div>
        )}

        {/* PERSPECTIVE 1: BUYER VIEW */}
        {perspective === 'buyer' && !isAwaitingPayment && (
          <div className="space-y-6 pt-2">
            {/* The 6-Digit Release Code Section */}
            {!isReleased && !isDisputed && (
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl relative overflow-hidden">
                <div className="relative z-10 space-y-4 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 self-center sm:self-auto">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Delivery Release Code</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      Step 3 of 4: Doorstep Handover
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-300">Your Secret Verification Code:</h3>
                      <div className="text-4xl sm:text-5xl font-mono font-black tracking-widest text-emerald-400 mt-1 select-all">
                        {activeReleaseCode || '------'}
                      </div>
                    </div>

                    {activeReleaseCode ? (
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-2 border border-white/20 transition-all self-center sm:self-auto cursor-pointer"
                      >
                        {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedCode ? 'Copied to Clipboard' : 'Copy Code'}</span>
                      </button>
                    ) : null}
                  </div>

                  {!activeReleaseCode && (
                    <div className="bg-white/10 border border-white/20 rounded-xl p-3 text-xs text-slate-200">
                      🔒 <strong>Live Security:</strong> Your 6-digit release code was emailed to your address and sent via SMS to your phone. It is stored securely on your authorized device.
                    </div>
                  )}

                  {isCodeLocked && (
                    <div className="bg-rose-500/20 border border-rose-400/40 rounded-xl p-3 text-xs text-rose-200">
                      ⚠️ <strong>Security Notice:</strong> Escrow release has been temporarily locked due to 5 incorrect code attempts by the vendor/rider. Your funds remain 100% protected in escrow.
                    </div>
                  )}

                  {/* Warning Notice */}
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-left flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200 leading-relaxed">
                      <strong>CRITICAL SAFETY RULE:</strong> Do <strong>NOT</strong> share this 6-digit code with the dispatch rider or vendor until you have opened the package and inspected the item! Entering this code releases the escrow funds immediately.
                    </p>
                  </div>
                </div>

                <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              </div>
            )}

            {/* If Released */}
            {isReleased && (
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
                <h3 className="text-base font-bold text-teal-900">Order Completed & Funds Released</h3>
                <p className="text-xs text-teal-700 max-w-md mx-auto">
                  The delivery release code was verified. Funds of {formatNaira(Number(transaction.item_price))} have been moved to the vendor's payout balance. Thank you for protecting your shopping with Relyvora!
                </p>
              </div>
            )}

            {/* If Disputed */}
            {isDisputed && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                  <AlertOctagon className="w-5 h-5 text-rose-600" />
                  <span>Dispute Opened — Reason Logged</span>
                </div>
                <p className="text-xs text-slate-700 bg-white p-3 rounded-xl border border-rose-200 font-medium">
                  "{transaction.dispute_reason || 'Buyer reported item mismatch / damage.'}"
                </p>
                <p className="text-[11px] text-rose-600">
                  A Relyvora dispute agent is reviewing this transaction. Release codes are frozen.
                </p>
              </div>
            )}

            {/* Freeze Escrow & Open Dispute Button */}
            {!isReleased && !isDisputed && (
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-500 text-center sm:text-left">
                  <span>Received something wrong or damaged?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDisputeModalOpen(true)}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Wrong / Fake Item — Freeze Escrow & Open Dispute ❌</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* PERSPECTIVE 2: VENDOR VIEW */}
        {perspective === 'vendor' && !isAwaitingPayment && (
          <div className="space-y-6 pt-2">
            {/* Step: Mark as Dispatched */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">1. Dispatch Shipment</h3>
                  <p className="text-xs text-slate-500">
                    Hand package to rider and notify the buyer.
                  </p>
                </div>
                {transaction.status === 'DISPATCHED' || isReleased ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Dispatched</span>
                  </span>
                ) : null}
              </div>

              {transaction.status === 'FUNDS_LOCKED' && (
                <button
                  type="button"
                  onClick={handleMarkDispatched}
                  disabled={isDispatching}
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-60"
                >
                  <Truck className="w-4 h-4 text-blue-200" />
                  <span>{isDispatching ? 'Updating status...' : 'Mark as Dispatched / Rider En Route 🚚'}</span>
                </button>
              )}
            </div>

            {/* Step: Code Verification Input */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">2. Unlock Escrow Payout</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ask the buyer or your delivery rider for the 6-digit release code given upon inspection.
                </p>
              </div>

              {isDisputed ? (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Code Entry Disabled:</strong> This transaction is in dispute. Escrow funds cannot be released until resolved.
                  </div>
                </div>
              ) : isCodeLocked ? (
                <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                    <AlertOctagon className="w-5 h-5 text-rose-600" />
                    <span>SECURITY LOCKOUT ACTIVATED</span>
                  </div>
                  <p className="text-xs text-rose-800 leading-relaxed">
                    This escrow transaction has been locked after 5 consecutive incorrect code attempts to protect against brute-force attacks. Release is frozen. Please contact Relyvora Dispute Mediation.
                  </p>
                </div>
              ) : isReleased ? (
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center space-y-1">
                  <span className="text-xs font-bold text-teal-900">
                    🎉 Payout Unlocked ({formatNaira(Number(transaction.item_price))})
                  </span>
                  <p className="text-[11px] text-teal-700">
                    Funds have been credited to your available payout balance.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      Enter Buyer's 6-Digit Release Code:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="e.g. 849201"
                        value={enteredCode}
                        onChange={(e) => {
                          setEnteredCode(e.target.value.replace(/\D/g, ''));
                          setVerificationError(null);
                        }}
                        className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-3 text-lg font-mono font-bold tracking-widest text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="submit"
                        disabled={isVerifying || enteredCode.trim().length !== 6}
                        className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isVerifying ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>Verify & Release</span>
                      </button>
                    </div>
                  </div>

                  {verificationError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2 animate-in fade-in">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{verificationError}</span>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Instant automated verification via Relyvora security protocol</span>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Buyer Dispute Modal */}
      {isDisputeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-base">Freeze Escrow & Dispute</h3>
              </div>
              <button 
                onClick={() => setIsDisputeModalOpen(false)}
                className="text-rose-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenDispute} className="p-5 sm:p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Freezing escrow halts payout immediately. To prevent unauthorized freezes, a 6-digit verification code will be sent to your phone.
              </p>

              {disputeError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{disputeError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Reason for dispute:
                </label>
                <textarea
                  required
                  rows={3}
                  disabled={otpSent}
                  placeholder="e.g. Received incorrect item / item arrived broken..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white disabled:opacity-60"
                />
              </div>

              {otpSent && (
                <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 space-y-3 animate-in fade-in">
                  <div>
                    <label className="block text-xs font-bold text-rose-900 uppercase tracking-wide mb-1">
                      Enter 6-Digit Verification Code:
                    </label>
                    <p className="text-[11px] text-rose-700 mb-2">
                      Code sent via SMS to {maskedPhone}.
                    </p>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 583921"
                      value={disputeOtp}
                      onChange={(e) => setDisputeOtp(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-white border border-rose-300 rounded-xl p-3 text-center text-xl font-mono font-bold tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendDisputeOtp}
                    disabled={isSendingOtp}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 underline"
                  >
                    Resend verification code
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDisputeModalOpen(false);
                    setOtpSent(false);
                    setDisputeError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                
                {!otpSent ? (
                  <button
                    type="button"
                    onClick={handleSendDisputeOtp}
                    disabled={isSendingOtp || !disputeReason.trim()}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isSendingOtp ? 'Sending Code...' : 'Send Phone Verification Code'}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmittingDispute || disputeOtp.trim().length !== 6}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingDispute ? 'Freezing Escrow...' : 'Verify & Freeze Escrow'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EscrowTrackerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-500">Loading escrow tracker...</p>
        </div>
      }
    >
      <EscrowTrackerContent />
    </Suspense>
  );
}
