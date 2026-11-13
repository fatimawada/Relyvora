import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import {
  addPhoneToDoNotContact,
  applyWhatsappVerificationRedaction,
  checkAndAlertWhatsappAnomalies,
  claimWhatsappWebhookEvent,
  getInMemoryOutboundLogsForTests,
  isPhoneOnDoNotContact,
  isSchemaMissingError,
  maskWhatsappNumber,
  normalizeWhatsappPhone,
  selectTransactionWithWhatsapp,
  updateTransactionWhatsappState,
  verifyMetaWebhookSignature,
  WhatsappDeliveryStatus,
} from '@/lib/whatsapp';

/**
 * Meta WhatsApp Cloud API Webhook Verification (GET)
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  const expectedToken = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();
  if (!mode || !token || !challenge || !expectedToken) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedToken);
  if (
    mode === 'subscribe' &&
    tokenBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(tokenBuf, expectedBuf)
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
}

function isStopOptOutMessage(text: string): boolean {
  return /^(stop|stopall|unsubscribe|cancel|end|quit|block|opt[\s-]?out)$/i.test(text.trim());
}

async function resolveTransactionIdFromContextOrPhone(
  supabase: ReturnType<typeof getServiceSupabase>,
  explicitTxId: string | null,
  contextWamid: string | null,
  senderE164: string | null
): Promise<string | null> {
  if (explicitTxId) return explicitTxId;

  if (contextWamid) {
    const memMatch = getInMemoryOutboundLogsForTests().find(
      (entry) => entry.message_id === contextWamid && entry.transaction_id
    );
    if (memMatch?.transaction_id) return memMatch.transaction_id;

    try {
      const { data: logRow } = await supabase
        .from('whatsapp_message_log')
        .select('transaction_id')
        .eq('message_id', contextWamid)
        .maybeSingle();
      if (logRow?.transaction_id) return logRow.transaction_id;
    } catch {
      // ignore if schema unmigrated
    }

    try {
      const { data: txRow } = await supabase
        .from('transactions')
        .select('id')
        .eq('whatsapp_message_id', contextWamid)
        .maybeSingle();
      if (txRow?.id) return txRow.id;
    } catch {
      // ignore if column missing
    }
  }

  if (senderE164) {
    const localZero = senderE164.startsWith('+234') ? `0${senderE164.slice(4)}` : senderE164;
    const { data: recentTxs } = await supabase
      .from('transactions')
      .select('id, buyer_phone')
      .eq('status', 'AWAITING_PAYMENT')
      .or(`buyer_phone.eq.${senderE164},buyer_phone.eq.${localZero}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentTxs && recentTxs.length > 0) {
      return recentTxs[0].id;
    }
  }

  return null;
}

/**
 * Meta WhatsApp Cloud API Webhook Receiver (POST)
 * Handles Quick Replies ("Confirm this is me", "Not me"), global STOP opt-outs, and delivery statuses.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!verifyMetaWebhookSignature(rawBody, signature)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing X-Hub-Signature-256' },
        { status: 401 }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    const results: Array<Record<string, unknown>> = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];

        for (const msg of messages) {
          const wamid = String(msg?.id || '');
          const eventKey = wamid
            ? `msg:${wamid}`
            : `msg_hash:${crypto.createHash('sha256').update(JSON.stringify(msg)).digest('hex')}`;

          const isNew = await claimWhatsappWebhookEvent(eventKey, 'inbound_message', supabase);
          if (!isNew) {
            results.push({ type: 'message', id: wamid || eventKey, duplicate: true });
            continue;
          }

          const senderE164 = normalizeWhatsappPhone(msg?.from);
          const buttonPayload = String(
            msg?.button?.payload || msg?.interactive?.button_reply?.id || ''
          ).trim();
          const textBody = String(
            msg?.button?.text || msg?.interactive?.button_reply?.title || msg?.text?.body || ''
          ).trim();
          const contextWamid = msg?.context?.id ? String(msg.context.id) : null;
          const maskedSender = maskWhatsappNumber(senderE164 || msg?.from);

          if (!senderE164) {
            results.push({ type: 'message', ignored: true, reason: 'invalid_sender' });
            continue;
          }

          // 1. Honour STOP-style opt-out replies globally
          if (isStopOptOutMessage(textBody) || isStopOptOutMessage(buttonPayload)) {
            await addPhoneToDoNotContact(
              { phone: senderE164, reason: 'STOP_REPLY' },
              supabase
            );

            // Block any active AWAITING_PAYMENT transactions referencing this phone
            const localZero = senderE164.startsWith('+234')
              ? `0${senderE164.slice(4)}`
              : senderE164;
            const { data: openTxs } = await supabase
              .from('transactions')
              .select('id, buyer_phone')
              .eq('status', 'AWAITING_PAYMENT')
              .or(`buyer_phone.eq.${senderE164},buyer_phone.eq.${localZero}`);

            for (const openTx of openTxs || []) {
              if (normalizeWhatsappPhone(openTx.buyer_phone) === senderE164) {
                await updateTransactionWhatsappState(
                  openTx.id,
                  { whatsapp_blocked: true, buyer_phone_verified: false },
                  supabase
                );
              }
            }

            await supabase
              .from('admin_audit_log')
              .insert({
                admin_email: 'system:whatsapp_webhook',
                action: 'WHATSAPP_GLOBAL_STOP_OPT_OUT',
                target_type: 'whatsapp_dnc',
                target_id: maskedSender,
                metadata: { masked_phone: maskedSender },
              })
              .then(() => {}, () => {});

            await checkAndAlertWhatsappAnomalies(
              { eventType: 'stop', maskedPhone: maskedSender },
              supabase
            );

            results.push({ type: 'message', action: 'STOP_OPT_OUT', maskedPhone: maskedSender });
            continue;
          }

          // 2. "Not me" Quick Reply / text
          if (
            buttonPayload.startsWith('NOT_ME_ORDER:') ||
            textBody.toLowerCase() === 'not me'
          ) {
            const explicitTxId = buttonPayload.startsWith('NOT_ME_ORDER:')
              ? buttonPayload.slice('NOT_ME_ORDER:'.length).trim()
              : null;
            const txId = await resolveTransactionIdFromContextOrPhone(
              supabase,
              explicitTxId,
              contextWamid,
              senderE164
            );

            await addPhoneToDoNotContact(
              { phone: senderE164, reason: 'NOT_ME', transactionId: txId },
              supabase
            );

            if (txId) {
              await updateTransactionWhatsappState(
                txId,
                { whatsapp_blocked: true, buyer_phone_verified: false },
                supabase
              );
            }

            await supabase
              .from('admin_audit_log')
              .insert({
                admin_email: 'system:whatsapp_webhook',
                action: 'WHATSAPP_NOT_ME_BLOCKED',
                target_type: 'transaction',
                target_id: txId || maskedSender,
                metadata: { masked_phone: maskedSender },
              })
              .then(() => {}, () => {});

            await checkAndAlertWhatsappAnomalies(
              { eventType: 'not_me', transactionId: txId, maskedPhone: maskedSender },
              supabase
            );

            results.push({ type: 'message', action: 'NOT_ME_BLOCKED', transactionId: txId });
            continue;
          }

          // 3. "Confirm this is me" Quick Reply / text
          if (
            buttonPayload.startsWith('CONFIRM_ORDER:') ||
            textBody.toLowerCase() === 'confirm this is me'
          ) {
            const explicitTxId = buttonPayload.startsWith('CONFIRM_ORDER:')
              ? buttonPayload.slice('CONFIRM_ORDER:'.length).trim()
              : null;
            const txId = await resolveTransactionIdFromContextOrPhone(
              supabase,
              explicitTxId,
              contextWamid,
              senderE164
            );

            if (!txId) {
              results.push({ type: 'message', action: 'CONFIRM_IGNORED', reason: 'order_not_found' });
              continue;
            }

            const { data: tx } = await selectTransactionWithWhatsapp<any>(
              supabase,
              txId,
              'id, buyer_phone, status'
            );

            if (!tx) {
              results.push({ type: 'message', action: 'CONFIRM_IGNORED', reason: 'order_not_found' });
              continue;
            }

            const txState = applyWhatsappVerificationRedaction(tx);
            const expectedPhone = normalizeWhatsappPhone(tx.buyer_phone);
            const dnc = await isPhoneOnDoNotContact(senderE164, supabase);

            if (dnc.blocked || txState.whatsapp_blocked) {
              results.push({
                type: 'message',
                action: 'CONFIRM_REJECTED_BLOCKED',
                transactionId: txId,
              });
              continue;
            }

            if (expectedPhone !== senderE164) {
              results.push({
                type: 'message',
                action: 'CONFIRM_REJECTED_PHONE_MISMATCH',
                transactionId: txId,
              });
              continue;
            }

            await updateTransactionWhatsappState(
              txId,
              {
                buyer_phone_verified: true,
                buyer_phone_verified_at: new Date().toISOString(),
              },
              supabase
            );

            await supabase
              .from('admin_audit_log')
              .insert({
                admin_email: 'system:whatsapp_webhook',
                action: 'WHATSAPP_PHONE_VERIFIED',
                target_type: 'transaction',
                target_id: txId,
                metadata: { masked_phone: maskedSender },
              })
              .then(() => {}, () => {});

            results.push({ type: 'message', action: 'PHONE_VERIFIED', transactionId: txId });
            continue;
          }

          results.push({ type: 'message', action: 'UNHANDLED', maskedPhone: maskedSender });
        }

        for (const st of statuses) {
          const wamid = String(st?.id || '');
          const rawStatus = String(st?.status || '').toLowerCase();
          const timestamp = String(st?.timestamp || '');
          if (!wamid || !rawStatus) continue;

          const eventKey = `status:${wamid}:${rawStatus}:${timestamp}`;
          const isNew = await claimWhatsappWebhookEvent(eventKey, 'delivery_status', supabase);
          if (!isNew) {
            results.push({ type: 'status', id: wamid, duplicate: true });
            continue;
          }

          const mappedStatus: WhatsappDeliveryStatus =
            rawStatus === 'delivered' || rawStatus === 'read' || rawStatus === 'failed'
              ? (rawStatus as WhatsappDeliveryStatus)
              : 'sent';

          const errorCode =
            st?.errors?.[0]?.code ? String(st.errors[0].code) : null;

          try {
            const { error: logErr } = await supabase
              .from('whatsapp_message_log')
              .update({
                status: mappedStatus,
                error_code: errorCode,
                updated_at: new Date().toISOString(),
              })
              .eq('message_id', wamid);
            if (logErr && !isSchemaMissingError(logErr)) {
              console.warn('WhatsApp status log update warning:', logErr.message);
            }
          } catch {
            // ignore schema mismatch
          }

          // Locate transaction for this wamid
          let txId: string | null =
            getInMemoryOutboundLogsForTests().find((l) => l.message_id === wamid)?.transaction_id ||
            null;

          if (!txId) {
            try {
              const { data: logRow } = await supabase
                .from('whatsapp_message_log')
                .select('transaction_id')
                .eq('message_id', wamid)
                .maybeSingle();
              if (logRow?.transaction_id) txId = logRow.transaction_id;
            } catch {
              // ignore
            }
          }

          if (txId) {
            await updateTransactionWhatsappState(
              txId,
              { whatsapp_delivery_status: mappedStatus },
              supabase
            );
          }

          if (mappedStatus === 'failed') {
            await checkAndAlertWhatsappAnomalies(
              { eventType: 'failed', transactionId: txId },
              supabase
            );
          }

          results.push({ type: 'status', id: wamid, status: mappedStatus, transactionId: txId });
        }
      }
    }

    return NextResponse.json({ success: true, processed: results }, { status: 200 });
  } catch (err: any) {
    console.error('Unhandled error in WhatsApp webhook route:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
