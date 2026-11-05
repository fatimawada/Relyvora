import React from 'react';
import type { Metadata } from 'next';
import { VendorOnboardingFlow } from '@/components/vendor/VendorOnboardingFlow';

export const metadata: Metadata = {
  title: 'Vendor Onboarding & KYC — Relyvora Nigeria',
  description: 'Complete mandatory KYC and activate your Anchor-powered escrow vendor account for instant settlements.',
};

export default function VendorOnboardingPage() {
  return (
    <div className="w-full min-h-[calc(100vh-140px)] bg-slate-50 flex flex-col justify-center py-6 sm:py-12">
      <VendorOnboardingFlow />
    </div>
  );
}
