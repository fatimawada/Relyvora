import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminIdentityForMfaSetup } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdminIdentityForMfaSetup(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error || 'Unauthorized',
          code: auth.code || 'UNAUTHORIZED',
          enrollmentUrl: auth.enrollmentUrl || '/admin/security',
        },
        { status: auth.statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      authorized: true,
      user: {
        id: auth.user.id,
        email: auth.user.email,
      },
      aal: auth.aal || auth.user.aal || 'aal1',
      mfaEnrolled: Boolean(auth.mfaEnrolled),
      aal2Verified: (auth.aal || auth.user.aal) === 'aal2',
      enrollmentUrl: '/admin/security',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
