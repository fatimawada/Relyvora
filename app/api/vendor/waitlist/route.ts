import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyVendorOnboardingSession } from '@/lib/vendorAuth';
import { saveVendorStep1AndWaitlistServer } from '@/lib/vendorWaitlist';

/**
 * POST /api/vendor/waitlist
 *
 * Records the signed-in vendor's Step 1 account details (store name, email, WhatsApp number)
 * in `public.vendors` and `public.vendor_waitlist` without triggering KYC, Anchor calls,
 * or any outbound WhatsApp / email messages.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const ip = getClientIp(request);

    const ipRl = await checkSharedRateLimit(`${ip}:vendor_waitlist`, 10, 15 * 60 * 1000, supabase);
    if (!ipRl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const session = await verifyVendorOnboardingSession(request);
    if (!session.authorized || !session.user) {
      return NextResponse.json(
        { success: false, code: session.code || 'UNAUTHORIZED', error: session.error },
        { status: session.statusCode || 401 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const { data: authUserData } = await supabase.auth.admin
      .getUserById(session.user.id)
      .catch(() => ({ data: null }));
    const meta = (authUserData?.user?.user_metadata || {}) as Record<string, any>;

    const storeName = String(body?.storeName ?? meta.store_name ?? '').trim();
    const phoneNumber = String(body?.phoneNumber ?? meta.phone_number ?? '').trim();

    const result = await saveVendorStep1AndWaitlistServer({
      userId: session.user.id,
      email: session.user.email,
      storeName,
      phoneNumber,
      source: 'open_signup',
      supabaseClient: supabase,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.statusCode || 400 }
      );
    }

    if (
      String(meta.store_name || '').trim() !== storeName ||
      String(meta.phone_number || '').trim() !== result.phoneNumber
    ) {
      await supabase.auth.admin
        .updateUserById(session.user.id, {
          user_metadata: {
            ...meta,
            store_name: storeName,
            phone_number: result.phoneNumber,
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      waitlistId: result.waitlistId,
      vendorId: result.vendorId,
      storeName: result.storeName,
      email: result.email,
      phoneNumber: result.phoneNumber,
      kycStatus: result.kycStatus,
      message: 'Your store details have been saved.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Unable to save vendor profile.' },
      { status: 500 }
    );
  }
}
