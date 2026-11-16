import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { recordLedgerEntry } from '@/lib/ledger';
import { sendSystemAlert } from '@/lib/alerts';
import { getClientIp, checkSharedRateLimit } from '@/lib/rateLimit';
import { SAFE_TRANSACTION_PUBLIC_COLUMNS } from '@/lib/transactionSelect';
import {
  DISPUTE_SCENARIOS,
  calculateBusinessHoursDeadline,
} from '@/lib/disputeScenarios';
import {
  getDeliveryAndLifecycleConfig,
  mergeTransactionWithLifecycleOverlay,
  updateTransactionWithFallback,
} from '@/lib/orderLifecycle';
import {
  uploadOrderEvidenceFile,
  validateEvidenceFileInput,
} from '@/lib/evidenceStorage';
import { verifyVendorOnboardingSession } from '@/lib/vendorAuth';
import { recordDisputeAndDemoteIfNeeded } from '@/lib/vendorTiers';
import {
  applyWhatsappVerificationRedaction,
  isSchemaMissingError,
  maskWhatsappNumber,
  sendDisputeOpenedOrUpdatedWhatsapp,
} from '@/lib/whatsapp';
import { logInfo } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const supabase = getServiceSupabase();

    // 1. Rate Limiting: Max 5 dispute verification submissions per 15 minutes (shared DB bucket)
    const rateCheck = await checkSharedRateLimit(`${clientIp}:dispute_verify`, 5, 15 * 60 * 1000, supabase);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many dispute attempts. Please wait 15 minutes before submitting again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      transactionId,
      disputeReason,
      otp,
      useVerifiedWhatsapp = false,
      scenarioId,
      raisedByRole = 'BUYER',
      evidenceFiles = [],
    } = body || {};

    if (!transactionId || !disputeReason || typeof disputeReason !== 'string' || !disputeReason.trim()) {
      return NextResponse.json(
        { success: false, error: 'transactionId and disputeReason are required.' },
        { status: 400 }
      );
    }

    const role: 'BUYER' | 'VENDOR' = String(raisedByRole).toUpperCase() === 'VENDOR' ? 'VENDOR' : 'BUYER';
    const cleanReason = disputeReason.trim();
    const scenarioNum = scenarioId !== undefined && scenarioId !== null ? Number(scenarioId) : null;
    if (scenarioNum !== null && (!Number.isInteger(scenarioNum) || scenarioNum < 1 || scenarioNum > 8)) {
      return NextResponse.json(
        { success: false, error: 'scenarioId must be an integer between 1 and 8.' },
        { status: 400 }
      );
    }

    // Validate attached evidence files upfront before locking state
    if (Array.isArray(evidenceFiles) && evidenceFiles.length > 0) {
      for (const f of evidenceFiles) {
        const b64 = String(f?.base64Data || '').replace(/^data:[^;]+;base64,/, '');
        const sizeBytes = Buffer.byteLength(b64, 'base64');
        const check = await validateEvidenceFileInput({
          mimeType: String(f?.mimeType || ''),
          fileSizeBytes: sizeBytes,
          supabaseClient: supabase,
        });
        if (!check.valid) {
          return NextResponse.json({ success: false, error: check.error }, { status: 400 });
        }
      }
    }

    // 2. Fetch existing transaction + overlay
    const { data: rawExisting, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !rawExisting) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    const existing = mergeTransactionWithLifecycleOverlay(rawExisting);
    const waState = applyWhatsappVerificationRedaction(existing);

    // 3. Status Eligibility
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

    if (existing.status !== 'FUNDS_LOCKED' && existing.status !== 'DISPATCHED') {
      return NextResponse.json(
        { success: false, error: `Cannot dispute transaction in status '${existing.status}'.` },
        { status: 400 }
      );
    }

    // 4. Party Authentication (Buyer OTP or verified WhatsApp link; Vendor signed-in session)
    if (role === 'VENDOR') {
      const vendorSession = await verifyVendorOnboardingSession(request);
      if (!vendorSession.authorized || !vendorSession.user) {
        return NextResponse.json(
          { success: false, error: vendorSession.error || 'Vendor authentication required to raise a dispute.' },
          { status: vendorSession.statusCode || 401 }
        );
      }

      const { data: vRow } = await supabase
        .from('vendors')
        .select('id, store_name, email')
        .eq('user_id', vendorSession.user.id)
        .maybeSingle();

      const matchesVendor =
        (existing.vendor_id && vRow?.id === existing.vendor_id) ||
        (vRow?.store_name && existing.vendor_handle?.toLowerCase() === vRow.store_name.toLowerCase());

      if (!vRow || !matchesVendor) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Only the vendor on this order can open a vendor dispute.' },
          { status: 403 }
        );
      }
    } else {
      const canUseVerifiedWa = Boolean(useVerifiedWhatsapp && waState.buyer_phone_verified === true);
      if (!canUseVerifiedWa) {
        if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
          return NextResponse.json(
            { success: false, error: 'A valid 6-digit verification code (OTP) sent to the buyer phone is required.' },
            { status: 400 }
          );
        }

        const cleanOtp = otp.trim();
        if (!existing.dispute_otp_hash || !existing.dispute_otp_expires_at) {
          return NextResponse.json(
            {
              success: false,
              error: 'No active verification code found. Please request a new OTP sent to your phone before raising a dispute.',
              requiresOtpRequest: true,
            },
            { status: 400 }
          );
        }

        if (new Date(existing.dispute_otp_expires_at).getTime() < Date.now()) {
          return NextResponse.json(
            {
              success: false,
              error: 'The verification code has expired. Please request a new code.',
              requiresOtpRequest: true,
            },
            { status: 400 }
          );
        }

        const attempts = existing.dispute_otp_attempts || 0;
        if (attempts >= 3) {
          await supabase
            .from('transactions')
            .update({ dispute_otp_hash: null, dispute_otp_expires_at: null })
            .eq('id', transactionId);

          return NextResponse.json(
            {
              success: false,
              error: 'Maximum verification attempts exceeded (3/3). Please request a new verification code.',
              requiresOtpRequest: true,
            },
            { status: 403 }
          );
        }

        const secret = process.env.RELEASE_CODE_PEPPER || 'relyvora_dispute_otp_pepper_secret';
        const computedHash = crypto
          .createHmac('sha256', secret)
          .update(`${transactionId}:${cleanOtp}`)
          .digest('hex');

        const expectedBuf = Buffer.from(existing.dispute_otp_hash, 'hex');
        const computedBuf = Buffer.from(computedHash, 'hex');

        const isValidOtp =
          expectedBuf.length === computedBuf.length &&
          crypto.timingSafeEqual(expectedBuf, computedBuf);

        if (!isValidOtp) {
          const nextAttempts = attempts + 1;
          await supabase
            .from('transactions')
            .update({ dispute_otp_attempts: nextAttempts })
            .eq('id', transactionId);

          const remaining = 3 - nextAttempts;
          return NextResponse.json(
            {
              success: false,
              error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Lockout triggered. Please request a new code.'}`,
              attemptsRemaining: remaining,
            },
            { status: 400 }
          );
        }
      }
    }

    // 5. Row-locked transition to DISPUTED + review_hold = true + Business-Hours SLA deadline
    const nowIso = new Date().toISOString();
    const lcConfig = await getDeliveryAndLifecycleConfig(supabase);
    const sc = scenarioNum ? DISPUTE_SCENARIOS.find((s) => s.id === scenarioNum) : null;
    const deadlineDate = calculateBusinessHoursDeadline(nowIso, sc?.slaHours || 24, lcConfig.disputePolicy);
    const deadlineIso = deadlineDate.toISOString();

    let updated: any = null;
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_raise_dispute_with_lock', {
      p_transaction_id: transactionId,
      p_dispute_reason: cleanReason,
      p_dispute_scenario: scenarioNum,
      p_raised_by_role: role,
      p_response_deadline_at: deadlineIso,
    });

    if (!rpcErr && rpcRes) {
      if (!rpcRes.success) {
        return NextResponse.json(
          { success: false, error: rpcRes.message || 'Cannot raise dispute in current order status.' },
          { status: 400 }
        );
      }
      const { data: fetchedAfterRpc } = await supabase
        .from('transactions')
        .select(SAFE_TRANSACTION_PUBLIC_COLUMNS)
        .eq('id', transactionId)
        .single();
      updated = fetchedAfterRpc;
    } else if (!rpcErr || isSchemaMissingError(rpcErr)) {
      const { data: fallbackUpdated, error: updateErr } = await supabase
        .from('transactions')
        .update({
          status: 'DISPUTED',
          dispute_reason: cleanReason,
          disputed_at: nowIso,
          dispute_otp_hash: null,
          dispute_otp_expires_at: null,
          dispute_otp_attempts: 0,
          updated_at: nowIso,
        })
        .eq('id', transactionId)
        .in('status', ['FUNDS_LOCKED', 'DISPATCHED'])
        .select(SAFE_TRANSACTION_PUBLIC_COLUMNS)
        .single();

      if (updateErr || !fallbackUpdated) {
        return NextResponse.json(
          { success: false, error: updateErr?.message || 'Dispute state transition conflict.' },
          { status: 409 }
        );
      }
      updated = fallbackUpdated;
    } else {
      return NextResponse.json({ success: false, error: rpcErr.message }, { status: 500 });
    }

    await updateTransactionWithFallback(
      transactionId,
      {
        status: 'DISPUTED',
        dispute_reason: cleanReason,
        disputed_at: nowIso,
        review_hold: true,
        review_hold_reason: `Dispute opened by ${role}: ${cleanReason}`,
        dispute_raised_by: role,
        dispute_response_deadline_at: deadlineIso,
        ...(scenarioNum ? { dispute_scenario: scenarioNum } : {}),
        updated_at: nowIso,
      },
      supabase
    );

    // 6. Upload initial private evidence files if supplied
    const uploadedEvidenceIds: string[] = [];
    if (Array.isArray(evidenceFiles)) {
      for (const f of evidenceFiles) {
        if (!f?.base64Data) continue;
        const b64 = String(f.base64Data).replace(/^data:[^;]+;base64,/, '');
        const up = await uploadOrderEvidenceFile({
          transactionId,
          uploadedByRole: role,
          evidenceCategory: 'DISPUTE_EVIDENCE',
          scenarioId: scenarioNum,
          fileBuffer: Buffer.from(b64, 'base64'),
          mimeType: String(f.mimeType || ''),
          originalFilename: f.fileName || 'dispute-evidence',
          description: f.description || null,
          supabaseClient: supabase,
        });
        if (up.success && up.record) {
          uploadedEvidenceIds.push(up.record.id);
        }
      }
    }

    // 7. Record Dispute Freeze in Immutable Audit Ledger & evaluate vendor tier impact
    await recordLedgerEntry(
      {
        transactionId,
        entryType: 'DISPUTE_FREEZE',
        amount: Number(existing.total_amount) || 0,
        currency: 'NGN',
        fromAccount: 'Relyvora Escrow Vault',
        toAccount: 'Dispute Arbitration Vault',
        idempotencyKey: `ledger_${transactionId}_DISPUTE_FREEZE`,
        metadata: {
          reason: cleanReason,
          disputedAt: nowIso,
          raisedByRole: role,
          scenarioId: scenarioNum,
          responseDeadlineAt: deadlineIso,
        },
      },
      supabase
    );

    await recordDisputeAndDemoteIfNeeded({
      vendorId: existing.vendor_id,
      transactionId,
      reason: `Dispute opened (${role}): ${cleanReason}`,
      supabaseClient: supabase,
    }).catch(() => {});

    // 8. Notify counterparty via WhatsApp `dispute_opened_v1` & send ops alert (masked PII only)
    const deadlineText = deadlineDate.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });
    if (role === 'BUYER' && existing.vendor_id) {
      const { data: vendorRow } = await supabase
        .from('vendors')
        .select('phone_number, store_name')
        .eq('id', existing.vendor_id)
        .maybeSingle();
      if (vendorRow?.phone_number) {
        await sendDisputeOpenedOrUpdatedWhatsapp(
          {
            transactionId,
            recipientPhone: vendorRow.phone_number,
            itemName: existing.item_name || 'Escrow Order',
            updateSummary: `Buyer raised a dispute (${sc?.name || 'Order Dispute'})`,
            deadlineText,
            vendorId: existing.vendor_id,
            vendorHandle: vendorRow.store_name || existing.vendor_handle,
          },
          supabase
        ).catch(() => {});
      }
    } else if (role === 'VENDOR' && existing.buyer_phone) {
      await sendDisputeOpenedOrUpdatedWhatsapp(
        {
          transactionId,
          recipientPhone: existing.buyer_phone,
          itemName: existing.item_name || 'Escrow Order',
          updateSummary: `Vendor opened a dispute (${sc?.name || 'Order Dispute'})`,
          deadlineText,
          vendorId: existing.vendor_id,
          vendorHandle: existing.vendor_handle,
        },
        supabase
      ).catch(() => {});
    }

    sendSystemAlert({
      type: 'NEW_DISPUTE',
      severity: 'WARNING',
      title: `New Escrow Dispute Flagged (By ${role}${sc ? `, Scenario ${sc.id}` : ''})`,
      transactionId,
      vendorHandle: existing.vendor_handle,
      details: {
        itemName: existing.item_name,
        amount: existing.total_amount,
        disputeReason: cleanReason,
        raisedByRole: role,
        scenarioId: scenarioNum,
        responseDeadlineAt: deadlineIso,
        maskedBuyerPhone: maskWhatsappNumber(existing.buyer_phone),
      },
    }).catch(() => {});

    logInfo('ESCROW_DISPUTE_OPENED', {
      transactionId,
      raisedByRole: role,
      scenarioId: scenarioNum,
      evidenceCount: uploadedEvidenceIds.length,
    });

    return NextResponse.json({
      success: true,
      transaction: {
        ...updated,
        dispute_scenario: scenarioNum,
        dispute_raised_by: role,
        dispute_response_deadline_at: deadlineIso,
      },
      uploadedEvidenceIds,
      disputeResponseDeadlineAt: deadlineIso,
      message: 'Escrow funds have been safely frozen under dispute arbitration.',
    });
  } catch (err: any) {
    console.error('Unhandled error raising verified dispute:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
