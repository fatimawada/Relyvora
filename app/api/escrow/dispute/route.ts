import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { recordLedgerEntry } from '@/lib/ledger';
import { sendSystemAlert } from '@/lib/alerts';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, disputeReason } = body;

    if (!transactionId || !disputeReason || typeof disputeReason !== 'string' || !disputeReason.trim()) {
      return NextResponse.json(
        { success: false, error: 'transactionId and disputeReason are required.' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();

    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    if (existing.status === 'RELEASED') {
      return NextResponse.json(
        { success: false, error: 'Cannot dispute a transaction that has already been released.' },
        { status: 400 }
      );
    }

    if (existing.status === 'DISPUTED') {
      return NextResponse.json(
        { success: false, error: 'Transaction is already flagged in dispute.' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const cleanReason = disputeReason.trim();

    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: 'DISPUTED',
        dispute_reason: cleanReason,
        disputed_at: now,
        updated_at: now,
      })
      .eq('id', transactionId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // Phase G2: Record dispute freeze in immutable audit ledger
    await recordLedgerEntry({
      transactionId,
      entryType: 'DISPUTE_FREEZE',
      amount: Number(existing.total_amount) || 0,
      currency: 'NGN',
      fromAccount: 'Relyvora Escrow Vault',
      toAccount: 'Dispute Arbitration Vault',
      idempotencyKey: `ledger_${transactionId}_DISPUTE_FREEZE`,
      metadata: { reason: cleanReason, disputedAt: now },
    });

    // Phase G2: Send immediate high-priority alert to dispute team
    sendSystemAlert({
      type: 'NEW_DISPUTE',
      severity: 'WARNING',
      title: 'New Escrow Dispute Flagged',
      transactionId,
      vendorHandle: existing.vendor_handle,
      details: {
        itemName: existing.item_name,
        amount: existing.total_amount,
        disputeReason: cleanReason,
        buyerPhone: existing.buyer_phone,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, transaction: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
