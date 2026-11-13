'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ShieldCheck,
  Building2,
  Lock,
  User,
  Mail,
  Phone,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Store,
  CreditCard,
  Calendar,
  MapPin,
  Sparkles,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { AnchorBrandText } from '@/components/common/AnchorBrandText';

// List of major Nigerian commercial banks & digital BaaS institutions
export const NIGERIAN_BANKS = [
  { code: '000014', name: 'Access Bank' },
  { code: '000013', name: 'Guaranty Trust Bank (GTBank)' },
  { code: '000015', name: 'Zenith Bank' },
  { code: '000016', name: 'First Bank of Nigeria' },
  { code: '000004', name: 'United Bank for Africa (UBA)' },
  { code: '090405', name: 'Moniepoint Microfinance Bank' },
  { code: '090426', name: 'OPay Digital Services' },
  { code: '090339', name: 'PalmPay Limited' },
  { code: '090267', name: 'Kuda Microfinance Bank' },
  { code: '000023', name: 'Providus Bank' },
  { code: '000012', name: 'Stanbic IBTC Bank' },
  { code: '000003', name: 'First City Monument Bank (FCMB)' },
  { code: '000001', name: 'Sterling Bank' },
  { code: '000017', name: 'Wema Bank (ALAT)' },
  { code: '000007', name: 'Fidelity Bank' },
  { code: '000018', name: 'Union Bank of Nigeria' },
];

// Nigerian phone validation regex: +234 followed by 10 digits, or 0 followed by 10 digits
const nigerianPhoneRegex = /^(?:\+234|0)[789][01]\d{8}$/;

// STEP 1 SCHEMA: Basic Profile & Account Creation
export const step1Schema = z
  .object({
    storeName: z
      .string()
      .min(2, { message: 'Store / Business Name must be at least 2 characters.' })
      .max(60, { message: 'Store Name cannot exceed 60 characters.' }),
    email: z
      .string()
      .min(1, { message: 'Email address is required.' })
      .email({ message: 'Please enter a valid email address.' }),
    phoneNumber: z
      .string()
      .min(1, { message: 'Phone number is required.' })
      .refine(
        (val) => nigerianPhoneRegex.test(val.replace(/\s+/g, '')),
        { message: 'Enter a valid Nigerian phone number (e.g., +2348012345678 or 08012345678).' }
      ),
    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters long.' }),
    confirmPassword: z
      .string()
      .min(1, { message: 'Please confirm your password.' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type Step1FormData = z.infer<typeof step1Schema>;

// STEP 2 SCHEMA: KYC & Payout Activation (Regulatory Payload)
export const step2Schema = z.object({
  legalFirstName: z
    .string()
    .min(2, { message: 'Legal First Name must be at least 2 characters.' }),
  legalLastName: z
    .string()
    .min(2, { message: 'Legal Last Name must be at least 2 characters.' }),
  dateOfBirth: z
    .string()
    .min(1, { message: 'Date of Birth is required for KYC compliance.' })
    .refine((val) => {
      const birthDate = new Date(val);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age >= 18;
    }, { message: 'You must be at least 18 years old to operate an escrow vendor account.' }),
  gender: z.enum(['FEMALE', 'MALE', 'OTHER'], {
    message: 'Please select a gender.',
  }),
  address: z
    .string()
    .min(5, { message: 'Residential or business address must be at least 5 characters.' }),
  idType: z.enum(['BVN', 'NIN'], {
    message: 'Please select an ID type (BVN or NIN).',
  }),
  idNumber: z
    .string()
    .min(1, { message: 'ID Number is required.' })
    .regex(/^\d{11}$/, { message: 'ID Number must be exactly 11 numeric digits.' }),
  bankCode: z
    .string()
    .min(1, { message: 'Please select your settlement commercial bank.' }),
  accountNumber: z
    .string()
    .min(1, { message: 'NUBAN Account Number is required.' })
    .regex(/^\d{10}$/, { message: 'NUBAN Account Number must be exactly 10 digits.' }),
});

export type Step2FormData = z.infer<typeof step2Schema>;

export function VendorOnboardingFlow() {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [step1Data, setStep1Data] = useState<Step1FormData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Step 1 Form Hook
  const {
    register: registerStep1,
    handleSubmit: handleSubmitStep1,
    formState: { errors: errorsStep1 },
  } = useForm<Step1FormData>({
    resolver: zodResolver(step1Schema),
    mode: 'onTouched',
  });

  // Step 2 Form Hook
  const {
    register: registerStep2,
    handleSubmit: handleSubmitStep2,
    watch: watchStep2,
    formState: { errors: errorsStep2 },
  } = useForm<Step2FormData>({
    resolver: zodResolver(step2Schema),
    mode: 'onTouched',
    defaultValues: {
      idType: 'BVN',
      gender: 'FEMALE',
    },
  });

  const selectedIdType = watchStep2('idType');

  // Handle Step 1 Submission
  const onStep1Submit = (data: Step1FormData) => {
    setServerError(null);
    setStep1Data(data);
    setCurrentStep(2);
    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle Step 2 Final Submission
  const onStep2Submit = async (data: Step2FormData) => {
    setIsSubmitting(true);
    setServerError(null);

    try {
      const fullPayload = {
        profile: step1Data,
        regulatoryKyc: data,
      };

      const response = await fetch('/api/vendor/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullPayload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to activate vendor account.');
      }

      setIsSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setServerError(err.message || 'An error occurred during verification. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-8 sm:py-12">
      {/* Brand & BaaS Trust Header */}
      <div className="text-center space-y-3 mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-xs font-sans font-semibold text-emerald-800 shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <AnchorBrandText>Anchor BaaS Regulated Onboarding</AnchorBrandText>
        </div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-slate-900 tracking-tight">
          Vendor Onboarding &amp; Verification
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
          Create your Relyvora seller profile and activate bank payouts{' '}
          <AnchorBrandText>powered by Anchor Technologies</AnchorBrandText>.
        </p>
      </div>

      {/* Two-Step Progress Stepper */}
      {!isSuccess && (
        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -z-10" />
            
            {/* Stepper Node 1 */}
            <div className="flex flex-col items-center gap-1.5 bg-white px-2">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  currentStep >= 1
                    ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                    : 'bg-slate-100 text-slate-400 border border-slate-300'
                }`}
              >
                {currentStep > 1 ? <CheckCircle2 className="w-5 h-5" /> : '1'}
              </div>
              <span className={`text-[11px] font-semibold ${currentStep === 1 ? 'text-slate-900' : 'text-slate-500'}`}>
                Account Profile
              </span>
            </div>

            {/* Stepper Node 2 */}
            <div className="flex flex-col items-center gap-1.5 bg-white px-2">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  currentStep === 2
                    ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                    : 'bg-slate-100 text-slate-400 border border-slate-300'
                }`}
              >
                2
              </div>
              <span className={`text-[11px] font-semibold ${currentStep === 2 ? 'text-slate-900' : 'text-slate-500'}`}>
                KYC &amp; Payouts
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS CONFIRMATION STATE */}
      {isSuccess ? (
        <div className="p-7 sm:p-9 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-6 text-center animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              KYC Verified &amp; Account Activated!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-sm mx-auto">
              Your store <strong>{step1Data?.storeName}</strong> has been registered. Your{' '}
              <AnchorBrandText>Anchor-powered</AnchorBrandText> escrow settlement wallet is active and ready to receive buyer payments.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-left space-y-2 text-xs font-sans">
            <div className="flex items-center justify-between text-slate-700">
              <span className="text-slate-500">BaaS Ledger:</span>
              <span className="font-sans font-semibold text-emerald-700">
                <AnchorBrandText>Anchor Technologies (CBN Regulated)</AnchorBrandText>
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span className="text-slate-500">Settlement Account:</span>
              <span className="font-heading tabular-nums font-semibold text-slate-900">Verified NUBAN</span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span className="text-slate-500">Instant Release:</span>
              <span className="font-semibold text-emerald-700">6-Digit Key Verification</span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/vendor"
              className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all"
            >
              <span>Go to Vendor Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : (
        /* ONBOARDING FORM CARD */
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/90 shadow-xl space-y-6">
          
          {serverError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          {/* STEP 1: BASIC PROFILE */}
          {currentStep === 1 && (
            <form onSubmit={handleSubmitStep1(onStep1Submit)} className="space-y-4">
              <div className="border-b border-slate-100 pb-3 mb-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-600" />
                  <span>Step 1: Store &amp; Contact Profile</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set up your public social commerce store credentials.
                </p>
              </div>

              {/* Store Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>Store / Business Name</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    {...registerStep1('storeName')}
                    placeholder="e.g. Adebayo Gadgets & Luxury Wigs"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors ${
                      errorsStep1.storeName
                        ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
                {errorsStep1.storeName && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorsStep1.storeName.message}</span>
                  </p>
                )}
              </div>

              {/* Email Address */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>Email Address</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    {...registerStep1('email')}
                    placeholder="merchant@example.com"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors ${
                      errorsStep1.email
                        ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
                {errorsStep1.email && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorsStep1.email.message}</span>
                  </p>
                )}
              </div>

              {/* Phone Number */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>Phone Number (WhatsApp Active)</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    {...registerStep1('phoneNumber')}
                    placeholder="+2348012345678 or 08012345678"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors ${
                      errorsStep1.phoneNumber
                        ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
                {errorsStep1.phoneNumber && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorsStep1.phoneNumber.message}</span>
                  </p>
                )}
              </div>

              {/* Password & Confirm Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Password</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      {...registerStep1('password')}
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors ${
                        errorsStep1.password
                          ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                          : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                      }`}
                    />
                  </div>
                  {errorsStep1.password && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep1.password.message}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Confirm Password</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      {...registerStep1('confirmPassword')}
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors ${
                        errorsStep1.confirmPassword
                          ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                          : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                      }`}
                    />
                  </div>
                  {errorsStep1.confirmPassword && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep1.confirmPassword.message}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Step 1 Action Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all transform active:scale-[0.99]"
                >
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="text-center pt-2">
                <p className="text-xs text-slate-500">
                  Already have a verified vendor wallet?{' '}
                  <Link href="/vendor" className="text-emerald-700 font-semibold hover:underline">
                    Log in here
                  </Link>
                </p>
              </div>
            </form>
          )}

          {/* STEP 2: REGULATORY KYC & PAYOUT ACTIVATION */}
          {currentStep === 2 && (
            <form onSubmit={handleSubmitStep2(onStep2Submit)} className="space-y-4">
              {/* Mandatory Regulatory Warning Alert */}
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-900 text-xs sm:text-sm flex items-start gap-3 shadow-2xs">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="font-bold text-amber-950 block">
                    Important: Name Matching Requirement
                  </strong>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    To receive instant payouts, your Legal Name must exactly match the name on your BVN/NIN and Bank Account. Payouts cannot be routed to mismatched third-party accounts.
                  </p>
                </div>
              </div>

              <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Step 2: KYC &amp; Settlement Account</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Store: <strong className="text-slate-800">{step1Data?.storeName}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
              </div>

              {/* Full Legal Name (First and Last) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Legal First Name</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    {...registerStep2('legalFirstName')}
                    placeholder="e.g. Fatima"
                    className={`w-full px-3.5 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors ${
                      errorsStep2.legalFirstName
                        ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                  {errorsStep2.legalFirstName && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.legalFirstName.message}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Legal Last Name</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    {...registerStep2('legalLastName')}
                    placeholder="e.g. Wada"
                    className={`w-full px-3.5 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors ${
                      errorsStep2.legalLastName
                        ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                  {errorsStep2.legalLastName && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.legalLastName.message}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Date of Birth & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Date of Birth</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      {...registerStep2('dateOfBirth')}
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 transition-colors ${
                        errorsStep2.dateOfBirth
                          ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                          : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                      }`}
                    />
                  </div>
                  {errorsStep2.dateOfBirth && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.dateOfBirth.message}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Gender</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    {...registerStep2('gender')}
                    className={`w-full px-3.5 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 transition-colors ${
                      errorsStep2.gender
                        ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  >
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="OTHER">Other</option>
                  </select>
                  {errorsStep2.gender && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.gender.message}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Residential / Business Address */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>Residential / Business Address</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <textarea
                    rows={2}
                    {...registerStep2('address')}
                    placeholder="Enter your street address, city, and state (e.g. 14 Wuse II, Abuja, FCT)"
                    className={`w-full p-3.5 rounded-xl border text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors resize-none ${
                      errorsStep2.address
                        ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
                {errorsStep2.address && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorsStep2.address.message}</span>
                  </p>
                )}
              </div>

              {/* ID Type & ID Number */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>ID Type</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    {...registerStep2('idType')}
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="BVN">BVN (Bank Verification Number)</option>
                    <option value="NIN">NIN (National Identity Number)</option>
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>{selectedIdType} Number (Exactly 11 Digits)</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    {...registerStep2('idNumber')}
                    placeholder="22222222222"
                    className={`w-full px-3.5 py-3 rounded-xl border font-heading tabular-nums text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors ${
                      errorsStep2.idNumber
                        ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                  {errorsStep2.idNumber && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.idNumber.message}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Settlement Bank Name & Account Number */}
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>Settlement Bank Name</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    {...registerStep2('bankCode')}
                    className={`w-full px-3.5 py-3 rounded-xl border text-xs sm:text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 transition-colors ${
                      errorsStep2.bankCode
                        ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  >
                    <option value="">Select your commercial bank...</option>
                    {NIGERIAN_BANKS.map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                  {errorsStep2.bankCode && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.bankCode.message}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span>NUBAN Account Number (Exactly 10 Digits)</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={10}
                      {...registerStep2('accountNumber')}
                      placeholder="0123456789"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border font-heading tabular-nums text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-colors ${
                        errorsStep2.accountNumber
                          ? 'border-rose-500 focus:ring-rose-400/20 bg-rose-50/20'
                          : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                      }`}
                    />
                  </div>
                  {errorsStep2.accountNumber && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorsStep2.accountNumber.message}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Step 2 Action Buttons */}
              <div className="pt-4 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-5 py-3.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors"
                >
                  Back
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex-1 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all transform active:scale-[0.99]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        Verifying with <AnchorBrandText>Anchor BaaS</AnchorBrandText>...
                      </span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify &amp; Activate Payouts</span>
                    </>
                  )}
                </button>
              </div>

              {/* Regulatory Footer Pill */}
              <div className="pt-3 text-center border-t border-slate-100">
                <p className="text-[11px] text-slate-400 font-sans">
                  Encrypted TLS 1.3 • Data processed in compliance with NDPA 2023 &amp; CBN AML Regulations
                </p>
              </div>
            </form>
          )}

        </div>
      )}
    </div>
  );
}
