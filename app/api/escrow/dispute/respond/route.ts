import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { sendSystemAlert } from '@/lib/alerts';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import { updateTransactionStrict } from '@/lib/orderLifecycle';
import { resolveOrderActor } from '@/lib/orderAuth';
import { evaluateLivePaymentGateServer } from '@/lib/launchGates';
import { sendDisputeOpenedOrUpdatedWhatsapp } from '@/lib/whatsapp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, responseText } = body || {};

    if (!transactionId || !responseText || typeof responseText !== 'string' || responseText.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'transactionId and responseText (at least 3 characters) are required.' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (txErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Dispute Respond Lookup Failed (Fail Closed)',
        transactionId,
        details: { error: txErr.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: `Transaction lookup failed: ${txErr.message}` }, { status: 500 });
    }

    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    // Derive actor role strictly from authenticated session (ignore client responderRole)
    const actor = await resolveOrderActor(request, tx, supabase);
    if (!actor.authenticated) {
      return NextResponse.json(
        { success: false, code: actor.code, error: actor.error || 'Authentication required.' },
        { status: actor.statusCode || 401 }
      );
    }

    if (actor.role !== 'BUYER' && actor.role !== 'VENDOR') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Only the verified buyer or owning vendor may respond.' },
        { status: 403 }
      );
    }

    const cleanRole: 'BUYER' | 'VENDOR' = actor.role;

    const liveGate = await evaluateLivePaymentGateServer({
      vendorId: tx.vendor_id,
      supabaseClient: supabase,
    });
    if (!liveGate.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: liveGate.code || 'PAYMENTS_NOT_LIVE',
          error: liveGate.error || 'Payments open soon.',
        },
        { status: 403 }
      );
    }

    const clientIp = getClientIp(request);
    const [ipRl, txRl] = await Promise.all([
      checkSharedRateLimit(`${clientIp}:dispute_respond`, 10, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`tx:${transactionId}:dispute_respond`, 10, 15 * 60 * 1000, supabase),
    ]);
    if (!ipRl.allowed || !txRl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many dispute response submissions.' }, { status: 429 });
    }

    if (tx.status !== 'DISPUTED') {
      return NextResponse.json(
        { success: false, error: `Counterparty responses are only accepted while status is DISPUTED (current: ${tx.status}).` },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const cleanText = `[${cleanRole} RESPONSE @ ${nowIso}]: ${responseText.trim()}`;

    const upd = await updateTransactionStrict(
      tx.id,
      {
        counterparty_response_text: cleanText,
        counterparty_responded_at: nowIso,
        updated_at: nowIso,
      },
      supabase
    );
    if (!upd.success) {
      return NextResponse.json(
        { success: false, error: upd.error || 'Failed to record dispute response.' },
        { status: 500 }
      );
    }

    const { error: auditErr } = await supabase
      .from('admin_audit_log')
      .insert({
        admin_email: `${cleanRole.toLowerCase()}:${tx.vendor_handle || 'party'}`,
        action: 'DISPUTE_COUNTERPARTY_RESPONSE',
        target_type: 'transaction',
        target_id: tx.id,
        ip_address: clientIp,
        metadata: { responderRole: cleanRole, respondedAt: nowIso },
      });

    if (auditErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Dispute Response Audit Insert Failed (Fail Closed)',
        transactionId: tx.id,
        details: { error: auditErr.message },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: `Failed writing dispute response audit log: ${auditErr.message}` },
        { status: 500 }
      );
    }

    if (cleanRole === 'VENDOR' && tx.buyer_phone) {
      await sendDisputeOpenedOrUpdatedWhatsapp(
        {
          transactionId: tx.id,
          recipientPhone: tx.buyer_phone,
          itemName: tx.item_name || 'Escrow Order',
          updateSummary: 'Vendor submitted dispute response & evidence',
          deadlineText: tx.dispute_response_deadline_at || nowIso,
          vendorId: tx.vendor_id,
          vendorHandle: tx.vendor_handle,
        },
        supabase
      ).catch(() => {});
    }

    await sendSystemAlert({
      type: 'NEW_DISPUTE',
      severity: 'WARNING',
      title: `Dispute Counterparty Response Submitted (${cleanRole})`,
      transactionId: tx.id,
      vendorHandle: tx.vendor_handle,
      details: { responderRole: cleanRole, respondedAt: nowIso },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      respondedBy: cleanRole,
      counterpartyResponseText: cleanText,
      counterpartyRespondedAt: nowIso,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to record dispute response.' },
      { status: 500 }
    );
  }
}
