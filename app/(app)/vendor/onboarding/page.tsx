import React from 'react';
import type { Metadata } from 'next';
import { VendorOnboardingFlow } from '@/components/vendor/VendorOnboardingFlow';
import { isAnchorBrandApproved } from '@/lib/anchorBrand';
import {
  getLaunchStatusServer,
  isKycEnabledServer,
  isReleaseCodeTemplateApprovedServer,
} from '@/lib/launchGates';
import { getServerPaymentsMode } from '@/lib/paymentsMode';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendor Sign-Up & Verification — Relyvora Nigeria',
  description: isAnchorBrandApproved()
    ? 'Create your Relyvora Nigeria seller account and verify your payout details powered by Anchor.'
    : 'Create your Relyvora Nigeria seller account with email verification and WhatsApp updates.',
};

export default async function VendorOnboardingPage() {
  const [kycEnabled, releaseCodeTemplateApproved] = await Promise.all([
    isKycEnabledServer(),
    isReleaseCodeTemplateApprovedServer(),
  ]);
  const launchStatus = getLaunchStatusServer();
  const paymentsMode = getServerPaymentsMode();

  return (
    <div className="w-full min-h-[calc(100vh-140px)] bg-site flex flex-col justify-center py-6 sm:py-12">
      <VendorOnboardingFlow
        initialKycEnabled={kycEnabled}
        initialLaunchStatus={launchStatus}
        initialPaymentsMode={paymentsMode}
        initialReleaseTemplateApproved={releaseCodeTemplateApproved}
      />
    </div>
  );
}
