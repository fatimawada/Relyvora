import React from 'react';
import type { Metadata } from 'next';
import { VendorPortalClient } from '@/components/vendor/VendorPortalClient';
import { getVendorGateSnapshotServer } from '@/lib/launchGates';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendor Dashboard — Relyvora Nigeria',
  description: 'Sign in with a six-digit email code to check your Relyvora vendor account status and orders.',
};

export default async function VendorDashboardPage() {
  const initialGates = await getVendorGateSnapshotServer(null);
  return <VendorPortalClient initialGates={initialGates} />;
}
