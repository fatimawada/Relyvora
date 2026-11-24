import { NextRequest, NextResponse } from 'next/server';
import { verifyVendorOnboardingSession } from '@/lib/vendorAuth';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getClientIp, checkSharedRateLimit } from '@/lib/rateLimit';
import { sendSystemAlert } from '@/lib/alerts';
import { isAnchorLiveCredentialsConfigured } from '@/lib/anchor';
import { evaluateLiveKycGateServer } from '@/lib/launchGates';
import { isLiveMode } from '@/lib/paymentsMode';
import {
  confirmSettlementAccountChange,
  requestSettlementAccountChange,
} from '@/lib/payoutSafety';

/**
 * POST /api/vendor/settlement-account
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const session = await verifyVendorOnboardingSession(request);
    if (!session.authorized || !session.user) {
      return NextResponse.json(
        { success: false, code: session.code || 'UNAUTHORIZED', error: session.error },
        { status: session.statusCode }
      );
    }

    const kycGate = await evaluateLiveKycGateServer();
    if (!kycGate.allowed) {
      return NextResponse.json(
        { success: false, code: kycGate.code || 'LAUNCH_NOT_LIVE', error: kycGate.error || 'Live KYC is gated.' },
        { status: 403 }
      );
    }
    if (isLiveMode() && !isAnchorLiveCredentialsConfigured().ok) {
      return NextResponse.json(
        { success: false, code: 'ANCHOR_CREDENTIALS_MISSING', error: 'Anchor production credentials are missing.' },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const bankCode = String(body.bankCode || '').trim();
    const accountNumber = String(body.accountNumber || '').trim();
    const accountNameHint = body.accountName ? String(body.accountName).trim() : null;

    if (!bankCode || !/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Valid bankCode and 10-digit NUBAN accountNumber are required.',
        },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const { data: vendor, error: vendorErr } = await supabase
      .from('vendors')
      .select('id, user_id, email, is_suspended')
      .eq('email', session.user.email.toLowerCase().trim())
      .maybeSingle();

    if (vendorErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Settlement Account Vendor Query Failed (Fail Closed)',
        details: { userId: session.user.id, error: vendorErr.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: `Vendor lookup failed: ${vendorErr.message}` }, { status: 500 });
    }

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor onboarding record not found for current user.' },
        { status: 404 }
      );
    }

    if (vendor.user_id && vendor.user_id !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Vendor ownership mismatch.' },
        { status: 403 }
      );
    }

    if (vendor.is_suspended) {
      return NextResponse.json(
        { success: false, error: 'Suspended vendor accounts cannot change settlement bank details.' },
        { status: 403 }
      );
    }

    const [ipRl, vRl] = await Promise.all([
      checkSharedRateLimit(`${ip}:settlement_change`, 5, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`v:${vendor.id}:settlement_change`, 5, 15 * 60 * 1000, supabase),
    ]);
    if (!ipRl.allowed || !vRl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many settlement change attempts. Try again later.' },
        { status: 429 }
      );
    }

    const result = await requestSettlementAccountChange({
      vendorId: vendor.id,
      newBankCode: bankCode,
      newAccountNumber: accountNumber,
      newAccountNameHint: accountNameHint,
      actorEmail: session.user.email,
      ipAddress: ip,
      supabaseClient: supabase,
    });

    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed initiating settlement change.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/vendor/settlement-account
 * Confirms a staged settlement bank account change (e.g. from verified WhatsApp confirmation step)
 * and starts the configurable mandatory payout hold window (default 48h).
 */
export async function PUT(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const session = await verifyVendorOnboardingSession(request);
    if (!session.authorized || !session.user) {
      return NextResponse.json(
        { success: false, code: session.code || 'UNAUTHORIZED', error: session.error },
        { status: session.statusCode }
      );
    }

    const kycGate = await evaluateLiveKycGateServer();
    if (!kycGate.allowed) {
      return NextResponse.json(
        { success: false, code: kycGate.code || 'LAUNCH_NOT_LIVE', error: kycGate.error || 'Live KYC is gated.' },
        { status: 403 }
      );
    }
    if (isLiveMode() && !isAnchorLiveCredentialsConfigured().ok) {
      return NextResponse.json(
        { success: false, code: 'ANCHOR_CREDENTIALS_MISSING', error: 'Anchor production credentials are missing.' },
        { status: 503 }
      );
    }

    const supabase = getServiceSupabase();
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id, user_id, email')
      .eq('email', session.user.email.toLowerCase().trim())
      .maybeSingle();

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor account not found.' },
        { status: 404 }
      );
    }

    if (vendor.user_id && vendor.user_id !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Vendor ownership mismatch.' },
        { status: 403 }
      );
    }

    const result = await confirmSettlementAccountChange({
      vendorId: vendor.id,
      actorEmail: session.user.email,
      ipAddress: ip,
      supabaseClient: supabase,
    });

    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed confirming settlement change.' },
      { status: 500 }
    );
  }
}
