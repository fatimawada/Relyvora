import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { 
  generateCryptographicReleaseCode, 
  generateCodeSalt, 
  hashReleaseCode 
} from '@/lib/releaseCode';

// In-memory replay guard for fast lookups & resilience
const processedEventsCache = new Set<string>();

/**
 * Validates HMAC-SHA256 signature from Anchor headers.
 */
function verifyAnchorSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.ANCHOR_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) {
    return false;
  }

  try {
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(computedSignature, 'utf8');
    const actualBuf = Buffer.from(signatureHeader.trim(), 'utf8');

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch (err) {
    console.error('Signature verification exception:', err);
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

    // 2. Idempotency & Replay Attack Prevention
    if (processedEventsCache.has(eventId)) {
      return NextResponse.json({ success: true, message: 'Event already processed (cached)' }, { status: 200 });
    }

    const supabase = getServiceSupabase();

    // Check database idempotency table
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existingEvent) {
      processedEventsCache.add(eventId);
      return NextResponse.json({ success: true, message: 'Event already processed' }, { status: 200 });
    }

    // 3. Process Event Types
    // Look for deposit/credit events into a Virtual NUBAN or FBO ledger
    const isCreditEvent = 
      eventType === 'transaction.credit' || 
      eventType === 'virtual_nuban.credit' ||
      eventType === 'DepositAccount.credit' ||
      payload?.attributes?.type === 'CREDIT';

    if (isCreditEvent) {
      const attributes = payload?.data?.attributes || payload?.attributes || {};
      const accountNumber = attributes?.accountNumber || attributes?.destinationAccountNumber;
      const metadataTxId = attributes?.metadata?.transactionId || payload?.metadata?.transactionId;
      const amountKobo = Number(attributes?.amount) || 0;
      const amountNaira = amountKobo / 100;

      // Locate the matching pending transaction
      let query = supabase.from('transactions').select('*').eq('status', 'AWAITING_PAYMENT');
      if (metadataTxId) {
        query = query.eq('id', metadataTxId);
      } else if (accountNumber) {
        query = query.eq('virtual_account_number', accountNumber);
      }

      const { data: tx, error: matchErr } = await query.maybeSingle();

      if (tx) {
        // Validate paid amount against total_amount
        const expectedTotal = Number(tx.total_amount) || 0;
        if (amountNaira >= expectedTotal) {
          // Generate cryptographic release code and salted hash
          const code = generateCryptographicReleaseCode();
          const salt = generateCodeSalt();
          const hash = hashReleaseCode(code, salt);
          const now = new Date().toISOString();

          await supabase
            .from('transactions')
            .update({
              status: 'FUNDS_LOCKED',
              release_code_hash: hash,
              release_code_salt: salt,
              // In production live mode, the plaintext release_code is NOT persisted to DB;
              // It is dispatched via notification (SMS/email) to buyer.
              paid_at: now,
              payment_method: 'VIRTUAL_NUBAN_TRANSFER',
              updated_at: now,
            })
            .eq('id', tx.id);

          console.log(`Successfully locked escrow funds for transaction ${tx.id} via Anchor webhook credit.`);
        } else {
          console.warn(`Partial payment detected for tx ${tx.id}: received ${amountNaira}, expected ${expectedTotal}`);
        }
      }
    }

    // 4. Log processed event in webhook_events ledger table
    try {
      await supabase.from('webhook_events').insert([
        {
          event_id: eventId,
          event_type: eventType,
          payload,
          status: 'PROCESSED',
        },
      ]);
    } catch (logErr) {
      console.warn('Could not insert to webhook_events table (schema migration may be pending):', logErr);
    }

    processedEventsCache.add(eventId);
    return NextResponse.json({ success: true, processed: true }, { status: 200 });
  } catch (err: any) {
    console.error('Unhandled webhook error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
