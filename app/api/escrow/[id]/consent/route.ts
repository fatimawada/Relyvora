import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import { hashSignalWithSalt } from '@/lib/riskEngine';
import { updateTransactionStrict } from '@/lib/orderLifecycle';
import { evaluateLivePaymentGateServer } from '@/lib/launchGates';
import { isLiveMode } from '@/lib/paymentsMode';

const CURRENT_TERMS_VERSION = '2026-11-v1';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const acceptedTerms = body?.acceptedTerms !== false;
    const sandboxConfirmOrder = body?.sandboxConfirmOrder === true;
    const termsVersion = String(body?.termsVersion || CURRENT_TERMS_VERSION).slice(0, 64);

    if (!id || !acceptedTerms) {
      return NextResponse.json(
        { success: false, error: 'Explicit agreement to Terms and Privacy Policy is required.' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const clientIp = getClientIp(request);

    const rl = await checkSharedRateLimit(`consent:${id}:${clientIp}`, 15, 15 * 60 * 1000, supabase);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many consent attempts.' }, { status: 429 });
    }

    const consentIpHash = hashSignalWithSalt(clientIp || 'unknown');
    const nowIso = new Date().toISOString();

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('id, vendor_id, whatsapp_blocked, buyer_phone_verified')
      .eq('id', id)
      .maybeSingle();

    if (txErr) {
      return NextResponse.json({ success: false, error: `Transaction lookup failed: ${txErr.message}` }, { status: 500 });
    }

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    const liveGate = await evaluateLivePaymentGateServer({
      vendorId: tx.vendor_id,
      supabaseClient: supabase,
    });
    if (!liveGate.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: liveGate.code || 'LAUNCH_NOT_LIVE',
          error: liveGate.error || 'Checkout gated.',
        },
        { status: 403 }
      );
    }

    const patch: Record<string, unknown> = {
      buyer_terms_accepted_at: nowIso,
      buyer_terms_version: termsVersion,
      buyer_consent_ip_hash: consentIpHash,
      updated_at: nowIso,
    };

    // In sandbox only, allow browser confirmation when WhatsApp could not be sent (non-allowlisted / omitted phone)
    if (sandboxConfirmOrder) {
      if (isLiveMode() || process.env.VERCEL_ENV === 'production') {
        return NextResponse.json(
          { success: false, error: 'Browser order confirmation override is disabled in live/production.' },
          { status: 403 }
        );
      }
      if (tx.whatsapp_blocked) {
        return NextResponse.json(
          { success: false, error: 'Order is blocked because recipient opted out on WhatsApp.' },
          { status: 403 }
        );
      }
      patch.buyer_phone_verified = true;
      patch.buyer_phone_verified_at = nowIso;
    }

    const upd = await updateTransactionStrict(id, patch, supabase);
    if (!upd.success) {
      return NextResponse.json(
        { success: false, error: upd.error || 'Failed to record terms acceptance.' },
        { status: 500 }
      );
    }

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
