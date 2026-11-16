import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getClientIp } from '@/lib/rateLimit';
import { hashSignalWithSalt } from '@/lib/riskEngine';
import { updateTransactionWithFallback } from '@/lib/orderLifecycle';

export const CURRENT_TERMS_VERSION = '2026-11-v1';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const acceptedTerms = body?.acceptedTerms !== false;
    const termsVersion = String(body?.termsVersion || CURRENT_TERMS_VERSION).slice(0, 64);

    if (!id || !acceptedTerms) {
      return NextResponse.json(
        { success: false, error: 'Explicit agreement to Terms and Privacy Policy is required.' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const clientIp = getClientIp(request);
    const consentIpHash = hashSignalWithSalt(clientIp || 'unknown');
    const nowIso = new Date().toISOString();

    const { data: tx } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    await updateTransactionWithFallback(
      id,
      {
        buyer_terms_accepted_at: nowIso,
        buyer_terms_version: termsVersion,
        buyer_consent_ip_hash: consentIpHash,
        updated_at: nowIso,
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      transactionId: id,
      termsVersion,
      acceptedAt: nowIso,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to record consent.' },
      { status: 500 }
    );
  }
}
