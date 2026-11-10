import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getClientIp } from '@/lib/rateLimit';
import { sendSystemAlert } from '@/lib/alerts';
import { 
  executeAnchorBookTransfer, 
  executeAnchorNipTransfer, 
  RELYVORA_FBO_ACCOUNT_ID, 
  RELYVORA_REVENUE_ACCOUNT_ID 
} from '@/lib/anchor';

export async function POST(request: NextRequest) {
  try {
    // 1. Phase G2.5 Admin Authentication (@supabase/ssr session, confirmed email, app_metadata.role='admin', ADMIN_USER_IDS, AAL2 MFA)
    const auth = await verifyAdminSession(request);
    if (!auth.authorized || !auth.user?.id) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized admin access' },
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
    // Acquires SELECT ... FOR UPDATE on public.transactions,
    // verifies status is 'DISPUTED' or 'RESOLVING',
    // computes exact split on the server based on scenario / stored item_price, delivery_fee, protection_fee,
    // enforces Owner Rule 1: In Scenario 1 (Full Refund), protection_fee is NON-REFUNDABLE (buyer gets item_price + delivery_fee, Relyvora retains fee),
    // strictly validates: buyer + vendor + fee = amount_paid - excess_amount,
    // enforces Owner Rule 2: verified refund destination check,
    // transitions status to 'RESOLVING', sets resolving_at.
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

    // 3. PHASE 2: TWO-PHASE SETTLEMENT MONEY MOVEMENT
    // Uses per-leg idempotency keys and retries ONLY the missing leg.
    let refundTransferId = existingRefundId || null;
    let payoutTransferId = existingPayoutId || null;

    const isLive = process.env.PAYMENTS_MODE === 'live';

    // 3a. Execute Buyer Refund Leg (if buyerAmt > 0 and not already executed)
    if (buyerAmt > 0 && !refundTransferId) {
      const buyerIdempotencyKey = `dispute_refund_${transactionId}`;
      if (isLive) {
        try {
          // Outward NIP Transfer to verified buyer sender account (Owner Rule 2)
          // In production, resolves destination bank code & counterparty
          const nipResult = await executeAnchorNipTransfer({
            amount: Math.round(buyerAmt * 100), // Anchor uses Kobo
            sourceAccountId: RELYVORA_FBO_ACCOUNT_ID,
            counterPartyId: refundDestAcc, // counterparty mapped to verified sender account
            reason: `Relyvora Escrow Dispute Refund (${transactionId.substring(0, 8)})`,
            reference: buyerIdempotencyKey,
          });
          refundTransferId = nipResult.transferId;
        } catch (legErr: any) {
          console.error(`Buyer refund transfer failed for ${transactionId}:`, legErr);
          // Transaction remains in 'RESOLVING' for retry of missing leg
          return NextResponse.json({
            success: false,
            status: 'RESOLVING',
            error: `Buyer refund transfer failed: ${legErr.message || 'Anchor transfer error'}. Transaction remains in RESOLVING state. Retry to resume missing leg.`,
            completedLegs: { refund: false, payout: Boolean(payoutTransferId) },
          }, { status: 502 });
        }
      } else {
        // Sandbox Simulation
        refundTransferId = `sandbox_refund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      // Persist successful buyer transfer ID immediately
      await supabase.from('transactions').update({ refund_transfer_id: refundTransferId }).eq('id', transactionId);
    }

    // 3b. Execute Vendor Payout Leg (if vendorAmt > 0 and not already executed)
    if (vendorAmt > 0 && !payoutTransferId) {
      const vendorIdempotencyKey = `dispute_payout_${transactionId}`;
      if (isLive) {
        try {
          // BookTransfer from Relyvora Escrow FBO to Vendor Deposit Account
          // Fetch vendor deposit account from vendors relation
          const { data: txWithVendor } = await supabase
            .from('transactions')
            .select('vendor_id, vendors(anchor_deposit_account_id)')
            .eq('id', transactionId)
            .single();

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
          // Transaction remains in 'RESOLVING' for retry of missing leg
          return NextResponse.json({
            success: false,
            status: 'RESOLVING',
            error: `Vendor payout transfer failed: ${legErr.message || 'Anchor transfer error'}. Transaction remains in RESOLVING state. Retry to resume missing leg.`,
            completedLegs: { refund: Boolean(refundTransferId), payout: false },
          }, { status: 502 });
        }
      } else {
        // Sandbox Simulation
        payoutTransferId = `sandbox_payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      // Persist successful vendor transfer ID immediately
      await supabase.from('transactions').update({ payout_transfer_id: payoutTransferId }).eq('id', transactionId);
    }

    // 4. PHASE 3: FINALIZE DISPUTE RESOLUTION (Atomic Postgres RPC)
    // Transitions to 'REFUNDED' or 'RELEASED', inserts into dispute_resolutions,
    // appends to transaction_ledger with the REAL Anchor transfer IDs,
    // writes immutable admin_audit_log entry.
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

    // 5. Send Alert via Resend
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
      message: `Dispute successfully settled and finalized under Scenario ${scenarioNum}: ${scenarioName}.`,
    });
  } catch (err: any) {
    console.error('Unhandled error in dispute resolution route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
