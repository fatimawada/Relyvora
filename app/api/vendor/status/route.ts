import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { extractRequestBearerToken, createRequestSsrClient } from '@/lib/vendorAuth';
import { getVendorGateSnapshotServer } from '@/lib/launchGates';

function maskAccountNumber(accountNumber?: string | null): string | null {
  const digits = String(accountNumber || '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `******${digits.slice(-4)}`;
}

/**
 * GET /api/vendor/status
 *
 * Returns current launch/feature gates (`kycEnabled`, `canCreateLinks`, `paymentsOpenStatus`)
 * plus, when authenticated, the vendor's non-PII onboarding status and first incomplete step.
 * Never exposes vendor lists or sensitive PII to logged-out callers.
 */
export async function GET(request: NextRequest) {
  try {
    const ssrClient = createRequestSsrClient(request);
    const bearerToken = extractRequestBearerToken(request);

    let authUser: any = null;
    try {
      const userRes = bearerToken
        ? await ssrClient.auth.getUser(bearerToken)
        : await ssrClient.auth.getUser();
      if (!userRes?.error && userRes?.data?.user?.email) {
        authUser = userRes.data.user;
      }
    } catch {
      authUser = null;
    }

    if (!authUser || !authUser.email_confirmed_at) {
      const publicGates = await getVendorGateSnapshotServer(null);
      return NextResponse.json({
        success: true,
        authenticated: false,
        gates: publicGates,
      });
    }

    const normalizedEmail = String(authUser.email).trim().toLowerCase();
    const meta = (authUser.user_metadata || {}) as Record<string, any>;
    const adminDb = getServiceSupabase();

    const { data: vendorRow } = await adminDb
      .from('vendors')
      .select(
        'id, user_id, store_name, email, phone_number, phone_verified, kyc_status, payout_account_verified, settlement_account_name_matched, settlement_account_number, settlement_bank_code, is_allowlisted, is_suspended'
      )
      .or(`user_id.eq.${authUser.id},email.eq.${normalizedEmail}`)
      .limit(1)
      .maybeSingle();

    let waitlistRow: { id: string; status: string; store_name: string } | null = null;
    try {
      const { data: wlData } = await adminDb
        .from('vendor_waitlist')
        .select('id, status, store_name')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (wlData) waitlistRow = wlData;
    } catch {
      // Waitlist table may not exist before SQL migration runs
    }

    const resolvedStoreName =
      String(vendorRow?.store_name || meta.store_name || waitlistRow?.store_name || '').trim() ||
      null;
    const resolvedPhone =
      String(vendorRow?.phone_number || meta.phone_number || '').trim() || null;

    const step1Complete = Boolean(resolvedStoreName && resolvedPhone);
    const kycVerified = vendorRow?.kyc_status === 'verified';
    const firstIncompleteStep: 1 | 2 | 'complete' = !step1Complete
      ? 1
      : kycVerified
        ? 'complete'
        : 2;

    const gates = await getVendorGateSnapshotServer(vendorRow || null);

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: String(authUser.id),
        email: normalizedEmail,
        emailConfirmed: Boolean(authUser.email_confirmed_at),
        storeName: resolvedStoreName,
        phoneNumber: resolvedPhone,
      },
      vendor: vendorRow
        ? {
            id: vendorRow.id,
            storeName: vendorRow.store_name,
            email: vendorRow.email,
            phoneNumber: vendorRow.phone_number,
            phoneVerified: Boolean(vendorRow.phone_verified),
            kycStatus: vendorRow.kyc_status || 'pending',
            payoutAccountVerified: Boolean(vendorRow.payout_account_verified),
            settlementAccountNameMatched: Boolean(vendorRow.settlement_account_name_matched),
            settlementAccountMasked: maskAccountNumber(vendorRow.settlement_account_number),
            settlementBankCode: vendorRow.settlement_bank_code || null,
            isAllowlisted: Boolean(vendorRow.is_allowlisted),
            isSuspended: Boolean(vendorRow.is_suspended),
          }
        : null,
      waitlistRecorded: Boolean(waitlistRow || (vendorRow && step1Complete)),
      firstIncompleteStep,
      gates,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Unable to check vendor status.' },
      { status: 500 }
    );
  }
}
