import { NextRequest, NextResponse } from 'next/server';
import { verifyVendorOnboardingSession } from '@/lib/vendorAuth';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';
import {
  confirmSettlementAccountChange,
  requestSettlementAccountChange,
} from '@/lib/payoutSafety';

/**
 * POST /api/vendor/settlement-account
 * Initiates a settlement bank account change:
 * - Requires authenticated, email-confirmed vendor session
 * - Performs Anchor bank name enquiry and blocks on KYC legal-name mismatch
 * - Dispatches WhatsApp confirmation to vendor's registered phone (unless disabled in system_settings)
 * - Writes audit log entry
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`${ip}:settlement_change`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many settlement change attempts. Try again later.' },
        { status: 429 }
      );
    }

    const session = await verifyVendorOnboardingSession(request);
    if (!session.authorized || !session.user) {
      return NextResponse.json(
        { success: false, code: session.code || 'UNAUTHORIZED', error: session.error },
        { status: session.statusCode }
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
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id, user_id, email')
      .eq('email', session.user.email.toLowerCase().trim())
      .maybeSingle();

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
