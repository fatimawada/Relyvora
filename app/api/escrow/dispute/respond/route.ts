import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { sendSystemAlert } from '@/lib/alerts';
import { checkSharedRateLimit, getClientIp } from '@/lib/rateLimit';
import { mergeTransactionWithLifecycleOverlay, updateTransactionWithFallback } from '@/lib/orderLifecycle';
import { sendDisputeOpenedOrUpdatedWhatsapp } from '@/lib/whatsapp';

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rl = await checkSharedRateLimit(`${clientIp}:dispute_respond`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many dispute response submissions.' }, { status: 429 });
    }

    const body = await request.json();
    const { transactionId, responderRole, responseText } = body || {};

    if (!transactionId || !responseText || typeof responseText !== 'string' || responseText.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'transactionId and responseText (at least 3 characters) are required.' },
        { status: 400 }
      );
    }

    const cleanRole = String(responderRole || 'VENDOR').toUpperCase();
    if (cleanRole !== 'BUYER' && cleanRole !== 'VENDOR') {
      return NextResponse.json({ success: false, error: 'responderRole must be BUYER or VENDOR.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data: rawTx, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txErr || !rawTx) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }
    const tx = mergeTransactionWithLifecycleOverlay(rawTx);

    if (tx.status !== 'DISPUTED') {
      return NextResponse.json(
        { success: false, error: `Counterparty responses are only accepted while status is DISPUTED (current: ${tx.status}).` },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const cleanText = `[${cleanRole} RESPONSE @ ${nowIso}]: ${responseText.trim()}`;

    await updateTransactionWithFallback(
      tx.id,
      {
        counterparty_response_text: cleanText,
        counterparty_responded_at: nowIso,
        updated_at: nowIso,
      },
      supabase
    );

    await supabase
      .from('admin_audit_log')
      .insert({
        admin_email: `${cleanRole.toLowerCase()}:${tx.vendor_handle || 'party'}`,
        action: 'DISPUTE_COUNTERPARTY_RESPONSE',
        target_type: 'transaction',
        target_id: tx.id,
        ip_address: clientIp,
        metadata: { responderRole: cleanRole, respondedAt: nowIso },
      })
      .then(() => {}, () => {});

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
      transactionId: tx.id,
      counterparty_response_text: cleanText,
      counterparty_responded_at: nowIso,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to record dispute response.' },
      { status: 500 }
    );
  }
}
