import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getClientIp } from '@/lib/rateLimit';
import { adminSetVendorTierOrCapOverride } from '@/lib/vendorTiers';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdminSession(request);
    if (!auth.authorized || !auth.user?.email) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error || 'Unauthorized admin access',
          code: auth.code,
          aal: auth.aal,
          mfaEnrolled: auth.mfaEnrolled,
          enrollmentUrl: auth.enrollmentUrl || '/admin/security',
        },
        { status: auth.statusCode }
      );
    }

    const body = await request.json();
    const { vendorId, tier, capOverrideUnlimited, reason } = body || {};

    if (!vendorId || typeof vendorId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'vendorId is required.' },
        { status: 400 }
      );
    }

    if (tier === undefined && typeof capOverrideUnlimited !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Provide either tier or capOverrideUnlimited.' },
        { status: 400 }
      );
    }

    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 3) {
      return NextResponse.json(
        { success: false, error: 'A clear non-empty reason (at least 3 characters) is required for tier or cap overrides.' },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request);
    const result = await adminSetVendorTierOrCapOverride({
      vendorId,
      adminEmail: auth.user.email,
      reason: cleanReason,
      tier,
      capOverrideUnlimited,
      ipAddress: clientIp,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to update vendor tier or cap override.' },
        { status: result.statusCode || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      vendor: result.vendor,
      message: 'Vendor tier / cap settings updated and logged.',
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/vendors/tier:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
