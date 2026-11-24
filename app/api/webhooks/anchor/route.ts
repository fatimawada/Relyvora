import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import {
  generateCryptographicReleaseCode,
  computeReleaseCodeHmac,
  calculateDeliveryWindowCodeExpiration,
} from '@/lib/releaseCode';
import {
  getDeliveryAndLifecycleConfig,
  updateTransactionStrict,
  executeBuyerOrderRefund,
} from '@/lib/orderLifecycle';
import {
  extractAnchorDepositSenderFields,
  saveVerifiedRefundDestination,
} from '@/lib/refundDestination';
import { sendSystemAlert } from '@/lib/alerts';
import { sendReleaseCodeSmsOrWhatsapp, maskPhoneNumber } from '@/lib/smsDelivery';
import { evaluateDepositWebhookRisk, persistRiskEvaluation } from '@/lib/riskEngine';
import { logInfo, logWarn } from '@/lib/logger';
import { getClientIp } from '@/lib/rateLimit';

/**
 * Strict HMAC-SHA256 webhook signature verification (Fail Closed).
 */
function verifyAnchorSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.ANCHOR_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) {
    return false;
  }

  try {
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signatureHeader.trim(), 'hex');
    const compBuf = Buffer.from(computedSignature, 'hex');

    if (sigBuf.length === 0 || sigBuf.length !== compBuf.length) return false;
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
          clientIp: getClientIp(request),
          hasSignature: Boolean(signature),
          secretConfigured: Boolean(process.env.ANCHOR_WEBHOOK_SECRET?.trim()),
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
      return NextResponse.json({ success: true, message: 'Event ignored (not a credit)' }, { status: 200 });
    }

    const attributes = payload?.data?.attributes || payload?.attributes || {};
    const accountNumber = attributes?.accountNumber || attributes?.destinationAccountNumber;
    const rawMetadataTxId = attributes?.metadata?.transactionId || payload?.metadata?.transactionId || null;
    const isValidUuid =
      typeof rawMetadataTxId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawMetadataTxId);
    const metadataTxId = isValidUuid ? rawMetadataTxId : null;
    const amountKobo = Number(attributes?.amount) || 0;
    const amountNaira = amountKobo / 100;

    const supabase = getServiceSupabase();
    const extractedSender = extractAnchorDepositSenderFields(payload);

    // 2. Execute DB-first idempotency & atomic deposit processing via Postgres RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('rpc_process_webhook_deposit', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_account_number: accountNumber || '',
      p_amount_naira: amountNaira,
      p_metadata_tx_id: metadataTxId,
      p_payload: payload,
    });

    if (rpcError || !rpcResult) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'RPC rpc_process_webhook_deposit Failed (Fail Closed)',
        details: { eventId, error: rpcError?.message || 'Empty RPC response' },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: rpcError?.message || 'Deposit webhook RPC failed.' },
        { status: 500 }
      );
    }

    if (rpcResult.replayed) {
      return NextResponse.json({ success: true, message: 'Webhook event already processed (idempotent)' }, { status: 200 });
    }

    if (rpcResult.status === 'UNMATCHED') {
      sendSystemAlert({
        type: 'WEBHOOK_FAILURE',
        severity: 'CRITICAL',
        title: 'Unmatched Deposit Webhook Received (No Transaction Linked)',
        details: {
          accountNumber,
          amountNaira,
          eventId,
        },
      }).catch(() => {});

      return NextResponse.json(
        { success: false, status: 'UNMATCHED', error: 'No matching transaction found. Recorded as UNMATCHED for reconciliation.' },
        { status: 422 }
      );
    }

    const txId: string | undefined = rpcResult.transaction_id;
    const senderAccountNumber = rpcResult.sender_account_number || extractedSender.senderAccountNumber;
    const senderBankCode = rpcResult.sender_bank_code || extractedSender.senderBankCode;
    const senderName = rpcResult.sender_name || extractedSender.senderName;

    // Persist encrypted verified refund destination strictly when sender details exist
    if (txId && senderAccountNumber && senderBankCode) {
      const saveDest = await saveVerifiedRefundDestination({
        transactionId: txId,
        bankCode: senderBankCode,
        accountNumber: senderAccountNumber,
        accountName: senderName || 'Verified Buyer',
        source: 'DEPOSIT_SENDER',
        supabaseClient: supabase,
      });
      if (!saveDest.verified) {
        await sendSystemAlert({
          type: 'SYSTEM_FAILURE',
          severity: 'CRITICAL',
          title: 'Failed Persisting Deposit Refund Destination (Fail Closed)',
          transactionId: txId,
          details: { eventId },
        }).catch(() => {});
        return NextResponse.json(
          { success: false, error: 'Failed saving verified refund destination.' },
          { status: 500 }
        );
      }
    }

    // Handle Underpayment
    if (rpcResult.status === 'PARTIALLY_FUNDED') {
      sendSystemAlert({
        type: 'STUCK_FUNDS',
        severity: 'CRITICAL',
        title: 'Partial Escrow Underpayment Received (Status: PARTIALLY_FUNDED)',
        transactionId: rpcResult.transaction_id,
        details: {
          receivedNaira: amountNaira,
          totalDeposited: rpcResult.total_deposited,
          totalDue: rpcResult.total_due,
          remainingDue: rpcResult.total_due - rpcResult.total_deposited,
          eventId,
        },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        status: 'PARTIALLY_FUNDED',
        transactionId: rpcResult.transaction_id,
        totalDeposited: rpcResult.total_deposited,
        totalDue: rpcResult.total_due,
      }, { status: 200 });
    }

    // Handle Late or Excess Deposit received after EXPIRED/CANCELLED/non-funding state
    if (rpcResult.late_or_excess) {
      const isLateAfterTerminal =
        rpcResult.deposit_status === 'LATE_AFTER_TERMINAL' ||
        ['EXPIRED', 'CANCELLED'].includes(String(rpcResult.current_status || ''));

      let autoRefundResult: { success: boolean; transferId?: string; error?: string } | null = null;
      if (isLateAfterTerminal && txId && amountNaira > 0) {
        const { data: txRow, error: lateErr } = await supabase
          .from('transactions')
          .select('*')
          .eq('id', txId)
          .single();
        if (lateErr || !txRow) {
          return NextResponse.json(
            { success: false, error: lateErr?.message || 'Failed loading late-deposit transaction.' },
            { status: 500 }
          );
        }
        autoRefundResult = await executeBuyerOrderRefund({
          tx: txRow,
          amountNgn: amountNaira,
          reasonTag: 'LATE_DEPOSIT_REFUND',
          targetStatus: null,
          referenceKey: `late_dep_${eventId}`,
          supabaseClient: supabase,
        });
      }

      sendSystemAlert({
        type: 'STUCK_FUNDS',
        severity: 'CRITICAL',
        title: isLateAfterTerminal
          ? `Late Deposit After ${rpcResult.current_status} Order`
          : `Late / Excess Deposit Received on Escrow (Status: ${rpcResult.current_status})`,
        transactionId: rpcResult.transaction_id,
        details: {
          currentStatus: rpcResult.current_status,
          depositStatus: rpcResult.deposit_status,
          receivedNaira: amountNaira,
          totalDeposited: rpcResult.total_deposited,
          excessAmount: rpcResult.excess_amount,
          autoRefundExecuted: Boolean(autoRefundResult?.success),
          autoRefundTransferId: autoRefundResult?.transferId || null,
          autoRefundBlockedReason: autoRefundResult && !autoRefundResult.success ? autoRefundResult.error : null,
          eventId,
        },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        message: isLateAfterTerminal
          ? 'Late deposit on terminal order recorded; verified refund flow triggered.'
          : 'Deposit recorded as excess/late; transaction status preserved.',
        status: rpcResult.status,
        depositStatus: rpcResult.deposit_status,
        transactionId: rpcResult.transaction_id,
        excessAmount: rpcResult.excess_amount,
        autoRefund: autoRefundResult,
      }, { status: 200 });
    }

    if (!rpcResult.success) {
      return NextResponse.json({ success: false, error: rpcResult.error || 'Deposit handling failed' }, { status: 400 });
    }

    if (rpcResult.excess_amount > 0) {
      sendSystemAlert({
        type: 'STUCK_FUNDS',
        severity: 'WARNING',
        title: 'Escrow Overpayment Detected (Excess Held)',
        transactionId: rpcResult.transaction_id,
        details: {
          excessAmountNaira: rpcResult.excess_amount,
          amountPaidNaira: rpcResult.amount_paid,
          eventId,
        },
      }).catch(() => {});
    }

    // 3. Evaluate deposit-time risk/cap/self-dealing
    let effectiveVendorId: string | null = rpcResult.vendor_id || null;
    if (txId && !effectiveVendorId) {
      const { data: txRow, error: vLookupErr } = await supabase
        .from('transactions')
        .select('vendor_id')
        .eq('id', txId)
        .single();
      if (vLookupErr) {
        return NextResponse.json({ success: false, error: `Vendor lookup failed: ${vLookupErr.message}` }, { status: 500 });
      }
      effectiveVendorId = txRow?.vendor_id || null;
    }

    const depositRisk = txId
      ? await evaluateDepositWebhookRisk({
          transactionId: txId,
          vendorId: effectiveVendorId,
          totalDepositedNgn: Number(rpcResult.total_deposited ?? rpcResult.amount_paid ?? amountNaira),
          senderAccountNumber,
          senderBankCode,
          senderName,
          supabaseClient: supabase,
        })
      : null;

    if (txId && depositRisk && (depositRisk.signals.length > 0 || senderName || senderAccountNumber)) {
      await persistRiskEvaluation({
        transactionId: txId,
        vendorId: effectiveVendorId,
        evaluation: depositRisk,
        extraTxPatch: {
          ...(senderAccountNumber ? { sender_account_number: senderAccountNumber } : {}),
          ...(senderBankCode ? { sender_bank_code: senderBankCode } : {}),
          ...(senderName ? { sender_name: senderName } : {}),
        },
        metadata: { stage: 'anchor_deposit_webhook', eventId },
        supabaseClient: supabase,
      });
    }

    // 4. Issue Cryptographic Release Code & Set Delivery/Dispatch Deadlines ONLY when funded & not blocked
    let issuedSandboxReleaseCode: string | null = null;
    if (txId && rpcResult.needs_code_issue && !depositRisk?.orderBlocked) {
      const { data: txMeta, error: txMetaErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', txId)
        .single();

      if (txMetaErr || !txMeta) {
        return NextResponse.json(
          { success: false, error: txMetaErr?.message || 'Failed loading transaction for code issuance.' },
          { status: 500 }
        );
      }

      const cfg = await getDeliveryAndLifecycleConfig(supabase);
      const deliveryType = txMeta.delivery_type === 'interstate' ? 'interstate' : 'same_city';
      const nowMs = Date.now();
      const expiryInfo = calculateDeliveryWindowCodeExpiration(
        deliveryType,
        cfg.delivery,
        new Date(nowMs).toISOString()
      );
      const dispatchDeadlineAt = new Date(
        nowMs + cfg.delivery.dispatch_deadline_days * 24 * 3600 * 1000
      ).toISOString();

      const rawCode = generateCryptographicReleaseCode();
      const hmacHash = computeReleaseCodeHmac(txId, rawCode);

      const upd = await updateTransactionStrict(
        txId,
        {
          release_code_hash: hmacHash,
          code_expires_at: expiryInfo.codeExpiresAt,
          dispatch_deadline_at: dispatchDeadlineAt,
          delivery_deadline_at: expiryInfo.deliveryDeadlineAt,
          failed_code_attempts: 0,
          code_locked: false,
          updated_at: new Date().toISOString(),
        },
        supabase
      );
      if (!upd.success) {
        return NextResponse.json({ success: false, error: upd.error || 'Failed storing release code.' }, { status: 500 });
      }

      const smsDelivery = await sendReleaseCodeSmsOrWhatsapp({
        transactionId: txId,
        vendorId: txMeta.vendor_id,
        buyerPhone: txMeta.buyer_phone,
        releaseCode: rawCode,
        itemName: txMeta.item_name || 'Escrow Order',
        totalAmount: Number(txMeta.total_amount) || 0,
        vendorHandle: txMeta.vendor_handle || '',
      }).catch((err) => {
        logWarn('RELEASE_CODE_WHATSAPP_DELIVERY_FAILED', { transactionId: txId, error: err?.message });
        return { success: false, channel: 'whatsapp', maskedPhone: maskPhoneNumber(txMeta.buyer_phone) };
      });

      if (process.env.PAYMENTS_MODE !== 'live' && process.env.VERCEL_ENV !== 'production') {
        issuedSandboxReleaseCode = rawCode;
      }

      const { error: auditErr } = await supabase
        .from('admin_audit_log')
        .insert({
          admin_email: 'system:anchor_webhook',
          action: 'RELEASE_CODE_ISSUED',
          target_type: 'transaction',
          target_id: txId,
          metadata: {
            sms_channel: smsDelivery.channel,
            buyer_phone_masked: smsDelivery.maskedPhone,
            delivery_type: deliveryType,
            code_expires_at: expiryInfo.codeExpiresAt,
            dispatch_deadline_at: dispatchDeadlineAt,
          },
        });
      if (auditErr) {
        return NextResponse.json({ success: false, error: `Audit log insert failed: ${auditErr.message}` }, { status: 500 });
      }

      logInfo('RELEASE_CODE_ISSUED_FOR_FUNDED_ORDER', {
        transactionId: txId,
        maskedPhone: smsDelivery.maskedPhone,
        deliveryType,
      });
    }

    return NextResponse.json(
      {
        success: true,
        transactionId: txId,
        status: rpcResult.status,
        riskAction: depositRisk?.actionTaken || 'ALLOW',
        reviewHold: Boolean(depositRisk?.reviewHold),
        orderBlocked: Boolean(depositRisk?.orderBlocked),
        ...(issuedSandboxReleaseCode ? { sandbox_release_code: issuedSandboxReleaseCode } : {}),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Unhandled error in Anchor webhook route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
