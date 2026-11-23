'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ShieldCheck,
  Lock,
  Mail,
  Phone,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Store,
  CreditCard,
  Calendar,
  KeyRound,
  Loader2,
  Clock,
} from 'lucide-react';
import { AnchorBrandText } from '@/components/common/AnchorBrandText';
import { TurnstileWidget } from '@/components/common/TurnstileWidget';
import { supabase } from '@/lib/supabase';
import { NIGERIAN_BANKS } from '@/lib/nigerianBanks';
import type { PaymentsMode } from '@/lib/paymentsMode';

export { NIGERIAN_BANKS };

const nigerianPhoneRegex = /^(?:\+234|0)[789][01]\d{8}$/;

// STEP 1 SCHEMA: Open Sign-Up (Store name, Email, WhatsApp number ONLY)
export const step1Schema = z.object({
  storeName: z
    .string()
    .trim()
    .min(2, { message: 'Store name must be at least 2 characters.' })
    .max(60, { message: 'Store name cannot exceed 60 characters.' }),
  email: z
    .string()
    .trim()
    .min(1, { message: 'Email address is required.' })
    .email({ message: 'Please enter a valid email address.' }),
  phoneNumber: z
    .string()
    .trim()
    .min(1, { message: 'WhatsApp number is required.' })
    .refine(
      (val) => nigerianPhoneRegex.test(val.replace(/\s+/g, '')),
      { message: 'Enter a valid Nigerian WhatsApp number (e.g. 0801 000 0000 or +2348010000000).' }
    ),
});

export type Step1FormData = z.infer<typeof step1Schema>;

// STEP 2 SCHEMA: Active ONLY when KYC_ENABLED is true
export const step2Schema = z.object({
  legalFirstName: z
    .string()
    .trim()
    .min(2, { message: 'Legal first name must be at least 2 characters.' }),
  legalLastName: z
    .string()
    .trim()
    .min(2, { message: 'Legal last name must be at least 2 characters.' }),
  dateOfBirth: z
    .string()
    .min(1, { message: 'Date of birth is required for verification.' })
    .refine((val) => {
      const birthDate = new Date(val);
      if (Number.isNaN(birthDate.getTime())) return false;
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age >= 18;
    }, { message: 'You must be at least 18 years old.' }),
  gender: z.enum(['FEMALE', 'MALE', 'OTHER'], {
    message: 'Please select a gender.',
  }),
  address: z
    .string()
    .trim()
    .min(5, { message: 'Residential or business address must be at least 5 characters.' }),
  idType: z.enum(['BVN', 'NIN'], {
    message: 'Please select BVN or NIN.',
  }),
  idNumber: z
    .string()
    .trim()
    .min(1, { message: 'ID number is required.' })
    .regex(/^\d{11}$/, { message: 'ID number must be exactly 11 digits.' }),
  bankCode: z
    .string()
    .min(1, { message: 'Please select your commercial bank.' }),
  accountNumber: z
    .string()
    .trim()
    .min(1, { message: 'Account number is required.' })
    .regex(/^\d{10}$/, { message: 'Account number must be exactly 10 digits.' }),
});

export type Step2FormData = z.infer<typeof step2Schema>;

export interface VendorOnboardingFlowProps {
  initialKycEnabled?: boolean;
  initialLaunchStatus?: 'launching' | 'live';
  initialPaymentsMode?: PaymentsMode;
  initialReleaseTemplateApproved?: boolean;
}

export function VendorOnboardingFlow({
  initialKycEnabled = false,
}: VendorOnboardingFlowProps) {
  const [isHydrating, setIsHydrating] = useState(true);
  const [kycEnabled, setKycEnabled] = useState<boolean>(initialKycEnabled);
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [step1Phase, setStep1Phase] = useState<'form' | 'otp'>('form');
  const [step1Data, setStep1Data] = useState<Step1FormData | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [magicLinkSentNotice, setMagicLinkSentNotice] = useState<string | null>(null);
  const [waitlistRecorded, setWaitlistRecorded] = useState<boolean>(false);

  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [captchaResetKey, setCaptchaResetKey] = useState<number>(0);
  const [acceptedTermsAndProhibitedItems, setAcceptedTermsAndProhibitedItems] = useState(false);
  const [emailConfirmationNotice, setEmailConfirmationNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAlreadyVerified, setIsAlreadyVerified] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const turnstileSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();

  const {
    register: registerStep1,
    handleSubmit: handleSubmitStep1,
    setValue: setValueStep1,
    formState: {
      errors: errorsStep1,
      touchedFields: touchedStep1,
      isSubmitted: isSubmittedStep1,
    },
  } = useForm<Step1FormData>({
    resolver: zodResolver(step1Schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      storeName: '',
      email: '',
      phoneNumber: '',
    },
  });

  const {
    register: registerStep2,
    handleSubmit: handleSubmitStep2,
    watch: watchStep2,
    formState: {
      errors: errorsStep2,
      touchedFields: touchedStep2,
      isSubmitted: isSubmittedStep2,
    },
  } = useForm<Step2FormData>({
    resolver: zodResolver(step2Schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      idType: 'BVN',
      gender: 'FEMALE',
    },
  });

  const selectedIdType = watchStep2('idType');

  const syncWaitlistProfile = useCallback(
    async (profile: { storeName: string; phoneNumber: string }, accessToken?: string | null) => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }
        const res = await fetch('/api/vendor/waitlist', {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            storeName: profile.storeName.trim(),
            phoneNumber: profile.phoneNumber.trim(),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) {
          setWaitlistRecorded(true);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrateSessionAndGates() {
      try {
        const searchParams =
          typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const confirmedParam = searchParams?.get('confirmed') === '1';

        const { data: sessionData } = await supabase.auth.getSession();
        if (cancelled) return;

        const accessToken = sessionData?.session?.access_token || null;
        const statusRes = await fetch('/api/vendor/status', {
          cache: 'no-store',
          credentials: 'include',
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        }).catch(() => null);

        const statusJson = statusRes ? await statusRes.json().catch(() => null) : null;
        if (cancelled) return;

        if (statusJson?.gates && typeof statusJson.gates.kycEnabled === 'boolean') {
          setKycEnabled(statusJson.gates.kycEnabled);
        }

        const user = sessionData?.session?.user;
        const confirmedEmail =
          (statusJson?.user?.email || user?.email || '').trim().toLowerCase();

        let savedProfile: { storeName?: string; email?: string; phoneNumber?: string } | null = null;
        if (typeof window !== 'undefined') {
          try {
            const raw = window.localStorage.getItem('relyvora_pending_onboarding_profile');
            if (raw) {
              savedProfile = JSON.parse(raw);
            }
          } catch {
            savedProfile = null;
          }
        }

        const accountStoreName =
          String(
            statusJson?.vendor?.storeName ||
              statusJson?.user?.storeName ||
              user?.user_metadata?.store_name ||
              savedProfile?.storeName ||
              ''
          ).trim();
        const accountPhone =
          String(
            statusJson?.vendor?.phoneNumber ||
              statusJson?.user?.phoneNumber ||
              user?.user_metadata?.phone_number ||
              savedProfile?.phoneNumber ||
              ''
          ).trim();

        if (statusJson?.waitlistRecorded) {
          setWaitlistRecorded(true);
        }

        if (confirmedEmail) {
          setValueStep1('email', confirmedEmail, { shouldValidate: false, shouldTouch: false });
          if (accountStoreName) {
            setValueStep1('storeName', accountStoreName, { shouldValidate: false, shouldTouch: false });
          }
          if (accountPhone) {
            setValueStep1('phoneNumber', accountPhone, { shouldValidate: false, shouldTouch: false });
          }

          if (statusJson?.vendor?.kycStatus === 'verified') {
            setStep1Data({
              storeName: accountStoreName || 'Your store',
              email: confirmedEmail,
              phoneNumber: accountPhone || '',
            });
            setIsAlreadyVerified(true);
            setIsSuccess(true);
            setCurrentStep(2);
            return;
          }

          if (accountStoreName && accountPhone) {
            setStep1Data({
              storeName: accountStoreName,
              email: confirmedEmail,
              phoneNumber: accountPhone,
            });
            if (!statusJson?.waitlistRecorded) {
              await syncWaitlistProfile(
                { storeName: accountStoreName, phoneNumber: accountPhone },
                accessToken
              );
            }
            if (cancelled) return;
            setCurrentStep(2);
            if (confirmedParam) {
              setEmailConfirmationNotice(`Email confirmed (${confirmedEmail}).`);
            }
            return;
          }

          if (confirmedParam) {
            setEmailConfirmationNotice(
              `Email confirmed (${confirmedEmail}). Enter your store name and WhatsApp number below to continue.`
            );
          }
        } else if (confirmedParam) {
          setEmailConfirmationNotice(
            'Your email address has been confirmed. Enter your email to receive a 6-digit sign-in code or continue.'
          );
        }
      } catch {
        // Ignore mount hydration failures cleanly
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    }

    hydrateSessionAndGates();
    return () => {
      cancelled = true;
    };
  }, [setValueStep1, syncWaitlistProfile]);

  const sendOtpForStep1 = async (data: Step1FormData) => {
    const targetEmail = data.email.trim().toLowerCase();
    const cleanStore = data.storeName.trim();
    const cleanPhone = data.phoneNumber.trim();
    const currentCaptchaToken = captchaToken.trim();

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          'relyvora_pending_onboarding_profile',
          JSON.stringify({
            storeName: cleanStore,
            email: targetEmail,
            phoneNumber: cleanPhone,
          })
        );
      } catch {
        // ignore storage quota errors
      }
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        ...(currentCaptchaToken ? { captchaToken: currentCaptchaToken } : {}),
        data: {
          store_name: cleanStore,
          phone_number: cleanPhone,
        },
      },
    });

    setCaptchaToken('');
    setCaptchaResetKey((k) => k + 1);

    if (error) {
      throw new Error(error.message || 'Could not send verification code. Please try again.');
    }

    setStep1Data({ storeName: cleanStore, email: targetEmail, phoneNumber: cleanPhone });
    setPendingEmail(targetEmail);
    setOtpCode('');
    setOtpError(null);
    setMagicLinkSentNotice(null);
    setStep1Phase('otp');
  };

  const onStep1Submit = async (data: Step1FormData) => {
    setIsSubmitting(true);
    setServerError(null);
    setEmailConfirmationNotice(null);

    try {
      const targetEmail = data.email.trim().toLowerCase();
      const { data: sessionData } = await supabase.auth.getSession();
      const activeEmail = sessionData?.session?.user?.email?.trim().toLowerCase();

      // Already signed in with matching confirmed email -> record waitlist and advance with no extra code needed
      if (sessionData?.session?.access_token && activeEmail === targetEmail) {
        const cleanProfile = {
          storeName: data.storeName.trim(),
          email: targetEmail,
          phoneNumber: data.phoneNumber.trim(),
        };
        setStep1Data(cleanProfile);
        await syncWaitlistProfile(cleanProfile, sessionData.session.access_token);
        setCurrentStep(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (turnstileSiteKey && !captchaToken.trim()) {
        setServerError('Security check is still loading. Please try again in a moment.');
        return;
      }

      await sendOtpForStep1(data);
    } catch (err: any) {
      setServerError(err?.message || 'Unable to start verification. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyStep1Otp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otpCode.replace(/\D/g, '').trim();
    if (cleanOtp.length !== 6) {
      setOtpError('Enter the 6-digit code sent to your email.');
      return;
    }

    setIsSubmitting(true);
    setOtpError(null);
    setServerError(null);

    try {
      let verifyResult = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: cleanOtp,
        type: 'email',
      });

      if (verifyResult.error) {
        // Fallback check if Supabase issued a signup confirmation OTP
        const signupVerify = await supabase.auth.verifyOtp({
          email: pendingEmail,
          token: cleanOtp,
          type: 'signup',
        });
        if (!signupVerify.error && signupVerify.data?.session) {
          verifyResult = signupVerify;
        }
      }

      if (verifyResult.error || !verifyResult.data?.session) {
        setOtpError('That code is invalid or has expired. Tap "Send a new code" to get a fresh one.');
        return;
      }

      const token = verifyResult.data.session.access_token;
      if (step1Data) {
        const savedOk = await syncWaitlistProfile(step1Data, token);
        if (!savedOk) {
          setServerError('Your email is confirmed, and your account will finish syncing on the next step.');
        }
      }

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem('relyvora_pending_onboarding_profile');
        } catch {
          // ignore
        }
      }

      setCurrentStep(2);
      setStep1Phase('form');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setOtpError('Could not verify that code. Request a new code and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendStep1Otp = async (asFallbackLink = false) => {
    if (!step1Data) return;
    if (turnstileSiteKey && !captchaToken.trim()) {
      setOtpError('Please wait for the security check to complete before requesting a new code.');
      return;
    }

    setIsSubmitting(true);
    setOtpError(null);
    setMagicLinkSentNotice(null);

    try {
      await sendOtpForStep1(step1Data);
      if (asFallbackLink) {
        setMagicLinkSentNotice(
          `We sent a confirmation link and fresh code to ${step1Data.email}. Opening the link confirms your email and takes you straight to Step 2.`
        );
      } else {
        setMagicLinkSentNotice(`A new 6-digit code was sent to ${step1Data.email}.`);
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Unable to send a new code right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onStep2Submit = async (data: Step2FormData) => {
    if (!kycEnabled) {
      setServerError('Verification opens when payments go live.');
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      if (!acceptedTermsAndProhibitedItems) {
        throw new Error(
          'Please accept the Relyvora Terms of Service, Privacy Policy, and Prohibited Items Policy to continue.'
        );
      }
      if (turnstileSiteKey && !captchaToken.trim()) {
        throw new Error('Security check incomplete. Please try submitting again.');
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const fullPayload = {
        profile: step1Data,
        regulatoryKyc: data,
        captchaToken: captchaToken.trim(),
        acceptedTermsAndProhibitedItems,
      };

      const response = await fetch('/api/vendor/onboarding', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(fullPayload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setCaptchaToken('');
        setCaptchaResetKey((k) => k + 1);
        throw new Error(result.error || 'Failed to verify vendor account.');
      }

      setIsSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setServerError(err.message || 'Verification could not be completed. Please check your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOutOnboarding = async () => {
    await supabase.auth.signOut();
    setStep1Data(null);
    setCurrentStep(1);
    setStep1Phase('form');
    setWaitlistRecorded(false);
    setEmailConfirmationNotice(null);
    setServerError(null);
  };

  if (isHydrating) {
    return (
      <div className="w-full max-w-xl mx-auto px-4 py-12 text-center space-y-3">
        <Loader2 className="w-7 h-7 animate-spin text-accent mx-auto" />
        <p className="text-xs sm:text-sm text-muted">Checking your vendor account...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="text-center space-y-3 mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs font-sans font-semibold text-accent shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" />
          <span>{kycEnabled ? 'Vendor Verification' : 'Open Vendor Sign-Up'}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-main tracking-tight">
          Create your Relyvora seller account
        </h1>
        <p className="text-xs sm:text-sm text-muted max-w-md mx-auto">
          {kycEnabled
            ? 'Verify your store email, WhatsApp number, and bank payout details.'
            : 'Register your store with your email and WhatsApp number. Verification and payment links open when payments go live.'}
        </p>
      </div>

      {/* Two-Step Stepper */}
      {!isSuccess && (
        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -z-10" />

            <div className="flex flex-col items-center gap-1.5 bg-site px-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  currentStep >= 1
                    ? 'bg-accent text-white ring-4 ring-accent/20'
                    : 'bg-surface text-muted border border-border'
                }`}
              >
                {currentStep > 1 ? <CheckCircle2 className="w-5 h-5" /> : '1'}
              </div>
              <span className={`text-[11px] font-semibold ${currentStep === 1 ? 'text-main' : 'text-muted'}`}>
                Store Sign-Up
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5 bg-site px-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  currentStep === 2
                    ? kycEnabled
                      ? 'bg-accent text-white ring-4 ring-accent/20'
                      : 'bg-amber-600 text-white ring-4 ring-amber-100'
                    : 'bg-surface text-muted border border-border'
                }`}
              >
                {currentStep === 2 && !kycEnabled ? <Lock className="w-4 h-4" /> : '2'}
              </div>
              <span className={`text-[11px] font-semibold ${currentStep === 2 ? 'text-main' : 'text-muted'}`}>
                KYC &amp; Payouts
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS STATE (KYC VERIFIED) */}
      {isSuccess ? (
        <div className="p-7 sm:p-9 rounded-3xl bg-surface border border-border shadow-card space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 text-accent border border-accent/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-heading font-bold text-main tracking-tight">
              {isAlreadyVerified ? 'Vendor Account Verified' : 'Verification Complete'}
            </h2>
            <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-sm mx-auto">
              Your store <strong>{step1Data?.storeName}</strong> is verified and ready for settlement when payments go live.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-site border border-border text-left space-y-2 text-xs font-sans">
            <div className="flex items-center justify-between text-main">
              <span className="text-muted">Settlement Partner:</span>
              <span className="font-semibold text-accent">
                <AnchorBrandText>Anchor Technologies</AnchorBrandText>
              </span>
            </div>
            <div className="flex items-center justify-between text-main">
              <span className="text-muted">Settlement Account:</span>
              <span className="font-semibold text-main">Verified and name-matched</span>
            </div>
            <div className="flex items-center justify-between text-main">
              <span className="text-muted">Delivery Release:</span>
              <span className="font-semibold text-accent">6-digit buyer code</span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/vendor"
              className="w-full py-4 rounded-xl bg-accent hover:opacity-90 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-card transition-all"
            >
              <span>Go to Vendor Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border shadow-card space-y-6">
          {serverError && (
            <div role="status" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          {emailConfirmationNotice && (
            <div role="status" className="p-4 rounded-xl bg-accent/10 border border-accent/25 text-main text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span>{emailConfirmationNotice}</span>
            </div>
          )}

          {/* STEP 1A: BASIC STORE SIGN-UP (3 FIELDS ONLY: STORE NAME, EMAIL, WHATSAPP) */}
          {currentStep === 1 && step1Phase === 'form' && (
            <form onSubmit={handleSubmitStep1(onStep1Submit)} noValidate className="space-y-4">
              <div className="border-b border-border pb-3 mb-2">
                <h2 className="text-base font-heading font-bold text-main flex items-center gap-2">
                  <Store className="w-4 h-4 text-accent" />
                  <span>Step 1: Store Details</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  We will email you a six-digit code to confirm your account. No password needed.
                </p>
              </div>

              {/* Store Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                  <span>Store name</span>
                  <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Store className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    {...registerStep1('storeName')}
                    placeholder="Your store or business name"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-site text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 transition-colors ${
                      errorsStep1.storeName && (touchedStep1.storeName || isSubmittedStep1)
                        ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                        : 'border-border focus:border-accent focus:ring-accent/20'
                    }`}
                  />
                </div>
                {errorsStep1.storeName && (touchedStep1.storeName || isSubmittedStep1) && (
                  <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorsStep1.storeName.message}</span>
                  </p>
                )}
              </div>

              {/* Email Address */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                  <span>Email address</span>
                  <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    autoComplete="email"
                    {...registerStep1('email')}
                    placeholder="you@yourstore.com"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-site text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 transition-colors ${
                      errorsStep1.email && (touchedStep1.email || isSubmittedStep1)
                        ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                        : 'border-border focus:border-accent focus:ring-accent/20'
                    }`}
                  />
                </div>
                {errorsStep1.email && (touchedStep1.email || isSubmittedStep1) && (
                  <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorsStep1.email.message}</span>
                  </p>
                )}
              </div>

              {/* WhatsApp Number */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                  <span>WhatsApp number</span>
                  <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    autoComplete="tel"
                    {...registerStep1('phoneNumber')}
                    placeholder="0800 000 0000 or +2348000000000"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-site text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 transition-colors ${
                      errorsStep1.phoneNumber && (touchedStep1.phoneNumber || isSubmittedStep1)
                        ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                        : 'border-border focus:border-accent focus:ring-accent/20'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-muted">
                  Used for order notifications once payments open.
                </p>
                {errorsStep1.phoneNumber && (touchedStep1.phoneNumber || isSubmittedStep1) && (
                  <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorsStep1.phoneNumber.message}</span>
                  </p>
                )}
              </div>

              {/* Invisible / interaction-only Turnstile */}
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetKey={captchaResetKey}
                theme="light"
                appearance="interaction-only"
                onVerify={(token) => {
                  setCaptchaToken(token);
                  setServerError(null);
                }}
                onExpire={() => setCaptchaToken('')}
              />

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-card transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending verification code...</span>
                    </>
                  ) : (
                    <>
                      <span>Send me a code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="text-center pt-2">
                <p className="text-xs text-muted">
                  Already have a vendor account?{' '}
                  <Link href="/vendor" className="text-accent font-semibold hover:underline">
                    Sign in here
                  </Link>
                </p>
              </div>
            </form>
          )}

          {/* STEP 1B: 6-DIGIT EMAIL CODE VERIFICATION */}
          {currentStep === 1 && step1Phase === 'otp' && (
            <form onSubmit={handleVerifyStep1Otp} noValidate className="space-y-4">
              <div className="border-b border-border pb-3">
                <h2 className="text-base font-heading font-bold text-main flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-accent" />
                  <span>Confirm your email with a 6-digit code</span>
                </h2>
                <p className="text-xs text-muted mt-1">
                  Enter the 6-digit code we sent to <strong className="text-main">{pendingEmail}</strong>.
                </p>
              </div>

              {otpError && (
                <div role="status" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{otpError}</span>
                </div>
              )}

              {magicLinkSentNotice && (
                <div role="status" className="p-3.5 rounded-xl bg-accent/10 border border-accent/25 text-main text-xs">
                  {magicLinkSentNotice}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-main block">6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/\D/g, ''));
                    setOtpError(null);
                  }}
                  placeholder="Enter 6-digit code"
                  className="w-full px-4 py-3.5 rounded-xl border border-border bg-site text-center text-xl font-heading tabular-nums font-bold tracking-[0.25em] text-main placeholder:text-sm placeholder:font-sans placeholder:tracking-normal placeholder:font-normal placeholder:text-muted focus:outline-none focus:ring-2 focus:border-accent focus:ring-accent/20"
                />
              </div>

              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetKey={captchaResetKey}
                theme="light"
                appearance="interaction-only"
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken('')}
              />

              <button
                type="submit"
                disabled={isSubmitting || otpCode.trim().length !== 6}
                className="w-full py-4 rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-card transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify code &amp; continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleResendStep1Otp(false)}
                  className="font-semibold text-accent hover:underline cursor-pointer disabled:opacity-50"
                >
                  Send a new code
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleResendStep1Otp(true)}
                  className="text-muted hover:text-main hover:underline cursor-pointer disabled:opacity-50"
                >
                  Use a confirmation link instead
                </button>
              </div>

              <div className="pt-2 border-t border-border text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep1Phase('form');
                    setOtpError(null);
                    setMagicLinkSentNotice(null);
                  }}
                  className="text-xs text-muted hover:text-main cursor-pointer"
                >
                  Change email or store details
                </button>
              </div>
            </form>
          )}

          {/* STEP 2A: LOCKED STATE WHILE KYC_ENABLED === FALSE (OPTION B DEFAULT) */}
          {currentStep === 2 && !kycEnabled && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-amber-200 text-[11px] font-semibold text-amber-800">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Step 2 Locked</span>
                </div>
                <h2 className="text-lg sm:text-xl font-heading font-bold text-main tracking-tight">
                  Verification opens when payments go live.
                </h2>
                <p className="text-xs sm:text-sm text-muted leading-relaxed">
                  We do not collect BVN, NIN, date of birth, or payout bank details until live payments open.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-accent/5 border border-accent/20 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{waitlistRecorded ? 'Waitlist Confirmed' : 'Account Saved'}</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Your store account is saved on the waitlist. No WhatsApp or email message will be sent until our notification templates are approved.
                </p>

                <div className="bg-surface border border-border rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">Store name</span>
                    <span className="font-semibold text-main">{step1Data?.storeName || 'Saved on account'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">Email</span>
                    <span className="font-semibold text-main">{step1Data?.email || 'Confirmed'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">WhatsApp</span>
                    <span className="font-semibold text-main">{step1Data?.phoneNumber || 'Saved on account'}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                <Link
                  href="/vendor"
                  className="w-full py-3.5 px-5 rounded-xl bg-accent hover:opacity-90 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-card transition-all"
                >
                  <span>Go to Vendor Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted" />
                  <span>Payments open soon</span>
                </span>
                <button
                  type="button"
                  onClick={handleSignOutOnboarding}
                  className="hover:text-main hover:underline cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}

          {/* STEP 2B: ACTIVE ANCHOR KYC FORM ONLY WHEN KYC_ENABLED === TRUE */}
          {currentStep === 2 && kycEnabled && (
            <form onSubmit={handleSubmitStep2(onStep2Submit)} noValidate className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="font-bold block">Name matching check</strong>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Your settlement bank account name must match the legal name on your BVN or NIN.
                  </p>
                </div>
              </div>

              <div className="border-b border-border pb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-heading font-bold text-main flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    <span>Step 2: Identity &amp; Payout Account</span>
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Store: <strong className="text-main">{step1Data?.storeName}</strong> • {step1Data?.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOutOnboarding}
                  className="text-xs font-semibold text-muted hover:text-main cursor-pointer shrink-0"
                >
                  Sign out
                </button>
              </div>

              {/* Legal Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                    <span>Legal first name</span>
                    <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    {...registerStep2('legalFirstName')}
                    placeholder="First name on your ID"
                    className={`w-full px-3.5 py-3 rounded-xl border bg-site text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 transition-colors ${
                      errorsStep2.legalFirstName && (touchedStep2.legalFirstName || isSubmittedStep2)
                        ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                        : 'border-border focus:border-accent focus:ring-accent/20'
                    }`}
                  />
                  {errorsStep2.legalFirstName && (touchedStep2.legalFirstName || isSubmittedStep2) && (
                    <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.legalFirstName.message}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                    <span>Legal surname</span>
                    <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    {...registerStep2('legalLastName')}
                    placeholder="Surname on your ID"
                    className={`w-full px-3.5 py-3 rounded-xl border bg-site text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 transition-colors ${
                      errorsStep2.legalLastName && (touchedStep2.legalLastName || isSubmittedStep2)
                        ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                        : 'border-border focus:border-accent focus:ring-accent/20'
                    }`}
                  />
                  {errorsStep2.legalLastName && (touchedStep2.legalLastName || isSubmittedStep2) && (
                    <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.legalLastName.message}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Date of Birth & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                    <span>Date of birth</span>
                    <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      {...registerStep2('dateOfBirth')}
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-site text-xs sm:text-sm text-main focus:outline-none focus:ring-2 transition-colors ${
                        errorsStep2.dateOfBirth && (touchedStep2.dateOfBirth || isSubmittedStep2)
                          ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                          : 'border-border focus:border-accent focus:ring-accent/20'
                      }`}
                    />
                  </div>
                  {errorsStep2.dateOfBirth && (touchedStep2.dateOfBirth || isSubmittedStep2) && (
                    <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.dateOfBirth.message}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                    <span>Gender</span>
                    <span className="text-rose-600">*</span>
                  </label>
                  <select
                    {...registerStep2('gender')}
                    className={`w-full px-3.5 py-3 rounded-xl border bg-site text-xs sm:text-sm text-main focus:outline-none focus:ring-2 transition-colors ${
                      errorsStep2.gender && (touchedStep2.gender || isSubmittedStep2)
                        ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                        : 'border-border focus:border-accent focus:ring-accent/20'
                    }`}
                  >
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                  <span>Residential or business address</span>
                  <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={2}
                  {...registerStep2('address')}
                  placeholder="Street address, city, and state"
                  className={`w-full p-3.5 rounded-xl border bg-site text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 transition-colors resize-none ${
                    errorsStep2.address && (touchedStep2.address || isSubmittedStep2)
                      ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                      : 'border-border focus:border-accent focus:ring-accent/20'
                  }`}
                />
                {errorsStep2.address && (touchedStep2.address || isSubmittedStep2) && (
                  <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorsStep2.address.message}</span>
                  </p>
                )}
              </div>

              {/* ID Type & ID Number */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                    <span>ID type</span>
                    <span className="text-rose-600">*</span>
                  </label>
                  <select
                    {...registerStep2('idType')}
                    className="w-full px-3.5 py-3 rounded-xl border border-border bg-site text-xs sm:text-sm text-main focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  >
                    <option value="BVN">BVN</option>
                    <option value="NIN">NIN</option>
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                    <span>{selectedIdType} number (11 digits)</span>
                    <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    {...registerStep2('idNumber')}
                    placeholder="11-digit verification number"
                    className={`w-full px-3.5 py-3 rounded-xl border bg-site font-heading tabular-nums text-xs sm:text-sm text-main placeholder:text-muted placeholder:font-sans focus:outline-none focus:ring-2 transition-colors ${
                      errorsStep2.idNumber && (touchedStep2.idNumber || isSubmittedStep2)
                        ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                        : 'border-border focus:border-accent focus:ring-accent/20'
                    }`}
                  />
                  {errorsStep2.idNumber && (touchedStep2.idNumber || isSubmittedStep2) && (
                    <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.idNumber.message}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Settlement Bank */}
              <div className="space-y-3 pt-1 border-t border-border">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                    <span>Settlement bank</span>
                    <span className="text-rose-600">*</span>
                  </label>
                  <select
                    {...registerStep2('bankCode')}
                    className={`w-full px-3.5 py-3 rounded-xl border bg-site text-xs sm:text-sm text-main focus:outline-none focus:ring-2 transition-colors ${
                      errorsStep2.bankCode && (touchedStep2.bankCode || isSubmittedStep2)
                        ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                        : 'border-border focus:border-accent focus:ring-accent/20'
                    }`}
                  >
                    <option value="">Select your bank</option>
                    {NIGERIAN_BANKS.map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                  {errorsStep2.bankCode && (touchedStep2.bankCode || isSubmittedStep2) && (
                    <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.bankCode.message}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-main flex items-center gap-1.5">
                    <span>Account number (10 digits)</span>
                    <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={10}
                      {...registerStep2('accountNumber')}
                      placeholder="10-digit account number"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-site font-heading tabular-nums text-xs sm:text-sm text-main placeholder:text-muted placeholder:font-sans focus:outline-none focus:ring-2 transition-colors ${
                        errorsStep2.accountNumber && (touchedStep2.accountNumber || isSubmittedStep2)
                          ? 'border-rose-500 focus:ring-rose-200 bg-rose-50/40'
                          : 'border-border focus:border-accent focus:ring-accent/20'
                      }`}
                    />
                  </div>
                  {errorsStep2.accountNumber && (touchedStep2.accountNumber || isSubmittedStep2) && (
                    <p className="text-[11px] text-rose-700 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.accountNumber.message}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="p-3.5 rounded-xl bg-site border border-border">
                <label className="flex items-start gap-2.5 text-xs text-main cursor-pointer leading-snug">
                  <input
                    type="checkbox"
                    checked={acceptedTermsAndProhibitedItems}
                    onChange={(e) => {
                      setAcceptedTermsAndProhibitedItems(e.target.checked);
                      if (e.target.checked) setServerError(null);
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent shrink-0"
                  />
                  <span>
                    I confirm my business complies with the{' '}
                    <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent font-semibold underline">
                      Terms of Service
                    </Link>
                    ,{' '}
                    <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent font-semibold underline">
                      Privacy Policy
                    </Link>
                    , and{' '}
                    <Link href="/prohibited-items" target="_blank" rel="noopener noreferrer" className="text-accent font-semibold underline">
                      Prohibited Items Policy
                    </Link>
                    .
                  </span>
                </label>
              </div>

              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetKey={captchaResetKey}
                theme="light"
                appearance="interaction-only"
                onVerify={(token) => {
                  setCaptchaToken(token);
                  setServerError(null);
                }}
                onExpire={() => setCaptchaToken('')}
              />

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-card transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting verification...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Complete verification</span>
                  </>
                )}
              </button>

              <div className="pt-3 text-center border-t border-border">
                <p className="text-[11px] text-muted font-sans">
                  Processed in compliance with NDPA 2023 and CBN AML requirements.{' '}
                  <AnchorBrandText>Verification powered by Anchor</AnchorBrandText>
                </p>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
