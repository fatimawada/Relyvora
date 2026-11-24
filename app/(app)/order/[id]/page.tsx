'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { isLiveMode } from '@/lib/paymentsMode';
import { supabase } from '@/lib/supabase';
import { Transaction } from '@/lib/types';
import { formatNaira } from '@/lib/pricing';
import { DISPUTE_SCENARIOS } from '@/lib/disputeScenarios';
import { StatusBadge } from '@/components/StatusBadge';
import { EscrowStepper } from '@/components/EscrowStepper';
import { TurnstileWidget } from '@/components/common/TurnstileWidget';
import { NIGERIAN_BANKS } from '@/components/vendor/VendorOnboardingFlow';
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
  Sparkles,
  AlertOctagon,
  XCircle,
  Upload,
  FileText,
  Clock,
  Landmark,
  ExternalLink,
} from 'lucide-react';

async function fileToBase64Payload(file: File): Promise<{
  fileName: string;
  mimeType: string;
  base64Data: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data: String(reader.result || ''),
      });
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function EscrowTrackerContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const isNewPayment = searchParams?.get('new_payment') === 'true';

  const [transaction, setTransaction] = useState<(Transaction & Record<string, any>) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [perspective, setPerspective] = useState<'buyer' | 'vendor'>('buyer');
  const [authenticatedRole, setAuthenticatedRole] = useState<'BUYER' | 'VENDOR' | 'ADMIN' | null>(null);
  const [authGate, setAuthGate] = useState<{
    code: string;
    error: string;
    preview?: Record<string, any> | null;
  } | null>(null);
  const [authTab, setAuthTab] = useState<'buyer' | 'vendor'>('buyer');
  const [buyerSignInCodeSent, setBuyerSignInCodeSent] = useState(false);
  const [buyerSignInOtp, setBuyerSignInOtp] = useState('');
  const [buyerSignInMask, setBuyerSignInMask] = useState<string | null>(null);
  const [buyerSignInMsg, setBuyerSignInMsg] = useState<string | null>(null);
  const [buyerSignInErr, setBuyerSignInErr] = useState<string | null>(null);
  const [isBuyerAuthBusy, setIsBuyerAuthBusy] = useState(false);
  const [vendorLoginEmail, setVendorLoginEmail] = useState('');
  const [vendorLoginPhase, setVendorLoginPhase] = useState<'email' | 'otp'>('email');
  const [vendorLoginOtp, setVendorLoginOtp] = useState('');
  const [vendorLoginCaptchaToken, setVendorLoginCaptchaToken] = useState('');
  const [vendorLoginCaptchaResetKey, setVendorLoginCaptchaResetKey] = useState(0);
  const [vendorLoginMsg, setVendorLoginMsg] = useState<string | null>(null);
  const [vendorLoginErr, setVendorLoginErr] = useState<string | null>(null);
  const [isVendorSigningIn, setIsVendorSigningIn] = useState(false);
  const turnstileSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();

  // Vendor code entry
  const [enteredCode, setEnteredCode] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [coolingNotice, setCoolingNotice] = useState<{
    message: string;
    payoutAvailableAt?: string | null;
    coolingWindowHours?: number;
  } | null>(null);
  const [sandboxSkipCoolingHold, setSandboxSkipCoolingHold] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);

  // Vendor dispatch proof state
  const [carrierName, setCarrierName] = useState('');
  const [carrierPhone, setCarrierPhone] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatchProofFile, setDispatchProofFile] = useState<File | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Handover proof upload
  const [handoverFile, setHandoverFile] = useState<File | null>(null);
  const [isUploadingHandover, setIsUploadingHandover] = useState(false);
  const [handoverNotice, setHandoverNotice] = useState<string | null>(null);

  // Dispute modal state (buyer & vendor)
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [disputeRole, setDisputeRole] = useState<'BUYER' | 'VENDOR'>('BUYER');
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(1);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeFile, setDisputeFile] = useState<File | null>(null);
  const [disputeOtp, setDisputeOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [disputeOtpNotice, setDisputeOtpNotice] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);

  // Post-dispute evidence & response
  const [extraEvidenceFile, setExtraEvidenceFile] = useState<File | null>(null);
  const [extraEvidenceNote, setExtraEvidenceNote] = useState('');
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [evidenceNotice, setEvidenceNotice] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [isSendingResponse, setIsSendingResponse] = useState(false);
  const [responseNotice, setResponseNotice] = useState<string | null>(null);

  // Refund destination verification state (Buyer OTP)
  const [refundBankCode, setRefundBankCode] = useState('');
  const [refundAccNum, setRefundAccNum] = useState('');
  const [refundOtpSent, setRefundOtpSent] = useState(false);
  const [refundOtpInput, setRefundOtpInput] = useState('');
  const [refundStatusMsg, setRefundStatusMsg] = useState<string | null>(null);
  const [refundErrorMsg, setRefundErrorMsg] = useState<string | null>(null);
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  // Buyer release code from localStorage (Sandbox mode ONLY)
  const [buyerReleaseCode, setBuyerReleaseCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Resend Release Code modal
  const [isResendModalOpen, setIsResendModalOpen] = useState(false);
  const [resendOtpSent, setResendOtpSent] = useState(false);
  const [resendOtpInput, setResendOtpInput] = useState('');
  const [resendMaskedPhone, setResendMaskedPhone] = useState<string | null>(null);
  const [resendOtpNotice, setResendOtpNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [isSendingResendOtp, setIsSendingResendOtp] = useState(false);
  const [isVerifyingResendOtp, setIsVerifyingResendOtp] = useState(false);

  const liveMode = isLiveMode() || transaction?.payments_mode === 'live';

  useEffect(() => {
    if (liveMode) {
      setBuyerReleaseCode(null);
      return;
    }
    if (typeof window !== 'undefined' && id) {
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
  }, [id, liveMode]);

  const getOrderAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  };

  const loadTransaction = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch(`/api/escrow/${encodeURIComponent(id)}`, {
        headers: authHeaders,
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.transaction) {
        const txData = json.transaction;
        const role = (json.authenticated_role || txData.authenticated_role || null) as
          | 'BUYER'
          | 'VENDOR'
          | 'ADMIN'
          | null;
        setTransaction(txData);
        setAuthGate(null);
        setAuthenticatedRole(role);
        const derivedPerspective: 'buyer' | 'vendor' = role === 'VENDOR' ? 'vendor' : 'buyer';
        setPerspective(derivedPerspective);
        setDisputeRole(role === 'VENDOR' ? 'VENDOR' : 'BUYER');
      } else {
        setTransaction(null);
        setAuthenticatedRole(null);
        setAuthGate({
          code: json.code || (res.status === 404 ? 'NOT_FOUND' : 'AUTH_REQUIRED'),
          error: json.error || 'Authentication required to access order tracker.',
          preview: json.transactionPreview || null,
        });
      }
    } catch {
      // ignore network error cleanly
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTransaction();
  }, [id]);

  const handleRequestBuyerSessionOtp = async () => {
    if (!id) return;
    setIsBuyerAuthBusy(true);
    setBuyerSignInErr(null);
    setBuyerSignInMsg(null);
    try {
      const res = await fetch('/api/escrow/buyer-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: id, action: 'request_code' }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setBuyerSignInCodeSent(true);
        setBuyerSignInMask(json.maskedPhone || null);
        if (!liveMode && json.sandbox_otp) {
          setBuyerSignInOtp(json.sandbox_otp);
        }
        setBuyerSignInMsg(
          json.whatsappSent === true
            ? `Enter the 6-digit WhatsApp sign-in code sent to ${json.maskedPhone || 'your WhatsApp'}.`
            : !liveMode && json.sandbox_otp
              ? 'Test sign-in code displayed (WhatsApp sends only to WHATSAPP_ALLOWED_RECIPIENTS).'
              : `Enter the 6-digit sign-in code for ${json.maskedPhone || 'your order'}.`
        );
      } else {
        setBuyerSignInErr(json.error || 'Could not send WhatsApp sign-in code.');
      }
    } catch (err: any) {
      setBuyerSignInErr(err?.message || 'Network error requesting WhatsApp code.');
    } finally {
      setIsBuyerAuthBusy(false);
    }
  };

  const handleVerifyBuyerSessionOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || buyerSignInOtp.trim().length !== 6) return;
    setIsBuyerAuthBusy(true);
    setBuyerSignInErr(null);
    try {
      const res = await fetch('/api/escrow/buyer-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: id,
          action: 'verify_code',
          code: buyerSignInOtp.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setBuyerSignInCodeSent(false);
        setBuyerSignInOtp('');
        setBuyerSignInMsg(null);
        await loadTransaction();
      } else {
        setBuyerSignInErr(json.error || 'Incorrect verification code.');
      }
    } catch (err: any) {
      setBuyerSignInErr(err?.message || 'Network error verifying code.');
    } finally {
      setIsBuyerAuthBusy(false);
    }
  };

  const handleSendVendorOrderOtp = async (e?: React.FormEvent, asFallbackLink = false) => {
    if (e) e.preventDefault();
    setVendorLoginErr(null);
    setVendorLoginMsg(null);
    const targetEmail = vendorLoginEmail.trim().toLowerCase();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setVendorLoginErr('Enter a valid vendor email address.');
      return;
    }
    if (turnstileSiteKey && !vendorLoginCaptchaToken.trim()) {
      setVendorLoginErr('Security check is still loading. Please try again in a moment.');
      return;
    }
    setIsVendorSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/order/${id}`)}`,
          ...(vendorLoginCaptchaToken.trim() ? { captchaToken: vendorLoginCaptchaToken.trim() } : {}),
        },
      });
      setVendorLoginCaptchaToken('');
      setVendorLoginCaptchaResetKey((k) => k + 1);
      if (error) {
        setVendorLoginErr(error.message || 'Could not send sign-in code.');
      } else {
        setVendorLoginEmail(targetEmail);
        setVendorLoginOtp('');
        setVendorLoginPhase('otp');
        setVendorLoginMsg(`Enter the 6-digit code sent to ${targetEmail}.`);
      }
    } catch (err: any) {
      setVendorLoginErr(err?.message || 'Unable to send code.');
      setVendorLoginCaptchaToken('');
      setVendorLoginCaptchaResetKey((k) => k + 1);
    } finally {
      setIsVendorSigningIn(false);
    }
  };

  const handleVendorOrderSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setVendorLoginErr(null);
    setVendorLoginMsg(null);
    const cleanOtp = vendorLoginOtp.replace(/\D/g, '').trim();
    if (cleanOtp.length !== 6) {
      setVendorLoginErr('Enter the 6-digit code sent to your email.');
      return;
    }
    setIsVendorSigningIn(true);
    try {
      const targetEmail = vendorLoginEmail.trim().toLowerCase();
      let res = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: cleanOtp,
        type: 'email',
      });
      if (res.error) {
        const signupFallback = await supabase.auth.verifyOtp({
          email: targetEmail,
          token: cleanOtp,
          type: 'signup',
        });
        if (!signupFallback.error && signupFallback.data?.session) {
          res = signupFallback;
        }
      }
      if (res.error || !res.data?.session) {
        setVendorLoginErr('That code is invalid or expired. Tap "Send a new code" to try again.');
      } else {
        setVendorLoginOtp('');
        setVendorLoginPhase('email');
        await loadTransaction();
      }
    } catch {
      setVendorLoginErr('Unable to verify that code. Send a new code and try again.');
    } finally {
      setIsVendorSigningIn(false);
    }
  };

  const handleSwitchOrderSession = async () => {
    await fetch('/api/escrow/buyer-session', { method: 'DELETE' }).catch(() => {});
    await supabase.auth.signOut().catch(() => {});
    setTransaction(null);
    setAuthenticatedRole(null);
    await loadTransaction();
  };

  useEffect(() => {
    if (isNewPayment && transaction?.status === 'FUNDS_LOCKED') {
      try {
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
      } catch {
        // ignore
      }
    }
  }, [isNewPayment, transaction?.status]);

  const activeReleaseCode = liveMode ? null : buyerReleaseCode || transaction?.release_code || null;

  const handleCopyCode = () => {
    if (!activeReleaseCode) return;
    navigator.clipboard.writeText(activeReleaseCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleStartResendCode = async () => {
    if (!transaction) return;
    setIsResendModalOpen(true);
    setResendError(null);
    setResendSuccess(null);
    setResendOtpInput('');
    setIsSendingResendOtp(true);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch('/api/escrow/reissue-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ transactionId: transaction.id, action: 'send_otp' }),
      });
      const json = await res.json();
      if (json.success) {
        setResendOtpSent(true);
        setResendMaskedPhone(json.buyer_phone_masked || transaction.buyer_phone_masked || '******');
        if (!liveMode && json.sandbox_otp) {
          setResendOtpInput(json.sandbox_otp);
        }
        setResendOtpNotice(
          json.whatsappSent === true
            ? `6-digit verification code sent via WhatsApp to ${json.buyer_phone_masked || transaction.buyer_phone_masked || 'your WhatsApp'}.`
            : !liveMode && json.sandbox_otp
              ? `Test verification code: ${json.sandbox_otp} (sandbox WhatsApp sends only to WHATSAPP_ALLOWED_RECIPIENTS).`
              : `Enter the 6-digit verification code for ${json.buyer_phone_masked || transaction.buyer_phone_masked || 'this order'}.`
        );
      } else {
        setResendError(json.error || 'Could not send verification code.');
      }
    } catch (err: any) {
      setResendError(err?.message || 'Network error while sending verification code.');
    } finally {
      setIsSendingResendOtp(false);
    }
  };

  const handleConfirmResendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    if (resendOtpInput.trim().length !== 6) {
      setResendError('Please enter the 6-digit verification code sent to your phone.');
      return;
    }

    setIsVerifyingResendOtp(true);
    setResendError(null);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch('/api/escrow/reissue-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          transactionId: transaction.id,
          action: 'verify_and_reissue',
          otp: resendOtpInput.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        if (!liveMode && json.sandbox_release_code) {
          setBuyerReleaseCode(json.sandbox_release_code);
          if (typeof window !== 'undefined') {
            localStorage.setItem(
              `relyvora_buyer_escrow_${transaction.id}`,
              JSON.stringify({
                transactionId: transaction.id,
                releaseCode: json.sandbox_release_code,
                timestamp: Date.now(),
              })
            );
          }
        }
        setResendSuccess(
          json.whatsappSent === true
            ? json.message ||
                `A new release code was sent to ${json.buyer_phone_masked || transaction.buyer_phone_masked || 'your WhatsApp number'}.`
            : !liveMode && json.sandbox_release_code
              ? `Test code: ${json.sandbox_release_code} — in live mode this is sent by WhatsApp.`
              : json.message || 'A new release code has been issued.'
        );
        setResendOtpSent(false);
        setResendOtpInput('');
        await loadTransaction();
      } else {
        setResendError(json.error || 'Failed to verify one-time code.');
      }
    } catch (err: any) {
      setResendError(err?.message || 'Network error verifying code.');
    } finally {
      setIsVerifyingResendOtp(false);
    }
  };

  // Vendor Action: Mark Dispatched with mandatory Proof of Dispatch
  const handleMarkDispatched = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction || transaction.status !== 'FUNDS_LOCKED') return;
    setDispatchError(null);
    setIsDispatching(true);
    try {
      let proofFilePayload = undefined;
      if (dispatchProofFile) {
        proofFilePayload = await fileToBase64Payload(dispatchProofFile);
      }

      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch('/api/escrow/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          transactionId: transaction.id,
          carrierName: carrierName.trim(),
          carrierPhone: carrierPhone.trim(),
          trackingReference: trackingReference.trim(),
          dispatchNotes: dispatchNotes.trim(),
          proofFile: proofFilePayload,
        }),
      });
      const json = await res.json();
      if (json.success && json.transaction) {
        setDispatchProofFile(null);
        await loadTransaction();
      } else {
        setDispatchError(json.error || 'Failed to mark order dispatched.');
      }
    } catch (err: any) {
      setDispatchError(err?.message || 'Network error during dispatch submission.');
    } finally {
      setIsDispatching(false);
    }
  };

  // Vendor Action: Upload Delivery Handover Proof
  const handleUploadHandoverProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction || !handoverFile) return;
    setIsUploadingHandover(true);
    setHandoverNotice(null);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const fd = new FormData();
      fd.append('transactionId', transaction.id);
      fd.append('evidenceCategory', 'DELIVERY_HANDOVER_PROOF');
      fd.append('description', 'Delivery rider handover proof / signed waybill');
      fd.append('file', handoverFile);
      const res = await fetch('/api/escrow/evidence/upload', {
        method: 'POST',
        headers: authHeaders,
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setHandoverNotice('Handover proof uploaded privately.');
        setHandoverFile(null);
        await loadTransaction();
      } else {
        alert(json.error || 'Failed to upload handover proof.');
      }
    } catch (err: any) {
      alert(err?.message || 'Network error uploading handover proof.');
    } finally {
      setIsUploadingHandover(false);
    }
  };

  // Vendor Action: Verify 6-digit Code to Release Funds
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    setVerificationError(null);

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
      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch('/api/escrow/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          transactionId: transaction.id,
          releaseCode: cleanInput,
          ...(!liveMode ? { sandboxSkipCoolingHold } : {}),
        }),
      });

      const json = await res.json();
      if (res.status === 202 || json.coolingActive) {
        setVerificationError(null);
        setCoolingNotice({
          message:
            json.message ||
            'Release code verified. Giving the code releases the money; payout enters a short cooling hold.',
          payoutAvailableAt: json.payoutAvailableAt || null,
          coolingWindowHours: json.coolingWindowHours,
        });
        setEnteredCode('');
      } else if (json.success && json.transaction) {
        setCoolingNotice(null);
        setTransaction(json.transaction);
        setEnteredCode('');
        try {
          confetti({ particleCount: 100, spread: 90, origin: { y: 0.5 } });
        } catch {
          // ignore
        }
      } else {
        if (json.isLocked) {
          setVerificationError('SECURITY LOCKOUT: 5 incorrect attempts exceeded. Escrow is now locked.');
          setTransaction((prev) => (prev ? { ...prev, code_locked: true, failed_code_attempts: 5 } : null));
        } else if (json.remainingAttempts !== undefined) {
          setVerificationError(`Invalid 6-digit release code. ${json.remainingAttempts} attempt(s) remaining.`);
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

  // Buyer Action: Send Dispute OTP
  const handleSendDisputeOtp = async () => {
    if (!transaction || !disputeReason.trim()) {
      setDisputeError('Please describe the reason for your dispute first.');
      return;
    }

    setIsSendingOtp(true);
    setDisputeError(null);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch('/api/escrow/dispute/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ transactionId: transaction.id }),
      });

      const json = await res.json();
      if (json.success) {
        setOtpSent(true);
        setMaskedPhone(json.maskedPhone || 'your registered phone');
        if (json.sandbox_otp) {
          setDisputeOtp(json.sandbox_otp);
        }
        setDisputeOtpNotice(
          json.whatsappSent === true
            ? `Enter 6-Digit Verification Code sent to ${json.maskedPhone || 'your WhatsApp'}:`
            : !liveMode && json.sandbox_otp
              ? `Test dispute verification code: ${json.sandbox_otp} (WhatsApp sends only to WHATSAPP_ALLOWED_RECIPIENTS).`
              : `Enter 6-Digit Verification Code for ${json.maskedPhone || 'this order'}:`
        );
      } else {
        setDisputeError(json.error || 'Failed to send verification code.');
      }
    } catch (err: any) {
      setDisputeError(`Network error sending code: ${err.message}`);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Buyer or Vendor: Open Dispute with Scenario + Optional Evidence
  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction || !disputeReason.trim()) return;

    if (disputeRole === 'BUYER' && !otpSent) {
      await handleSendDisputeOtp();
      return;
    }

    if (disputeRole === 'BUYER' && disputeOtp.trim().length !== 6) {
      setDisputeError('Please enter the 6-digit verification code sent to your phone.');
      return;
    }

    setIsSubmittingDispute(true);
    setDisputeError(null);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const evidenceFiles = disputeFile ? [await fileToBase64Payload(disputeFile)] : [];
      const res = await fetch('/api/escrow/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          transactionId: transaction.id,
          disputeReason: disputeReason.trim(),
          scenarioId: selectedScenarioId,
          otp: disputeRole === 'BUYER' ? disputeOtp.trim() : undefined,
          evidenceFiles,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setIsDisputeModalOpen(false);
        setOtpSent(false);
        setDisputeOtp('');
        setDisputeFile(null);
        await loadTransaction();
      } else {
        setDisputeError(json.error || 'Dispute submission failed.');
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

  // Post-Dispute Evidence Upload
  const handleUploadDisputeEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction || !extraEvidenceFile) return;
    setIsUploadingEvidence(true);
    setEvidenceError(null);
    setEvidenceNotice(null);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const fd = new FormData();
      fd.append('transactionId', transaction.id);
      fd.append('evidenceCategory', 'DISPUTE_EVIDENCE');
      if (transaction.dispute_scenario) fd.append('scenarioId', String(transaction.dispute_scenario));
      if (extraEvidenceNote.trim()) fd.append('description', extraEvidenceNote.trim());
      fd.append('file', extraEvidenceFile);

      const res = await fetch('/api/escrow/evidence/upload', {
        method: 'POST',
        headers: authHeaders,
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setEvidenceNotice('Evidence uploaded securely to private storage.');
        setExtraEvidenceFile(null);
        setExtraEvidenceNote('');
        await loadTransaction();
      } else {
        setEvidenceError(json.error || 'Upload rejected.');
      }
    } catch (err: any) {
      setEvidenceError(err?.message || 'Network error uploading evidence.');
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  const handleOpenOwnEvidenceFile = async (fileId: string) => {
    if (!transaction) return;
    try {
      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch(
        `/api/escrow/evidence/signed-url?transactionId=${encodeURIComponent(transaction.id)}&fileId=${encodeURIComponent(fileId)}`,
        { headers: authHeaders }
      );
      const json = await res.json();
      if (json.success && json.signedUrl) {
        window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        alert(json.error || 'Unable to generate temporary download link.');
      }
    } catch (err: any) {
      alert(err?.message || 'Network error opening evidence file.');
    }
  };

  const handleSubmitDisputeResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction || responseText.trim().length < 3) return;
    setIsSendingResponse(true);
    setResponseNotice(null);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch('/api/escrow/dispute/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          transactionId: transaction.id,
          responseText: responseText.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setResponseNotice('Response submitted and logged for Trust & Safety review.');
        setResponseText('');
        await loadTransaction();
      } else {
        alert(json.error || 'Failed to record dispute response.');
      }
    } catch (err: any) {
      alert(err?.message || 'Network error submitting response.');
    } finally {
      setIsSendingResponse(false);
    }
  };

  const handleSendRefundDestOtp = async () => {
    if (!transaction) return;
    setIsSubmittingRefund(true);
    setRefundErrorMsg(null);
    setRefundStatusMsg(null);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch('/api/escrow/refund-destination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ transactionId: transaction.id, action: 'send_otp' }),
      });
      const json = await res.json();
      if (json.success) {
        setRefundOtpSent(true);
        setRefundStatusMsg(
          json.whatsappSent === true
            ? `OTP sent on WhatsApp to ${json.buyer_phone_masked || transaction.buyer_phone_masked || 'your WhatsApp'}.`
            : !liveMode && json.sandbox_otp
              ? `Test refund OTP: ${json.sandbox_otp} (sandbox WhatsApp sends only to WHATSAPP_ALLOWED_RECIPIENTS).`
              : 'Enter your 6-digit refund verification code.'
        );
        if (!liveMode && json.sandbox_otp) {
          setRefundOtpInput(json.sandbox_otp);
        }
      } else {
        setRefundErrorMsg(json.error || 'Could not send refund verification OTP.');
      }
    } catch (err: any) {
      setRefundErrorMsg(err?.message || 'Network error requesting OTP.');
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  const handleSaveRefundDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    setIsSubmittingRefund(true);
    setRefundErrorMsg(null);
    try {
      const authHeaders = await getOrderAuthHeaders();
      const res = await fetch('/api/escrow/refund-destination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          transactionId: transaction.id,
          action: 'verify_and_save',
          otp: refundOtpInput.trim(),
          bankCode: refundBankCode,
          accountNumber: refundAccNum.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRefundStatusMsg(
          `Refund destination verified (${json.destination?.maskedAccount || json.maskedAccount || 'saved'}).`
        );
        setRefundOtpSent(false);
        setRefundOtpInput('');
        await loadTransaction();
      } else {
        setRefundErrorMsg(json.error || 'Failed to verify refund bank account.');
      }
    } catch (err: any) {
      setRefundErrorMsg(err?.message || 'Network error verifying refund bank account.');
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  if (isLoading && !transaction) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-muted">Loading escrow tracker...</p>
      </div>
    );
  }

  if (authGate && !transaction && authGate.code !== 'NOT_FOUND') {
    const preview = authGate.preview || {};
    const buyerPhoneVerified = Boolean(preview.buyer_phone_verified);
    return (
      <div className="max-w-lg mx-auto my-10 px-4 w-full">
        <div className="bg-surface rounded-3xl border border-border p-6 sm:p-8 shadow-card space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-accent/15 text-accent border border-accent/25 mb-2">
                <Lock className="w-3 h-3" />
                <span>Protected Order Access</span>
              </span>
              <h1 className="text-xl font-heading font-semibold text-main">
                {preview.item_name ? `Verify identity for ${preview.item_name}` : 'Verify Your Order Session'}
              </h1>
              <p className="text-xs text-muted mt-1">
                {preview.vendor_handle ? `Seller: ${preview.vendor_handle} • ` : ''}
                {authGate.error}
              </p>
            </div>
          </div>

          <div className="bg-site p-1 rounded-2xl grid grid-cols-2 border border-border">
            <button
              type="button"
              onClick={() => setAuthTab('buyer')}
              className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                authTab === 'buyer' ? 'bg-surface text-main shadow-xs border border-border' : 'text-muted hover:text-main'
              }`}
            >
              <User className="w-3.5 h-3.5 text-accent" />
              <span>Buyer (WhatsApp OTP)</span>
            </button>
            <button
              type="button"
              onClick={() => setAuthTab('vendor')}
              className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                authTab === 'vendor' ? 'bg-surface text-main shadow-xs border border-border' : 'text-muted hover:text-main'
              }`}
            >
              <Store className="w-3.5 h-3.5 text-accent" />
              <span>Vendor Account</span>
            </button>
          </div>

          {authTab === 'buyer' ? (
            <div className="space-y-4">
              {!buyerPhoneVerified ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                  <p className="font-bold">WhatsApp confirmation required first</p>
                  <p>
                    Buyer sessions can only be created after you confirm your WhatsApp number on the checkout message. Check your checkout page or tap &ldquo;Confirm Order&rdquo; on Relyvora&apos;s WhatsApp message.
                  </p>
                  <Link
                    href={`/pay/${encodeURIComponent(id)}`}
                    className="inline-flex items-center gap-1 font-bold text-accent hover:underline"
                  >
                    Return to Checkout Page →
                  </Link>
                </div>
              ) : (
                <>
                  {buyerSignInErr && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
                      {buyerSignInErr}
                    </div>
                  )}
                  {buyerSignInMsg && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                      {buyerSignInMsg}
                    </div>
                  )}
                  <div className="p-3 rounded-2xl bg-site border border-border text-xs text-muted">
                    Verified Buyer WhatsApp: <strong className="text-main">{buyerSignInMask || preview.buyer_phone_masked || '******'}</strong>
                  </div>
                  {!buyerSignInCodeSent ? (
                    <button
                      type="button"
                      onClick={handleRequestBuyerSessionOtp}
                      disabled={isBuyerAuthBusy}
                      className="w-full py-3 rounded-xl bg-accent text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {isBuyerAuthBusy ? 'Sending WhatsApp Code...' : 'Send 6-Digit WhatsApp Sign-In Code'}
                    </button>
                  ) : (
                    <form onSubmit={handleVerifyBuyerSessionOtp} className="space-y-3">
                      <input
                        type="text"
                        maxLength={6}
                        required
                        placeholder="6-digit code"
                        value={buyerSignInOtp}
                        onChange={(e) => setBuyerSignInOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-site border border-border rounded-xl p-3 text-center text-xl font-heading tabular-nums font-bold tracking-widest text-main"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleRequestBuyerSessionOtp}
                          disabled={isBuyerAuthBusy}
                          className="px-3 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted hover:text-main cursor-pointer"
                        >
                          Send a new code
                        </button>
                        <button
                          type="submit"
                          disabled={isBuyerAuthBusy || buyerSignInOtp.trim().length !== 6}
                          className="flex-1 py-2.5 rounded-xl bg-accent text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                        >
                          {isBuyerAuthBusy ? 'Verifying...' : 'Verify & Open Order'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          ) : vendorLoginPhase === 'email' ? (
            <form onSubmit={(e) => handleSendVendorOrderOtp(e, false)} className="space-y-3">
              {vendorLoginErr && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
                  {vendorLoginErr}
                </div>
              )}
              {vendorLoginMsg && (
                <div className="p-3 rounded-xl bg-accent/10 border border-accent/25 text-xs text-main">
                  {vendorLoginMsg}
                </div>
              )}
              <input
                type="email"
                required
                placeholder="Vendor account email"
                value={vendorLoginEmail}
                onChange={(e) => setVendorLoginEmail(e.target.value)}
                className="w-full bg-site border border-border rounded-xl px-3 py-2.5 text-xs text-main"
              />
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetKey={vendorLoginCaptchaResetKey}
                theme="light"
                appearance="interaction-only"
                onVerify={(token) => {
                  setVendorLoginCaptchaToken(token);
                  setVendorLoginErr(null);
                }}
                onExpire={() => setVendorLoginCaptchaToken('')}
              />
              <button
                type="submit"
                disabled={isVendorSigningIn}
                className="w-full py-2.5 rounded-xl bg-accent text-white font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {isVendorSigningIn ? 'Sending code...' : 'Send me a code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVendorOrderSignIn} className="space-y-3">
              {vendorLoginErr && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
                  {vendorLoginErr}
                </div>
              )}
              {vendorLoginMsg && (
                <div className="p-3 rounded-xl bg-accent/10 border border-accent/25 text-xs text-main">
                  {vendorLoginMsg}
                </div>
              )}
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="Enter 6-digit code"
                value={vendorLoginOtp}
                onChange={(e) => setVendorLoginOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-site border border-border rounded-xl p-3 text-center text-lg font-heading tabular-nums font-bold tracking-widest text-main"
              />
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetKey={vendorLoginCaptchaResetKey}
                theme="light"
                appearance="interaction-only"
                onVerify={(token) => setVendorLoginCaptchaToken(token)}
                onExpire={() => setVendorLoginCaptchaToken('')}
              />
              <button
                type="submit"
                disabled={isVendorSigningIn || vendorLoginOtp.trim().length !== 6}
                className="w-full py-2.5 rounded-xl bg-accent text-white font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {isVendorSigningIn ? 'Verifying...' : 'Verify code & sign in'}
              </button>
              <div className="flex items-center justify-center text-xs pt-1">
                <button
                  type="button"
                  disabled={isVendorSigningIn}
                  onClick={() => handleSendVendorOrderOtp(undefined, false)}
                  className="font-semibold text-accent hover:underline cursor-pointer"
                >
                  Send a new code
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-surface rounded-3xl border border-border text-center space-y-4 shadow-card">
        <h2 className="text-lg font-heading font-semibold text-main">Order Not Found</h2>
        <Link
          href="/vendor"
          className="inline-block px-4 py-2 bg-surface hover:bg-site border border-border text-main text-xs font-semibold rounded-xl transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const isDisputed = transaction.status === 'DISPUTED' || transaction.status === 'RESOLVING';
  const isReleased = transaction.status === 'RELEASED';
  const isTerminated = ['EXPIRED', 'CANCELLED', 'REFUNDED'].includes(transaction.status);
  const isAwaitingPayment = transaction.status === 'AWAITING_PAYMENT';
  const isCodeLocked = Boolean(transaction.code_locked || (transaction.failed_code_attempts || 0) >= 5);
  const activeScenario = DISPUTE_SCENARIOS.find((s) => s.id === Number(transaction.dispute_scenario));
  const showResendPromptBanner =
    (transaction.whatsapp_delivery_status === 'failed' || Boolean(transaction.code_expired)) &&
    ['FUNDS_LOCKED', 'DISPATCHED'].includes(transaction.status);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/vendor"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-main transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Vendor Dashboard</span>
        </Link>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 bg-surface text-main border border-border shadow-xs">
            {perspective === 'vendor' ? (
              <Store className="w-3.5 h-3.5 text-accent" />
            ) : (
              <User className="w-3.5 h-3.5 text-accent" />
            )}
            <span>
              {authenticatedRole === 'ADMIN'
                ? 'Trust & Safety Admin Session'
                : perspective === 'vendor'
                  ? 'Authenticated Owning Vendor'
                  : 'Verified Buyer Session'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSwitchOrderSession}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-muted hover:text-main bg-site border border-border cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="bg-accent/10 border border-accent/20 rounded-2xl p-3 flex items-center justify-between text-xs text-main">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-accent" />
          <span>
            Authenticated role: <strong>{authenticatedRole || (perspective === 'vendor' ? 'VENDOR' : 'BUYER')}</strong>
          </span>
        </div>
        <button
          onClick={loadTransaction}
          className="p-1 hover:bg-accent/15 rounded-lg transition-colors cursor-pointer"
          title="Refresh transaction state"
        >
          <RefreshCw className="w-3.5 h-3.5 text-accent" />
        </button>
      </div>

      <EscrowStepper status={transaction.status} />

      {/* Failed Delivery / Expired Code Recovery Banner */}
      {showResendPromptBanner && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">
                {transaction.code_expired
                  ? 'Your release code window expired — your money stays safely held in escrow.'
                  : "Didn't receive your code? Send it again."}
              </p>
              <p className="text-[11px] opacity-90">
                Request a fresh 6-digit release code via verified WhatsApp OTP. Your previous code is disabled immediately.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStartResendCode}
            className="shrink-0 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
          >
            Didn&apos;t receive your code? Send it again
          </button>
        </div>
      )}

      {/* Active Risk Hold Banner */}
      {(transaction.order_blocked || transaction.review_hold) && (
        <div
          role="status"
          className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-900"
        >
          <AlertOctagon className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              {transaction.order_blocked
                ? 'Escrow Order Blocked Pending Security Investigation'
                : 'Trust & Safety Review Hold Active — Payout Paused'}
            </p>
            <p className="opacity-90">
              {transaction.order_block_reason ||
                transaction.review_hold_reason ||
                'Our risk desk is reviewing this order before payout can be released. Buyer funds remain safe in escrow.'}
            </p>
          </div>
        </div>
      )}

      {(coolingNotice ||
        (transaction.payout_available_at &&
          !isReleased &&
          new Date(transaction.payout_available_at).getTime() > Date.now())) && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900"
        >
          <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Payout Cooling Window Active (2-Hour Safety Hold)</p>
            <p>
              {coolingNotice?.message ||
                'Release code verified. Giving the code releases the money; payout enters a safety cooling hold so the buyer can flag any problem.'}
            </p>
          </div>
        </div>
      )}

      {/* Order Overview & Delivery Deadlines */}
      <div className="bg-surface rounded-3xl border border-border p-5 sm:p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted block">
              Order Reference
            </span>
            <h2 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
              {transaction.item_name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted">
              <span>ID: {transaction.id.slice(0, 8)}...</span>
              <span>•</span>
              <span>Vendor: {transaction.vendor_handle}</span>
              <span>•</span>
              <span>
                {transaction.delivery_type === 'interstate'
                  ? `Interstate (${transaction.delivery_window_days || 7}d + 3d grace)`
                  : `Same-City (${transaction.delivery_window_days || 3}d + 3d grace)`}
              </span>
            </div>
          </div>
          <div className="self-start sm:self-auto flex flex-col sm:items-end">
            <span className="text-xl sm:text-2xl font-heading font-bold text-main">
              {formatNaira(Number(transaction.total_amount))}
            </span>
            <div className="mt-1">
              <StatusBadge status={transaction.status} size="sm" />
            </div>
          </div>
        </div>

        {/* Delivery & Dispatch Deadlines Row */}
        {!isAwaitingPayment && !isTerminated && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
            <div className={`p-2.5 rounded-xl border ${transaction.is_dispatch_overdue ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-site border-border text-muted'}`}>
              <span className="font-bold block text-main">Dispatch Deadline</span>
              <span>
                {transaction.dispatched_at
                  ? `Dispatched ${new Date(transaction.dispatched_at).toLocaleDateString('en-NG')}`
                  : transaction.dispatch_deadline_at
                    ? new Date(transaction.dispatch_deadline_at).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' })
                    : 'Within 3 days of payment'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl border bg-site border-border text-muted">
              <span className="font-bold block text-main">Delivery Target</span>
              <span>
                {transaction.delivery_deadline_at
                  ? new Date(transaction.delivery_deadline_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })
                  : `${transaction.delivery_window_days || 3} days from payment`}
              </span>
            </div>
            <div className="p-2.5 rounded-xl border bg-site border-border text-muted">
              <span className="font-bold block text-main">Code Window (with Grace)</span>
              <span>
                {transaction.code_expires_at
                  ? new Date(transaction.code_expires_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })
                  : 'Active while in escrow'}
              </span>
            </div>
          </div>
        )}

        {isAwaitingPayment && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center space-y-2">
            <p className="text-xs text-amber-900 font-medium">
              This order has not been paid yet. The buyer must first pay into escrow.
            </p>
            <Link
              href={`/pay/${transaction.id}`}
              className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs"
            >
              Go to Buyer Checkout Page
            </Link>
          </div>
        )}

        {isTerminated && (
          <div className="bg-site border border-border rounded-2xl p-5 text-center space-y-2">
            <XCircle className="w-8 h-8 text-muted mx-auto" />
            <h3 className="text-sm font-heading font-semibold text-main">
              Order Status: {transaction.status}
            </h3>
            <p className="text-xs text-muted">
              {transaction.cancellation_reason || 'This escrow order has closed.'}
            </p>
          </div>
        )}

        {/* Shared Dispute Arbitration, Evidence & Response Section */}
        {isDisputed && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                <AlertOctagon className="w-5 h-5 shrink-0" />
                <span>
                  Dispute Open
                  {activeScenario ? ` — Scenario ${activeScenario.id}: ${activeScenario.name}` : ''}
                </span>
              </div>
              {transaction.dispute_sla && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 border border-rose-200 text-[11px] font-heading tabular-nums font-bold text-rose-800">
                  <Clock className="w-3.5 h-3.5" />
                  <span>SLA Remaining (08:00–20:00 WAT, Mon–Sat): {transaction.dispute_sla.formattedRemaining}</span>
                </div>
              )}
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-rose-500/20 text-xs space-y-1">
              <span className="font-bold text-main block">
                Opened by {transaction.dispute_raised_by || 'BUYER'}:
              </span>
              <p className="text-muted">&quot;{transaction.dispute_reason || 'Order disputed'}&quot;</p>
              {transaction.counterparty_response_text && (
                <p className="pt-2 border-t border-border text-main font-medium">
                  {transaction.counterparty_response_text}
                </p>
              )}
            </div>

            {/* Private Evidence Summary — Counterparty Count Only */}
            <div className="bg-surface p-3.5 rounded-xl border border-border text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-main flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-accent" />
                  <span>Private Dispute Evidence</span>
                </span>
                <span className="text-[11px] font-semibold text-muted">
                  Counterparty evidence files submitted:{' '}
                  <strong className="text-main">
                    {transaction.evidence_summary?.counterpartyDisputeEvidenceCount ?? 0}
                  </strong>{' '}
                  (private to Relyvora Trust &amp; Safety admins)
                </span>
              </div>

              {Array.isArray(transaction.evidence_summary?.ownFiles) &&
                transaction.evidence_summary.ownFiles.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-muted block">Your uploaded files:</span>
                    {transaction.evidence_summary.ownFiles.map((f: any) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-2 bg-site px-3 py-1.5 rounded-lg border border-border"
                      >
                        <span className="truncate text-[11px] font-medium text-main">
                          {f.original_filename || f.evidence_category} ({f.mime_type})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenOwnEvidenceFile(f.id)}
                          className="text-[11px] font-semibold text-accent hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

              <form onSubmit={handleUploadDisputeEvidence} className="pt-2 border-t border-border space-y-2">
                <span className="text-[11px] font-bold text-main block">
                  Upload Evidence ({perspective.toUpperCase()} — JPG/PNG/WEBP/PDF max 10MB, MP4 max 25MB):
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
                    onChange={(e) => setExtraEvidenceFile(e.target.files?.[0] || null)}
                    className="flex-1 text-xs text-main"
                  />
                  <input
                    type="text"
                    placeholder="Short caption (optional)"
                    value={extraEvidenceNote}
                    onChange={(e) => setExtraEvidenceNote(e.target.value)}
                    className="flex-1 bg-site border border-border rounded-lg px-2.5 py-1.5 text-xs text-main"
                  />
                  <button
                    type="submit"
                    disabled={isUploadingEvidence || !extraEvidenceFile}
                    className="px-3.5 py-1.5 rounded-lg bg-accent text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingEvidence ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
                {evidenceNotice && <p className="text-[11px] text-emerald-600 font-semibold">{evidenceNotice}</p>}
                {evidenceError && <p className="text-[11px] text-rose-600 font-semibold">{evidenceError}</p>}
              </form>

              <form onSubmit={handleSubmitDisputeResponse} className="pt-2 border-t border-border space-y-2">
                <label className="text-[11px] font-bold text-main block">
                  Submit Written Response ({perspective.toUpperCase()}):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add your explanation or tracking confirmation..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    className="flex-1 bg-site border border-border rounded-lg px-3 py-1.5 text-xs text-main"
                  />
                  <button
                    type="submit"
                    disabled={isSendingResponse || responseText.trim().length < 3}
                    className="px-3.5 py-1.5 rounded-lg bg-surface border border-border hover:bg-site text-main font-bold text-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSendingResponse ? 'Saving...' : 'Submit Response'}
                  </button>
                </div>
                {responseNotice && <p className="text-[11px] text-emerald-600 font-semibold">{responseNotice}</p>}
              </form>
            </div>
          </div>
        )}

        {/* PERSPECTIVE 1: BUYER VIEW */}
        {perspective === 'buyer' && !isAwaitingPayment && !isTerminated && (
          <div className="space-y-6 pt-2">
            {!isReleased && !isDisputed && (
              <div className="bg-surface text-main rounded-3xl p-6 sm:p-7 shadow-card relative overflow-hidden border-2 border-accent/30">
                <div className="relative z-10 space-y-4 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-accent/10 text-accent border border-accent/25 self-center sm:self-auto">
                      <KeyRound className="w-3.5 h-3.5 text-accent" />
                      <span>Delivery Release Code</span>
                    </div>
                    <span className="text-xs text-muted">Step 3 of 4: Doorstep Handover</span>
                  </div>

                  {liveMode ? (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <h3 className="text-lg sm:text-xl font-heading font-bold text-main">
                          Your release code was sent to {transaction.buyer_phone_masked || 'your WhatsApp number'}
                        </h3>
                        <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-xl">
                          Give the code to the dispatch rider only after you have opened the package and checked the items.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                        <button
                          type="button"
                          onClick={handleStartResendCode}
                          className="px-4 py-2.5 rounded-xl bg-site hover:bg-border/40 text-main text-xs font-bold flex items-center gap-2 border border-border transition-all cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-accent" />
                          <span>Didn&apos;t receive your code? Send it again</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                        <div>
                          <h3 className="text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 inline-block">
                            Test code: in live mode this is sent by WhatsApp.
                          </h3>
                          <div className="text-4xl sm:text-5xl font-heading tabular-nums font-bold tracking-widest text-accent mt-2 select-all">
                            {activeReleaseCode || '------'}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                          {activeReleaseCode && (
                            <button
                              type="button"
                              onClick={handleCopyCode}
                              className="px-4 py-2.5 rounded-xl bg-site hover:bg-border/40 text-main text-xs font-bold flex items-center justify-center gap-2 border border-border transition-all cursor-pointer"
                            >
                              {copiedCode ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
                              <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleStartResendCode}
                            className="px-4 py-2.5 rounded-xl bg-site hover:bg-border/40 text-main text-xs font-bold flex items-center justify-center gap-2 border border-border transition-all cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-accent" />
                            <span>Issue new test code</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {isCodeLocked && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Security Notice:</strong> Escrow release locked after 5 incorrect attempts. Your funds remain safe.
                      </div>
                    </div>
                  )}

                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs text-amber-950 leading-relaxed font-semibold">
                        IMPORTANT DELIVERY CHECK: Giving the code releases the money
                      </p>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        {liveMode
                          ? 'The release code is sent only to the buyer. Give the code to the dispatch rider only after you have opened the package and checked the items.'
                          : 'In live mode the release code is sent only to the buyer on WhatsApp. Give it only after opening and checking the package.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isReleased && (
              <div className="bg-accent/10 border border-accent/30 rounded-2xl p-5 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-accent mx-auto" />
                <h3 className="text-base font-heading font-semibold text-main">Order Completed &amp; Funds Released</h3>
                <p className="text-xs text-muted max-w-md mx-auto">
                  The delivery release code was verified and funds of {formatNaira(Number(transaction.item_price))} were moved to the vendor.
                </p>
                <div className="bg-surface border border-border rounded-xl p-3 text-left text-xs space-y-1.5 max-w-md mx-auto">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">Seller Payout Transfer:</span>
                    <span className="font-semibold text-main">
                      {formatNaira(Number(transaction.item_price))} • {transaction.anchor_vendor_transfer_id || transaction.payout_transfer_id || 'Recorded'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">Platform Fee Transfer:</span>
                    <span className="font-semibold text-main">
                      {formatNaira(Number(transaction.protection_fee))} • {transaction.anchor_fee_transfer_id || 'Recorded'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Buyer Verified Refund Account Section (WhatsApp OTP + Anchor Name Enquiry) */}
            {!isReleased && (
              <div className="bg-site border border-border rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-heading font-semibold text-main">
                      Verified Buyer Refund Bank Account
                    </h3>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      transaction.refund_destination_verified
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {transaction.refund_destination_verified
                      ? `Verified: ${transaction.refund_destination_masked || 'On file'}`
                      : 'Not yet confirmed'}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Refunds strictly go only to the originating sender account or a Nigerian NUBAN you verify via WhatsApp OTP.
                </p>

                {refundStatusMsg && (
                  <p className="text-xs text-emerald-800 font-semibold">{refundStatusMsg}</p>
                )}
                {refundErrorMsg && (
                  <p className="text-xs text-rose-700 font-semibold">{refundErrorMsg}</p>
                )}

                <form onSubmit={handleSaveRefundDestination} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="block text-[11px] font-bold text-main mb-1">Bank</label>
                    <select
                      value={refundBankCode}
                      onChange={(e) => setRefundBankCode(e.target.value)}
                      className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-main"
                    >
                      <option value="">Select bank...</option>
                      {NIGERIAN_BANKS.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-main mb-1">10-Digit NUBAN</label>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="10-digit account number"
                      value={refundAccNum}
                      onChange={(e) => setRefundAccNum(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs font-heading tabular-nums text-main"
                    />
                  </div>
                  {!refundOtpSent ? (
                    <button
                      type="button"
                      onClick={handleSendRefundDestOtp}
                      disabled={isSubmittingRefund || !refundBankCode || refundAccNum.length !== 10}
                      className="py-2 px-3 rounded-xl bg-accent text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingRefund ? 'Sending OTP...' : 'Confirm via WhatsApp OTP'}
                    </button>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="OTP"
                        value={refundOtpInput}
                        onChange={(e) => setRefundOtpInput(e.target.value.replace(/\D/g, ''))}
                        className="w-24 bg-surface border border-border rounded-xl px-2 py-2 text-xs font-heading tabular-nums text-center text-main"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingRefund || refundOtpInput.length !== 6}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* Buyer Open Dispute Button */}
            {!isReleased && !isDisputed && (
              <div className="pt-2 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-muted text-center sm:text-left">
                  <span>Received something wrong, late, or damaged?</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDisputeRole('BUYER');
                    setSelectedScenarioId(1);
                    setOtpSent(false);
                    setDisputeError(null);
                    setIsDisputeModalOpen(true);
                  }}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-700" />
                  <span>Wrong / Undelivered — Raise Dispute</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* PERSPECTIVE 2: VENDOR VIEW */}
        {perspective === 'vendor' && !isAwaitingPayment && !isTerminated && (
          <div className="space-y-6 pt-2">
            {/* 1. Proof of Dispatch Form */}
            <div className="bg-site border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-heading font-semibold text-main">
                    1. Proof of Dispatch &amp; Waybill
                  </h3>
                  <p className="text-xs text-muted">
                    Upload dispatch proof (photo, waybill receipt, or video) and courier details before marking dispatched.
                  </p>
                </div>
                {transaction.status === 'DISPATCHED' || isReleased ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
                    <Check className="w-3.5 h-3.5 text-accent" />
                    <span>Dispatched</span>
                  </span>
                ) : null}
              </div>

              {transaction.status === 'FUNDS_LOCKED' && (
                <form onSubmit={handleMarkDispatched} className="space-y-3">
                  {dispatchError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
                      {dispatchError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Courier / Dispatch Rider Name *"
                      value={carrierName}
                      onChange={(e) => setCarrierName(e.target.value)}
                      className="bg-surface border border-border rounded-xl px-3 py-2 text-xs text-main"
                    />
                    <input
                      type="tel"
                      required
                      placeholder="Rider or courier phone *"
                      value={carrierPhone}
                      onChange={(e) => setCarrierPhone(e.target.value)}
                      className="bg-surface border border-border rounded-xl px-3 py-2 text-xs text-main"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required={transaction.delivery_type === 'interstate'}
                      placeholder={
                        transaction.delivery_type === 'interstate'
                          ? 'Waybill / Tracking Number (Required for Interstate) *'
                          : 'Tracking / Waybill Ref (optional)'
                      }
                      value={trackingReference}
                      onChange={(e) => setTrackingReference(e.target.value)}
                      className="bg-surface border border-border rounded-xl px-3 py-2 text-xs text-main"
                    />
                    <input
                      type="text"
                      placeholder="Dispatch Notes (optional)"
                      value={dispatchNotes}
                      onChange={(e) => setDispatchNotes(e.target.value)}
                      className="bg-surface border border-border rounded-xl px-3 py-2 text-xs text-main"
                    />
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-3 space-y-1.5">
                    <label className="block text-[11px] font-bold text-main flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-accent" />
                      <span>Upload Package Photo, Video or Waybill Receipt *</span>
                    </label>
                    <input
                      type="file"
                      required
                      accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
                      onChange={(e) => setDispatchProofFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-main"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isDispatching}
                    className="w-full py-3 px-4 rounded-xl bg-accent hover:opacity-90 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-card disabled:opacity-60 cursor-pointer"
                  >
                    <Truck className="w-4 h-4 text-white" />
                    <span>{isDispatching ? 'Uploading & Updating Dispatch...' : 'Submit Proof & Mark Dispatched'}</span>
                  </button>
                </form>
              )}

              {(transaction.status === 'DISPATCHED' || isReleased) && (
                <div className="space-y-3 text-xs">
                  <div className="bg-surface border border-border rounded-xl p-3 flex flex-wrap gap-4 text-muted">
                    <span>
                      Courier: <strong className="text-main">{transaction.courier_name || 'Logged'}</strong>
                    </span>
                    {transaction.tracking_number && (
                      <span>
                        Tracking: <strong className="text-main">{transaction.tracking_number}</strong>
                      </span>
                    )}
                    <span>
                      Dispatch Proof Files:{' '}
                      <strong className="text-main">{transaction.evidence_summary?.dispatchProofCount ?? 1}</strong>
                    </span>
                  </div>

                  {!isReleased && (
                    <form onSubmit={handleUploadHandoverProof} className="bg-surface border border-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
                        onChange={(e) => setHandoverFile(e.target.files?.[0] || null)}
                        className="flex-1 text-xs text-main"
                      />
                      <button
                        type="submit"
                        disabled={isUploadingHandover || !handoverFile}
                        className="px-3.5 py-2 rounded-lg bg-site border border-border hover:bg-border/40 text-main font-bold text-xs cursor-pointer disabled:opacity-50"
                      >
                        {isUploadingHandover ? 'Uploading...' : 'Add Delivery Handover Proof'}
                      </button>
                    </form>
                  )}
                  {handoverNotice && <p className="text-[11px] text-emerald-600 font-semibold">{handoverNotice}</p>}
                </div>
              )}
            </div>

            {/* 2. Code Verification Input */}
            <div className="bg-site border border-border rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-heading font-semibold text-main">2. Unlock Escrow Payout</h3>
                <p className="text-xs text-muted mt-0.5">
                  Ask the buyer or delivery rider for the 6-digit release code given upon inspection.
                </p>
              </div>

              {isDisputed ? (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertOctagon className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>Code Entry Disabled:</strong> This transaction is in dispute. Escrow funds cannot be released until resolved.
                  </div>
                </div>
              ) : isCodeLocked ? (
                <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                    <AlertOctagon className="w-5 h-5 text-rose-700" />
                    <span>SECURITY LOCKOUT ACTIVATED</span>
                  </div>
                  <p className="text-xs text-rose-800 leading-relaxed">
                    Locked after 5 incorrect attempts. Please contact Relyvora Support.
                  </p>
                </div>
              ) : isReleased ? (
                <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-accent">
                    <span>Payout Unlocked ({formatNaira(Number(transaction.item_price))})</span>
                    <Sparkles className="w-4 h-4 text-accent" />
                  </div>
                  <div className="bg-surface border border-border rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted">Payout Transfer ({!liveMode ? 'Test' : 'Anchor'}):</span>
                      <span className="font-semibold text-main">
                        {formatNaira(Number(transaction.item_price))} • {transaction.anchor_vendor_transfer_id || transaction.payout_transfer_id || 'Recorded'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted">Fee Transfer ({!liveMode ? 'Test' : 'Anchor'}):</span>
                      <span className="font-semibold text-main">
                        {formatNaira(Number(transaction.protection_fee))} • {transaction.anchor_fee_transfer_id || 'Recorded'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      id="vendor-release-code-input"
                      name="releaseCode"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit code"
                      value={enteredCode}
                      onChange={(e) => {
                        setEnteredCode(e.target.value.replace(/\D/g, ''));
                        setVerificationError(null);
                      }}
                      className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-lg font-heading tabular-nums font-bold tracking-widest text-main text-center focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <button
                      type="submit"
                      disabled={isVerifying || enteredCode.trim().length !== 6}
                      className="px-5 py-3 rounded-xl bg-accent hover:opacity-90 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-card disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Verify &amp; Release</span>
                    </button>
                  </div>

                  {!liveMode && (
                    <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sandboxSkipCoolingHold}
                        onChange={(e) => setSandboxSkipCoolingHold(e.target.checked)}
                        className="rounded border-border text-accent focus:ring-accent cursor-pointer"
                      />
                      <span>Settle payout and fee transfer immediately in test mode (skip cooling hold)</span>
                    </label>
                  )}

                  {verificationError && (
                    <div role="status" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{verificationError}</span>
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Vendor Dispute Button (Scenario 2 / Scenario 3 Hostage / Unreachable Buyer) */}
            {!isReleased && !isDisputed && (
              <div className="pt-2 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-muted">
                  <span>Buyer refusing delivery or withholding code after taking item?</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDisputeRole('VENDOR');
                    setSelectedScenarioId(3);
                    setOtpSent(false);
                    setDisputeError(null);
                    setIsDisputeModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold text-xs flex items-center gap-2 cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Open Vendor Dispute</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resend Release Code Modal */}
      {isResendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs">
          <div className="bg-surface rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-border">
            <div className="bg-surface text-main p-5 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-accent" />
                <h3 className="font-heading font-semibold text-base text-main">Resend Release Code</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsResendModalOpen(false);
                  setResendError(null);
                }}
                className="text-muted hover:text-main cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmResendCode} className="p-5 sm:p-6 space-y-4">
              {resendSuccess ? (
                <div className="space-y-4 text-center py-2">
                  <CheckCircle2 className="w-10 h-10 text-accent mx-auto" />
                  <p className="text-xs sm:text-sm text-main font-medium leading-relaxed">{resendSuccess}</p>
                  <button
                    type="button"
                    onClick={() => setIsResendModalOpen(false)}
                    className="w-full py-2.5 rounded-xl bg-accent text-white font-bold text-xs sm:text-sm cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted leading-relaxed">
                    {resendOtpNotice ||
                      (liveMode
                        ? `Requesting a new release code sends a 6-digit verification code to ${resendMaskedPhone || transaction.buyer_phone_masked || 'your WhatsApp number'}. Any previous code stops working immediately.`
                        : 'Test mode: WhatsApp OTP sends only to numbers on WHATSAPP_ALLOWED_RECIPIENTS; otherwise test codes display on screen. Any previous release code stops working immediately.')}
                  </p>
                  {resendError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
                      {resendError}
                    </div>
                  )}
                  {isSendingResendOtp ? (
                    <div className="py-4 text-center text-xs text-muted">Sending one-time verification code...</div>
                  ) : resendOtpSent ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-main uppercase">
                        Enter 6-Digit Phone Verification Code:
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={resendOtpInput}
                        onChange={(e) => setResendOtpInput(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-site border border-border rounded-xl p-3 text-center text-xl font-heading tabular-nums font-bold tracking-widest text-main"
                      />
                    </div>
                  ) : null}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsResendModalOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-muted hover:text-main cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isVerifyingResendOtp || !resendOtpSent || resendOtpInput.trim().length !== 6}
                      className="px-4 py-2.5 rounded-xl bg-accent text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isVerifyingResendOtp ? 'Generating New Code...' : 'Verify & Issue New Code'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Raise Dispute Modal (Scenario Selector + Evidence Upload) */}
      {isDisputeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs">
          <div className="bg-surface rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-border">
            <div className="bg-rose-50 text-rose-950 p-5 flex items-center justify-between border-b border-rose-200">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-600" />
                <h3 className="font-heading font-semibold text-base text-rose-950">
                  {disputeRole === 'VENDOR' ? 'Open Vendor Dispute' : 'Freeze Escrow & Open Dispute'}
                </h3>
              </div>
              <button onClick={() => setIsDisputeModalOpen(false)} className="text-rose-700 hover:text-rose-950 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenDispute} className="p-5 sm:p-6 space-y-4">
              {disputeError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
                  {disputeError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-main uppercase mb-1.5">Dispute Category / Scenario:</label>
                <select
                  value={selectedScenarioId}
                  onChange={(e) => setSelectedScenarioId(Number(e.target.value))}
                  className="w-full bg-site border border-border rounded-xl px-3 py-2.5 text-xs text-main"
                >
                  {DISPUTE_SCENARIOS.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      Scenario {sc.id}: {sc.name} ({sc.slaLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-main uppercase mb-1.5">Detailed Reason:</label>
                <textarea
                  required
                  rows={3}
                  disabled={otpSent}
                  placeholder="Describe the exact issue..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full bg-site border border-border rounded-xl p-3 text-xs text-main"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-main uppercase mb-1.5">
                  Attach Evidence File (optional, private):
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
                  onChange={(e) => setDisputeFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-main"
                />
              </div>

              {disputeRole === 'BUYER' && otpSent && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2">
                  <label className="block text-xs font-bold text-rose-800 uppercase">
                    {disputeOtpNotice || `Enter 6-Digit Verification Code for ${maskedPhone}:`}
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={disputeOtp}
                    onChange={(e) => setDisputeOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-surface border border-rose-200 rounded-xl p-3 text-center text-xl font-heading tabular-nums font-bold tracking-widest text-main"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDisputeModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-muted hover:text-main cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingOtp || isSubmittingDispute || !disputeReason.trim()}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                    {isSendingOtp
                      ? 'Sending Code...'
                      : isSubmittingDispute
                        ? 'Submitting Dispute...'
                        : disputeRole === 'BUYER' && !otpSent
                          ? 'Send Verification Code'
                          : 'Submit & Freeze Escrow'}
                </button>
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
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-medium text-muted">Loading escrow tracker...</p>
        </div>
      }
    >
      <EscrowTrackerContent />
    </Suspense>
  );
}
