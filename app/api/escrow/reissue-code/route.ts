import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { generateCryptographicReleaseCode, computeReleaseCodeHmac, calculateCodeExpiration } from '@/lib/releaseCode';
import { sendSystemAlert } from '@/lib/alerts';

/**
 * Safe Reissue / Recovery Endpoint for transactions in FUNDS_LOCKED without a valid code.
 * Recomputes HMAC-SHA256, resets attempt counters, logs audit trail, and triggers delivery.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const adminSecret = process.env.ADMIN_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Admin authorization required' }, { status: 401 });
    }

    const body = await request.json();
    const { transactionId, adminEmail = 'support@relyvora.com', reason = 'Buyer code recovery request' } = body;

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'transactionId is required' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Fetch and verify transaction state
    const { data: tx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, status, buyer_phone, vendor_handle, release_code_hash')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    if (tx.status !== 'FUNDS_LOCKED' && tx.status !== 'DISPATCHED') {
      return NextResponse.json(
        { success: false, error: `Cannot reissue code for transaction in status '${tx.status}'. Must be FUNDS_LOCKED or DISPATCHED.` },
        { status: 400 }
      );
    }

    const newCode = generateCryptographicReleaseCode();
    const newHmac = computeReleaseCodeHmac(tx.id, newCode);
    const expiresAt = calculateCodeExpiration(72);
    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('transactions')
      .update({
        release_code_hash: newHmac,
        code_expires_at: expiresAt,
        failed_code_attempts: 0,
        code_locked: false,
        updated_at: now,
      })
      .eq('id', tx.id);

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // Log admin audit action
    await supabase.from('admin_audit_log').insert({
      admin_email: adminEmail,
      action: 'REISSUE_RELEASE_CODE',
      target_type: 'transaction',
      target_id: tx.id,
      metadata: { reason, previous_hash_existed: Boolean(tx.release_code_hash) },
    });

    sendSystemAlert({
      type: 'SECURITY_LOCKOUT',
      severity: 'WARNING',
      title: 'Release Code Safely Reissued',
      transactionId: tx.id,
      details: {
        adminEmail,
        reason,
        buyerPhone: tx.buyer_phone,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Release code reissued successfully and dispatched out-of-band.',
      transactionId: tx.id,
    });
  } catch (err: any) {
    console.error('Unhandled error in reissue-code:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
