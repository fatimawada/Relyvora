import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { createEvidenceSignedUrl, getAuthorizedEvidenceSummary } from '@/lib/evidenceStorage';
import { getServiceSupabase } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId') || '';
    const fileId = searchParams.get('fileId') || '';
    const requestedRole = String(searchParams.get('viewerRole') || 'BUYER').toUpperCase();

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    if (requestedRole !== 'BUYER' && requestedRole !== 'VENDOR' && requestedRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Invalid viewerRole.' }, { status: 400 });
    }

    let effectiveRole: 'BUYER' | 'VENDOR' | 'ADMIN' = requestedRole;
    if (requestedRole === 'ADMIN') {
      const auth = await verifyAdminSession(request);
      if (!auth.authorized) {
        return NextResponse.json(
          { success: false, error: auth.error, code: auth.code },
          { status: auth.statusCode }
        );
      }
      effectiveRole = 'ADMIN';
    }

    const supabase = getServiceSupabase();

    if (!fileId) {
      const summary = await getAuthorizedEvidenceSummary({
        transactionId,
        viewerRole: effectiveRole,
        supabaseClient: supabase,
      });
      return NextResponse.json({ success: true, summary });
    }

    const signed = await createEvidenceSignedUrl({
      fileId,
      transactionId,
      viewerRole: effectiveRole,
      supabaseClient: supabase,
    });

    if (!signed.success) {
      return NextResponse.json(
        { success: false, error: signed.error },
        { status: signed.statusCode || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      signedUrl: signed.signedUrl,
      expiresInSeconds: signed.expiresInSeconds,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to generate signed URL.' },
      { status: 500 }
    );
  }
}
