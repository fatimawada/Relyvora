import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { 
  generateCryptographicReleaseCode, 
  computeReleaseCodeHmac, 
  calculateCodeExpiration 
} from '@/lib/releaseCode';
import { sendSystemAlert } from '@/lib/alerts';

/**
 * Strict HMAC-SHA256 webhook signature verification.
 */
function verifyAnchorSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.ANCHOR_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.PAYMENTS_MODE === 'live') {
      console.error('CRITICAL SECURITY ERROR: ANCHOR_WEBHOOK_SECRET is not configured in production.');
      return false;
    }
    return true; // Allow local sandbox testing only if secret not configured
  }

  if (!signatureHeader) return false;

  try {
    const computedSignature = crypto
      .createHmac('sha256', secret.trim())
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signatureHeader.trim(), 'hex');
    const compBuf = Buffer.from(computedSignature, 'hex');

    if (sigBuf.length !== compBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, compBuf);
  } catch (err) {
    console.error('Signature verification threw exception:', err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-anchor-signature');

    // 1. Strict HMAC-SHA256 signature verification
    const isValidSignature = verifyAnchorSignature(rawBody, signature);
    if (!isValidSignature) {
      console.warn('Rejected Anchor webhook with invalid signature.');
      sendSystemAlert({
        type: 'WEBHOOK_FAILURE',
        severity: 'CRITICAL',
        title: 'Unauthorized Anchor Webhook Signature Rejection',
        details: {
          clientIp: request.headers.get('x-forwarded-for') || 'unknown',
          hasSignature: Boolean(signature),
        },
      }).catch(() => {});

      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid webhook signature' },
        { status: 401 }
      );
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    const eventId = payload?.id || payload?.data?.id || `evt_${Date.now()}`;
    const eventType = payload?.event || payload?.type || payload?.data?.type || 'unknown';

    const isCreditEvent = 
      eventType === 'transaction.credit' || 
      eventType === 'virtual_nuban.credit' ||
      eventType === 'DepositAccount.credit' ||
      payload?.attributes?.type === 'CREDIT';

    if (!isCreditEvent) {
      // Non-credit events are ignored
      return NextResponse.json({ success: true, message: 'Event ignored (not a credit)' }, { status: 200 });
    }

    const attributes = payload?.data?.attributes || payload?.attributes || {};
    const accountNumber = attributes?.accountNumber || attributes?.destinationAccountNumber;
    const metadataTxId = attributes?.metadata?.transactionId || payload?.metadata?.transactionId || null;
    const amountKobo = Number(attributes?.amount) || 0;
    const amountNaira = amountKobo / 100;

    const supabase = getServiceSupabase();

    // 2. Execute DB-first idempotency & atomic deposit processing via Postgres RPC
    // rpc_process_webhook_deposit inserts into webhook_events first with unique event_id,
    // locks transaction row with SELECT ... FOR UPDATE, and records ledger entry
    const { data: rpcResult, error: rpcError } = await supabase.rpc('rpc_process_webhook_deposit', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_account_number: accountNumber || '',
      p_amount_naira: amountNaira,
      p_metadata_tx_id: metadataTxId,
      p_payload: payload,
    });

    if (rpcError) {
      console.error('RPC process_webhook_deposit failed:', rpcError);
      return NextResponse.json({ success: false, error: rpcError.message }, { status: 500 });
    }

    // Check duplicate/replayed event
    if (rpcResult?.replayed) {
      return NextResponse.json({ success: true, message: 'Webhook event already processed (idempotent)' }, { status: 200 });
    }

    // Check underpayment
    if (rpcResult?.error === 'UNDERPAYMENT') {
      sendSystemAlert({
        type: 'STUCK_FUNDS',
        severity: 'CRITICAL',
        title: 'Partial Escrow Underpayment Detected',
        transactionId: metadataTxId,
        details: {
          receivedNaira: amountNaira,
          expectedNaira: rpcResult.amount_expected,
          eventId,
        },
      }).catch(() => {});

      return NextResponse.json(
        { success: false, error: 'Underpayment received; funds not locked in escrow' },
        { status: 422 }
      );
    }

    if (!rpcResult?.success) {
      return NextResponse.json({ success: false, error: rpcResult?.error || 'Deposit handling failed' }, { status: 400 });
    }

    // 3. Generate cryptographic release code & HMAC-SHA256 for the funded order
    const txId = rpcResult.transaction_id;
    if (txId) {
      const rawCode = generateCryptographicReleaseCode();
      const hmacHash = computeReleaseCodeHmac(txId, rawCode);

      await supabase
        .from('transactions')
        .update({
          release_code_hash: hmacHash,
          // Plaintext code is NEVER persisted to DB in live mode
        })
        .eq('id', txId);

      // In production live mode, dispatch the code directly to buyer's phone/email via SMS
      console.log(`Successfully locked escrow funds for transaction ${txId} via verified Anchor webhook.`);
    }

    return NextResponse.json({ success: true, transactionId: txId }, { status: 200 });
  } catch (err: any) {
    console.error('Unhandled error in Anchor webhook route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
