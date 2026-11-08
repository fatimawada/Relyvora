import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getScenarioById } from '@/lib/disputeScenarios';
import { recordLedgerEntry } from '@/lib/ledger';
import { sendSystemAlert } from '@/lib/alerts';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      transactionId,
      scenarioNumber,
      resolutionAction,
      vendorPayoutAmount = 0,
      buyerRefundAmount = 0,
      relyvoraFee = 0,
      resolutionNotes = '',
      resolvedBy = 'admin',
      adminEmail = 'support@relyvora.com',
      confirmed = false,
    } = body;

    // Phase G1.5 Security: Server-side authorization on every admin API route
    const rawAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST || process.env.ALERT_EMAIL || 'support@relyvora.com';
    const allowlist = rawAllowlist.split(',').map(e => e.trim().toLowerCase());
    const adminKey = request.headers.get('x-admin-key');
    const isAuthorized = 
      (process.env.ADMIN_SECRET_KEY && adminKey === process.env.ADMIN_SECRET_KEY) ||
      (adminEmail && allowlist.includes(adminEmail.trim().toLowerCase()));

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Admin authorization failed or email not in allowlist.' },
        { status: 403 }
      );
    }

    // Phase G1.5 Security: Refunds and release overrides need explicit confirmation step
    if ((resolutionAction === 'FULL_REFUND_BUYER' || resolutionAction === 'FULL_PAYOUT_VENDOR') && !confirmed) {
      return NextResponse.json(
        {
          success: false,
          requiresConfirmation: true,
          error: `Executing ${resolutionAction} is irreversible and requires explicit confirmation.`,
        },
        { status: 400 }
      );
    }

    if (!transactionId || !scenarioNumber || !resolutionAction) {
      return NextResponse.json(
        { success: false, error: 'transactionId, scenarioNumber, and resolutionAction are required.' },
        { status: 400 }
      );
    }

    const scenario = getScenarioById(Number(scenarioNumber));
    if (!scenario) {
      return NextResponse.json(
        { success: false, error: `Invalid scenario number (${scenarioNumber}). Must be between 1 and 8.` },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();

    // 1. Fetch transaction
    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found.' }, { status: 404 });
    }

    if (existing.status !== 'DISPUTED') {
      return NextResponse.json(
        { success: false, error: `Cannot resolve: transaction is in '${existing.status}' status, not 'DISPUTED'.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const totalAmount = Number(existing.total_amount) || 0;

    // Determine target state
    let targetStatus: string = 'RELEASED';
    if (resolutionAction === 'FULL_REFUND_BUYER') {
      targetStatus = 'REFUNDED';
    } else if (resolutionAction === 'FULL_PAYOUT_VENDOR') {
      targetStatus = 'RELEASED';
    } else {
      targetStatus = 'RELEASED'; // Split resolution marks transaction completed
    }

    // 2. Atomically update transaction
    const { data: updatedTx, error: updateErr } = await supabase
      .from('transactions')
      .update({
        status: targetStatus,
        dispute_scenario: scenarioNumber,
        resolved_at: now,
        resolution_action: resolutionAction,
        resolution_notes: resolutionNotes.trim() || null,
        updated_at: now,
      })
      .eq('id', transactionId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // 3. Insert into dispute_resolutions table
    try {
      await supabase.from('dispute_resolutions').insert([
        {
          transaction_id: transactionId,
          scenario_number: scenarioNumber,
          scenario_name: scenario.name,
          resolution_action: resolutionAction,
          buyer_refund_amount: Number(buyerRefundAmount) || 0,
          vendor_payout_amount: Number(vendorPayoutAmount) || 0,
          relyvora_fee: Number(relyvoraFee) || 0,
          resolved_by: resolvedBy,
          resolution_notes: resolutionNotes.trim() || null,
          created_at: now,
        },
      ]);

      // Phase G1.5 Security: Write to admin_audit_log
      await supabase.from('admin_audit_log').insert([
        {
          admin_email: adminEmail,
          action: `DISPUTE_RESOLUTION_${resolutionAction}`,
          target_type: 'transaction',
          target_id: transactionId,
          metadata: {
            scenarioNumber,
            buyerRefundAmount,
            vendorPayoutAmount,
            resolutionNotes,
          },
        },
      ]);
    } catch (auditErr) {
      console.warn('Failed to insert into dispute_resolutions table (schema migration may be pending):', auditErr);
    }

    // 4. Record immutable ledger entries based on resolution type
    if (resolutionAction === 'FULL_REFUND_BUYER') {
      await recordLedgerEntry({
        transactionId,
        entryType: 'REFUND_BUYER',
        amount: totalAmount,
        currency: 'NGN',
        fromAccount: 'Relyvora Escrow Vault',
        toAccount: `Buyer (${existing.buyer_phone || 'Customer'})`,
        idempotencyKey: `ledger_${transactionId}_REFUND_BUYER_${Date.now()}`,
        metadata: { scenarioNumber, scenarioName: scenario.name, notes: resolutionNotes },
      });
    } else if (resolutionAction === 'FULL_PAYOUT_VENDOR') {
      const vendorPayout = Number(existing.item_price) || (totalAmount - (Number(existing.protection_fee) || 500));
      const fee = Number(existing.protection_fee) || 500;

      await recordLedgerEntry({
        transactionId,
        entryType: 'PAYOUT_VENDOR',
        amount: vendorPayout,
        currency: 'NGN',
        fromAccount: 'Relyvora Escrow Vault',
        toAccount: `Vendor (${existing.vendor_handle})`,
        idempotencyKey: `ledger_${transactionId}_PAYOUT_VENDOR_OVERRIDE_${Date.now()}`,
        metadata: { scenarioNumber, scenarioName: scenario.name, override: true },
      });

      await recordLedgerEntry({
        transactionId,
        entryType: 'FEE_REVENUE',
        amount: fee,
        currency: 'NGN',
        fromAccount: 'Relyvora Escrow Vault',
        toAccount: 'Relyvora Revenue Account',
        idempotencyKey: `ledger_${transactionId}_FEE_REVENUE_${Date.now()}`,
        metadata: { scenarioNumber },
      });
    } else {
      // Split Resolution (Scenario 2, 5, 7)
      if (Number(buyerRefundAmount) > 0) {
        await recordLedgerEntry({
          transactionId,
          entryType: 'SPLIT_BUYER',
          amount: Number(buyerRefundAmount),
          currency: 'NGN',
          fromAccount: 'Relyvora Escrow Vault',
          toAccount: `Buyer (${existing.buyer_phone || 'Customer'})`,
          idempotencyKey: `ledger_${transactionId}_SPLIT_BUYER_${Date.now()}`,
          metadata: { scenarioNumber, resolutionAction },
        });
      }

      if (Number(vendorPayoutAmount) > 0) {
        await recordLedgerEntry({
          transactionId,
          entryType: 'SPLIT_VENDOR',
          amount: Number(vendorPayoutAmount),
          currency: 'NGN',
          fromAccount: 'Relyvora Escrow Vault',
          toAccount: `Vendor (${existing.vendor_handle})`,
          idempotencyKey: `ledger_${transactionId}_SPLIT_VENDOR_${Date.now()}`,
          metadata: { scenarioNumber, resolutionAction },
        });
      }
    }

    // 5. Send arbitration notification alert
    sendSystemAlert({
      type: 'NEW_DISPUTE',
      severity: 'WARNING',
      title: `Dispute Resolved: Scenario ${scenarioNumber} (${scenario.name})`,
      transactionId,
      vendorHandle: existing.vendor_handle,
      details: {
        resolutionAction,
        buyerRefundAmount,
        vendorPayoutAmount,
        resolvedBy,
        notes: resolutionNotes,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      transaction: updatedTx,
      message: `Dispute successfully resolved under Scenario ${scenarioNumber}: ${scenario.name}.`,
    });
  } catch (err: any) {
    console.error('Unhandled error resolving dispute:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
