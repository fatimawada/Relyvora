import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getClientIp } from '@/lib/rateLimit';
import { sendSystemAlert } from '@/lib/alerts';
import { logAndAlertAdminAction, validateAdminTypedConfirmation } from '@/lib/adminSafety';
import {
  recordDisputeAndDemoteIfNeeded,
  recordVendorComplianceStrike,
} from '@/lib/vendorTiers';
import { resolveVerifiedRefundDestination } from '@/lib/refundDestination';
import {
  createAnchorCounterParty,
  executeAnchorBookTransfer,
  executeAnchorNipTransfer,
  RELYVORA_FBO_ACCOUNT_ID,
  RELYVORA_REVENUE_ACCOUNT_ID,
} from '@/lib/anchor';

export async function POST(request: NextRequest) {
  try {
    // 1. Phase G2.5 Admin Authentication (@supabase/ssr session, confirmed email, app_metadata.role='admin', ADMIN_USER_IDS, AAL2 MFA)
    const auth = await verifyAdminSession(request);
    if (!auth.authorized || !auth.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error || 'Unauthorized admin access',
          code: auth.code,
          aal: auth.aal,
          mfaEnrolled: auth.mfaEnrolled,
          enrollmentUrl: auth.enrollmentUrl || '/admin/security',
        },
        { status: auth.statusCode }
      );
    }

    const verifiedAdminEmail = auth.user.email;
    const clientIp = getClientIp(request);

    const body = await request.json();
    const {
      transactionId,
      scenarioId,
      resolutionNotes = '',
      overrideReason,
      overrideConfirmed = false,
      overrideBuyerRefund,
      overrideVendorPayout,
      typedConfirmation,
    } = body;

    if (!transactionId || scenarioId === undefined) {
      return NextResponse.json(
        { success: false, error: 'transactionId and scenarioId are required.' },
        { status: 400 }
      );
    }

    const scenarioNum = Number(scenarioId);
    if (isNaN(scenarioNum) || scenarioNum < 1 || scenarioNum > 8) {
      return NextResponse.json(
        { success: false, error: 'scenarioId must be an integer between 1 and 8.' },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();

    // 2. PHASE 1: PREPARE DISPUTE RESOLUTION (Atomic Postgres RPC)
    const { data: prepResult, error: prepError } = await supabase.rpc('rpc_admin_prepare_dispute_resolution', {
      p_transaction_id: transactionId,
      p_scenario_number: scenarioNum,
      p_admin_email: verifiedAdminEmail,
      p_resolution_notes: (resolutionNotes || '').trim(),
      p_override_reason: overrideReason ? overrideReason.trim() : null,
      p_override_confirmed: Boolean(overrideConfirmed),
      p_override_buyer_refund: overrideBuyerRefund !== undefined ? Number(overrideBuyerRefund) : null,
      p_override_vendor_payout: overrideVendorPayout !== undefined ? Number(overrideVendorPayout) : null,
    });

    if (prepError) {
      console.error('RPC rpc_admin_prepare_dispute_resolution error:', prepError);
      return NextResponse.json({ success: false, error: prepError.message }, { status: 500 });
    }

    if (!prepResult?.success) {
      return NextResponse.json(
        {
          success: false,
          error: prepResult?.message || prepResult?.error || 'Failed to prepare dispute resolution',
          code: prepResult?.error,
          currentStatus: prepResult?.current_status,
        },
        { status: 400 }
      );
    }

    const {
      buyer_refund_amount: buyerAmt,
      vendor_payout_amount: vendorAmt,
      relyvora_fee: feeAmt,
      resolution_action: resolutionAction,
      scenario_name: scenarioName,
      refund_destination_account: refundDestAcc,
      refund_destination_bank: refundDestBank,
      existing_refund_transfer_id: existingRefundId,
      existing_payout_transfer_id: existingPayoutId,
    } = prepResult;

    const confirmAction =
      resolutionAction === 'FULL_REFUND_BUYER' || resolutionAction === 'FULL_REFUND' || resolutionAction === 'REFUND'
        ? 'REFUND'
        : resolutionAction === 'FULL_PAYOUT_VENDOR' || resolutionAction === 'FULL_RELEASE' || resolutionAction === 'RELEASE'
          ? 'RELEASE'
          : 'SPLIT';

    const totalSettlementNgn = Number(buyerAmt || 0) + Number(vendorAmt || 0);
    const confirmCheck = await validateAdminTypedConfirmation({
      action: confirmAction,
      transactionId,
      amountNgn: totalSettlementNgn,
      typedConfirmation,
    });

    if (!confirmCheck.valid) {
      return NextResponse.json(
        {
          success: false,
          code: 'TYPED_CONFIRMATION_REQUIRED',
          expectedPhrase: confirmCheck.expectedPhrase,
          error: confirmCheck.error,
        },
        { status: 400 }
      );
    }

    // 3. Enforce verified refund destination before initiating any buyer refund leg
    let refundTransferId = existingRefundId || null;
    let payoutTransferId = existingPayoutId || null;
    const isLive = process.env.PAYMENTS_MODE === 'live';

    if (buyerAmt > 0 && !refundTransferId) {
      const { data: txForRefund } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      const resolvedDest = await resolveVerifiedRefundDestination(
        txForRefund || {
          id: transactionId,
          refund_destination_account: refundDestAcc,
          refund_destination_bank: refundDestBank,
        },
        supabase
      );

      if (!resolvedDest.verified || !resolvedDest.accountNumber || !resolvedDest.bankCode) {
        return NextResponse.json(
          {
            success: false,
            code: 'REFUND_DESTINATION_UNVERIFIED',
            error:
              'Verified buyer refund destination is missing. Ask the buyer to submit and OTP-verify their Nigerian NUBAN on /order/' +
              transactionId +
              ' before executing any refund.',
          },
          { status: 422 }
        );
      }

      const buyerIdempotencyKey = `dispute_refund_${transactionId}`;
      if (isLive) {
        try {
          const cpResult = await createAnchorCounterParty({
            bankCode: resolvedDest.bankCode,
            accountNumber: resolvedDest.accountNumber,
            accountName: resolvedDest.accountName || 'Verified Buyer',
            verifyName: false,
          });

          const nipResult = await executeAnchorNipTransfer({
            amount: Math.round(buyerAmt * 100),
            sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
            counterPartyId: cpResult.counterPartyId,
            reason: `Relyvora Escrow Dispute Refund (${transactionId.substring(0, 8)})`,
            reference: buyerIdempotencyKey,
          });
          refundTransferId = nipResult.transferId;
        } catch (legErr: any) {
          console.error(`Buyer refund transfer failed for ${transactionId}:`, legErr);
          return NextResponse.json({
            success: false,
            status: 'RESOLVING',
            error: `Buyer refund transfer failed: ${legErr.message || 'Anchor transfer error'}. Transaction remains in RESOLVING state. Retry to resume missing leg.`,
            completedLegs: { refund: false, payout: Boolean(payoutTransferId) },
          }, { status: 502 });
        }
      } else {
        refundTransferId = `sandbox_refund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      const { error: rfUpdErr } = await supabase
        .from('transactions')
        .update({ refund_transfer_id: refundTransferId })
        .eq('id', transactionId);
      if (rfUpdErr) {
        return NextResponse.json(
          { success: false, error: `Failed saving refund transfer reference: ${rfUpdErr.message}` },
          { status: 500 }
        );
      }
    }

    // 3b. Execute Vendor Payout Leg (if vendorAmt > 0 and not already executed)
    if (vendorAmt > 0 && !payoutTransferId) {
      const vendorIdempotencyKey = `dispute_payout_${transactionId}`;
      if (isLive) {
        try {
          const { data: txWithVendor, error: vFetchErr } = await supabase
            .from('transactions')
            .select('vendor_id, vendors(anchor_deposit_account_id)')
            .eq('id', transactionId)
            .single();

          if (vFetchErr) {
            throw new Error(`Vendor deposit lookup failed: ${vFetchErr.message}`);
          }

          const vendorDepositAcc = (txWithVendor?.vendors as any)?.anchor_deposit_account_id || RELYVORA_REVENUE_ACCOUNT_ID;

          const bookResult = await executeAnchorBookTransfer({
            amount: Math.round(vendorAmt * 100),
            sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
            destinationAccountId: vendorDepositAcc,
            reason: `Relyvora Escrow Dispute Settlement (${transactionId.substring(0, 8)})`,
            reference: vendorIdempotencyKey,
          });
          payoutTransferId = bookResult.transferId;
        } catch (legErr: any) {
          console.error(`Vendor payout transfer failed for ${transactionId}:`, legErr);
          return NextResponse.json({
            success: false,
            status: 'RESOLVING',
            error: `Vendor payout transfer failed: ${legErr.message || 'Anchor transfer error'}. Transaction remains in RESOLVING state. Retry to resume missing leg.`,
            completedLegs: { refund: Boolean(refundTransferId), payout: false },
          }, { status: 502 });
        }
      } else {
        payoutTransferId = `sandbox_payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      const { error: poUpdErr } = await supabase
        .from('transactions')
        .update({ payout_transfer_id: payoutTransferId })
        .eq('id', transactionId);
      if (poUpdErr) {
        return NextResponse.json(
          { success: false, error: `Failed saving payout transfer reference: ${poUpdErr.message}` },
          { status: 500 }
        );
      }
    }

    // 4. PHASE 3: FINALIZE DISPUTE RESOLUTION (Atomic Postgres RPC)
    const { data: finalResult, error: finalError } = await supabase.rpc('rpc_admin_finalize_dispute_resolution', {
      p_transaction_id: transactionId,
      p_scenario_number: scenarioNum,
      p_scenario_name: scenarioName,
      p_resolution_action: resolutionAction,
      p_buyer_refund_amount: buyerAmt,
      p_vendor_payout_amount: vendorAmt,
      p_relyvora_fee: feeAmt,
      p_anchor_refund_transfer_id: refundTransferId,
      p_anchor_payout_transfer_id: payoutTransferId,
      p_admin_email: verifiedAdminEmail,
      p_resolution_notes: (resolutionNotes || '').trim(),
      p_override_reason: overrideReason || null,
      p_override_confirmed: Boolean(overrideConfirmed),
      p_ip_address: clientIp,
    });

    if (finalError) {
      console.error('RPC rpc_admin_finalize_dispute_resolution error:', finalError);
      return NextResponse.json({ success: false, error: finalError.message }, { status: 500 });
    }

    if (!finalResult?.success) {
      return NextResponse.json({
        success: false,
        error: finalResult?.message || 'Failed to finalize dispute resolution',
      }, { status: 400 });
    }

    // 5. Alert, audit log, vendor dispute demotion, and Scenario 6 compliance strike
    sendSystemAlert({
      type: 'NEW_DISPUTE',
      severity: 'WARNING',
      title: `Dispute Resolved: Scenario ${scenarioNum} (${scenarioName})`,
      transactionId,
      details: {
        resolutionAction,
        buyerRefundAmount: buyerAmt,
        vendorPayoutAmount: vendorAmt,
        platformFee: feeAmt,
        refundTransferId,
        payoutTransferId,
        resolvedBy: verifiedAdminEmail,
        notes: resolutionNotes,
      },
    }).catch(() => {});

    await logAndAlertAdminAction({
      adminEmail: verifiedAdminEmail,
      action: `DISPUTE_FINALIZE_${resolutionAction}`,
      targetType: 'transaction',
      targetId: transactionId,
      ipAddress: clientIp,
      alertTitle: `Admin Resolved Dispute: Scenario ${scenarioNum} (${scenarioName})`,
      severity: totalSettlementNgn >= 1_000_000 ? 'CRITICAL' : 'WARNING',
      skipAuditInsert: true,
      metadata: {
        scenarioNumber: scenarioNum,
        scenarioName,
        resolutionAction,
        buyerRefundAmount: buyerAmt,
        vendorPayoutAmount: vendorAmt,
        relyvoraFee: feeAmt,
        refundTransferId,
        payoutTransferId,
        notes: resolutionNotes,
      },
      supabaseClient: supabase,
    }).catch(() => {});

    const { data: resolvedTxMeta } = await supabase
      .from('transactions')
      .select('vendor_id')
      .eq('id', transactionId)
      .maybeSingle();

    await recordDisputeAndDemoteIfNeeded({
      vendorId: resolvedTxMeta?.vendor_id,
      transactionId,
      reason: `Dispute resolved: Scenario ${scenarioNum} (${scenarioName})`,
      supabaseClient: supabase,
    }).catch(() => {});

    let complianceStrikeResult = null;
    if (scenarioNum === 6 && resolutionAction === 'FULL_REFUND_BUYER' && resolvedTxMeta?.vendor_id) {
      complianceStrikeResult = await recordVendorComplianceStrike({
        vendorId: resolvedTxMeta.vendor_id,
        transactionId,
        reason: 'Scenario 6: Vendor Failure to Deliver resolved with full buyer refund',
        adminEmail: verifiedAdminEmail,
        ipAddress: clientIp,
        supabaseClient: supabase,
      }).catch(() => null);
    }

    return NextResponse.json({
      success: true,
      transactionId,
      resolutionId: finalResult.resolution_id,
      status: finalResult.status,
      distribution: {
        buyerRefundAmount: buyerAmt,
        vendorPayoutAmount: vendorAmt,
        relyvoraFee: feeAmt,
      },
      transfers: {
        refundTransferId,
        payoutTransferId,
      },
      ...(complianceStrikeResult ? { complianceStrikeResult } : {}),
      message: `Dispute successfully settled and finalized under Scenario ${scenarioNum}: ${scenarioName}.`,
    });
  } catch (err: any) {
    console.error('Unhandled error in dispute resolution route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
