import { NextRequest, NextResponse } from 'next/server';
import { createEvidenceSignedUrl, getAuthorizedEvidenceSummary } from '@/lib/evidenceStorage';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { resolveOrderActor } from '@/lib/orderAuth';
import { sendSystemAlert } from '@/lib/alerts';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId') || '';
    const fileId = searchParams.get('fileId') || '';

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('id, vendor_id, vendor_handle, buyer_phone, buyer_phone_verified, whatsapp_blocked')
      .eq('id', transactionId)
      .maybeSingle();

    if (txErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Evidence Signed URL Transaction Query Failed (Fail Closed)',
        transactionId,
        details: { error: txErr.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: `Transaction lookup failed: ${txErr.message}` }, { status: 500 });
    }

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    // Ignore ?viewerRole= query param completely; derive role strictly from authenticated session
    const actor = await resolveOrderActor(request, tx, supabase);
    if (!actor.authenticated || !actor.role) {
      return NextResponse.json(
        { success: false, code: actor.code, error: actor.error || 'Authentication required to access order evidence.' },
        { status: actor.statusCode || 401 }
      );
    }

    const effectiveRole = actor.role;

    if (!fileId) {
      const summary = await getAuthorizedEvidenceSummary({
        transactionId,
        viewerRole: effectiveRole,
        supabaseClient: supabase,
      });
      return NextResponse.json({ success: true, authenticated_role: effectiveRole, summary });
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
      authenticated_role: effectiveRole,
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
