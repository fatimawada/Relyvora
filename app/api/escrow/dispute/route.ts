import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { recordLedgerEntry } from '@/lib/ledger';
import { sendSystemAlert } from '@/lib/alerts';
import { getClientIp, checkSharedRateLimit } from '@/lib/rateLimit';
import { verifyReleaseCodeHmac } from '@/lib/releaseCode';
import { resolveOrderActor } from '@/lib/orderAuth';
import { evaluateLivePaymentGateServer } from '@/lib/launchGates';
import { SAFE_TRANSACTION_PUBLIC_COLUMNS } from '@/lib/transactionSelect';
import {
  DISPUTE_SCENARIOS,
  calculateBusinessHoursDeadline,
} from '@/lib/disputeScenarios';
import { getDeliveryAndLifecycleConfig } from '@/lib/orderLifecycle';
import {
  uploadOrderEvidenceFile,
  validateEvidenceFileInput,
} from '@/lib/evidenceStorage';
import { recordDisputeAndDemoteIfNeeded } from '@/lib/vendorTiers';
import {
  maskWhatsappNumber,
  sendDisputeOpenedOrUpdatedWhatsapp,
} from '@/lib/whatsapp';
import { logInfo } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      transactionId,
      disputeReason,
      otp,
      scenarioId,
      evidenceFiles = [],
    } = body || {};

    if (!transactionId || !disputeReason || typeof disputeReason !== 'string' || !disputeReason.trim()) {
      return NextResponse.json(
        { success: false, error: 'transactionId and disputeReason are required.' },
        { status: 400 }
      );
    }

    const cleanReason = disputeReason.trim();
    const scenarioNum = scenarioId !== undefined && scenarioId !== null ? Number(scenarioId) : null;
    if (scenarioNum !== null && (!Number.isInteger(scenarioNum) || scenarioNum < 1 || scenarioNum > 8)) {
      return NextResponse.json(
        { success: false, error: 'scenarioId must be an integer between 1 and 8.' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();

    // 1. Validate attached evidence files upfront (including filename & magic bytes)
    if (Array.isArray(evidenceFiles) && evidenceFiles.length > 0) {
      for (const f of evidenceFiles) {
        const b64 = String(f?.base64Data || '').replace(/^data:[^;]+;base64,/, '');
        const buf = b64 ? Buffer.from(b64, 'base64') : undefined;
        const check = await validateEvidenceFileInput({
          mimeType: String(f?.mimeType || ''),
          fileSizeBytes: buf ? buf.byteLength : 0,
          fileBuffer: buf,
          originalFilename: f?.fileName || null,
          supabaseClient: supabase,
        });
        if (!check.valid) {
          return NextResponse.json({ success: false, error: check.error }, { status: 400 });
        }
      }
    }

    // 2. Fetch existing transaction (fail closed on DB errors)
    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (fetchErr) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Dispute Transaction Lookup Failed (Fail Closed)',
        transactionId,
        details: { error: fetchErr.message },
      }).catch(() => {});
      return NextResponse.json({ success: false, error: `Transaction lookup failed: ${fetchErr.message}` }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    // 3. Strictly authenticate actor role (NEVER trust raisedByRole or useVerifiedWhatsapp from body)
    const actor = await resolveOrderActor(request, existing, supabase);
    if (!actor.authenticated) {
      return NextResponse.json(
        { success: false, code: actor.code, error: actor.error || 'Authentication required to open a dispute.' },
        { status: actor.statusCode || 401 }
      );
    }

    if (actor.role !== 'BUYER' && actor.role !== 'VENDOR') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Only the verified buyer or owning vendor can raise a dispute.' },
        { status: 403 }
      );
    }
    const role: 'BUYER' | 'VENDOR' = actor.role;

    const liveGate = await evaluateLivePaymentGateServer({
      vendorId: existing.vendor_id,
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

    // 4. Dual Rate Limiting (IP + Transaction ID)
    const clientIp = getClientIp(request);
    const [ipRl, txRl] = await Promise.all([
      checkSharedRateLimit(`${clientIp}:dispute_verify`, 8, 15 * 60 * 1000, supabase),
      checkSharedRateLimit(`tx:${transactionId}:dispute_verify`, 6, 15 * 60 * 1000, supabase),
    ]);
    if (!ipRl.allowed || !txRl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many dispute attempts. Please wait 15 minutes before submitting again.' },
        { status: 429 }
      );
    }

    // 5. Status & Post-Code Acceptance Eligibility
    if (
      existing.status === 'RELEASED' ||
      existing.status === 'RELEASING' ||
      existing.status === 'VENDOR_PAID' ||
      existing.code_verified_at
    ) {
      return NextResponse.json(
        { success: false, error: 'Cannot dispute a transaction after the release code has been accepted.' },
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

    // 6. Step-Up Buyer OTP Verification (when BUYER raises dispute)
    if (role === 'BUYER') {
      if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
        return NextResponse.json(
          { success: false, error: 'A valid 6-digit verification code (OTP) sent to the buyer WhatsApp is required.' },
          { status: 400 }
        );
      }

      const cleanOtp = otp.trim();
      if (!existing.dispute_otp_hash || !existing.dispute_otp_expires_at) {
        return NextResponse.json(
          {
            success: false,
            error: 'No active dispute verification code found. Request a fresh OTP before raising a dispute.',
            requiresOtpRequest: true,
          },
          { status: 400 }
        );
      }

      if (new Date(existing.dispute_otp_expires_at).getTime() < Date.now()) {
        return NextResponse.json(
          {
            success: false,
            error: 'The dispute verification code has expired. Please request a new code.',
            requiresOtpRequest: true,
          },
          { status: 400 }
        );
      }

      const attempts = Number(existing.dispute_otp_attempts || 0);
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

      const isValidOtp = verifyReleaseCodeHmac(`dispute:${transactionId}`, cleanOtp, existing.dispute_otp_hash);
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

    // 7. Row-locked transition to DISPUTED via RPC (strictly fail closed — no fallback)
    const nowIso = new Date().toISOString();
    const lcConfig = await getDeliveryAndLifecycleConfig(supabase);
    const sc = scenarioNum ? DISPUTE_SCENARIOS.find((s) => s.id === scenarioNum) : null;
    const deadlineDate = calculateBusinessHoursDeadline(nowIso, sc?.slaHours || 24, lcConfig.disputePolicy);
    const deadlineIso = deadlineDate.toISOString();

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_raise_dispute_with_lock', {
      p_transaction_id: transactionId,
      p_raised_by: role,
      p_scenario_id: scenarioNum,
      p_reason: cleanReason,
      p_response_deadline_at: deadlineIso,
    });

    if (rpcErr || !rpcRes) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'RPC rpc_raise_dispute_with_lock Failed (Fail Closed)',
        transactionId,
        details: { error: rpcErr?.message || 'Empty RPC response' },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: rpcErr?.message || 'Dispute lock RPC failed.' },
        { status: 500 }
      );
    }

    if (!rpcRes.success) {
      return NextResponse.json(
        { success: false, error: rpcRes.error || rpcRes.message || 'Cannot raise dispute in current order status.' },
        { status: Number(rpcRes.status_code) || 400 }
      );
    }

    // Clear dispute OTP fields cleanly
    const { data: updated, error: postRpcErr } = await supabase
      .from('transactions')
      .update({
        dispute_otp_hash: null,
        dispute_otp_expires_at: null,
        dispute_otp_attempts: 0,
        review_hold_reason: `Dispute opened by ${role}: ${cleanReason}`,
        updated_at: nowIso,
      })
      .eq('id', transactionId)
      .select(SAFE_TRANSACTION_PUBLIC_COLUMNS)
      .single();

    if (postRpcErr || !updated) {
      await sendSystemAlert({
        type: 'SYSTEM_FAILURE',
        severity: 'CRITICAL',
        title: 'Post-Dispute RPC Update Failed (Fail Closed)',
        transactionId,
        details: { error: postRpcErr?.message || 'Empty transaction after update' },
      }).catch(() => {});
      return NextResponse.json(
        { success: false, error: postRpcErr?.message || 'Failed updating post-dispute metadata.' },
        { status: 500 }
      );
    }

    // 8. Upload initial private evidence files if supplied
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
        if (!up.success || !up.record) {
          return NextResponse.json(
            { success: false, error: up.error || 'Failed storing attached dispute evidence.' },
            { status: 500 }
          );
        }
        uploadedEvidenceIds.push(up.record.id);
      }
    }

    // 9. Record Dispute Freeze in Immutable Audit Ledger & evaluate vendor tier impact
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

    if (existing.vendor_id) {
      await recordDisputeAndDemoteIfNeeded({
        vendorId: existing.vendor_id,
        transactionId,
        reason: `Dispute opened (${role}): ${cleanReason}`,
        supabaseClient: supabase,
      });
    }

    // 10. Notify counterparty via WhatsApp `dispute_opened_v1` & send ops alert
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
