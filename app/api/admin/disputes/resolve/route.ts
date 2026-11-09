import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { getScenarioById } from '@/lib/disputeScenarios';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getClientIp } from '@/lib/rateLimit';
import { sendSystemAlert } from '@/lib/alerts';

export async function POST(request: NextRequest) {
  try {
    // 1. Phase G2.5 Security: Verify Supabase Auth session & server-only ADMIN_EMAIL_ALLOWLIST
    const auth = await verifyAdminSession(request);
    if (!auth.authorized || !auth.user?.email) {
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
      scenarioNumber,
      resolutionAction,
      vendorPayoutAmount = 0,
      buyerRefundAmount = 0,
      relyvoraFee = 0,
      resolutionNotes = '',
      confirmed = false,
    } = body;

    // 2. Refunds and release overrides require explicit confirmation flag
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

    // 3. Call atomic Postgres RPC public.rpc_admin_resolve_dispute
    // Acquires SELECT ... FOR UPDATE on public.transactions, verifies status = 'DISPUTED',
    // validates amounts, transitions state, inserts into dispute_resolutions,
    // appends to transaction_ledger, and logs to admin_audit_log in one atomic transaction.
    const { data: rpcResult, error: rpcError } = await supabase.rpc('rpc_admin_resolve_dispute', {
      p_transaction_id: transactionId,
      p_scenario_number: Number(scenarioNumber),
      p_scenario_name: scenario.name,
      p_resolution_action: resolutionAction,
      p_buyer_refund_amount: Number(buyerRefundAmount) || 0,
      p_vendor_payout_amount: Number(vendorPayoutAmount) || 0,
      p_platform_fee: Number(relyvoraFee) || 0,
      p_admin_email: verifiedAdminEmail,
      p_resolution_notes: (resolutionNotes || '').trim(),
      p_ip_address: clientIp,
    });

    if (rpcError) {
      console.error('RPC rpc_admin_resolve_dispute error:', rpcError);
      return NextResponse.json({ success: false, error: rpcError.message }, { status: 500 });
    }

    if (!rpcResult?.success) {
      return NextResponse.json(
        {
          success: false,
          error: rpcResult?.message || rpcResult?.error || 'Dispute resolution failed',
          code: rpcResult?.error,
          currentStatus: rpcResult?.current_status,
        },
        { status: 400 }
      );
    }

    // 4. Send arbitration notification alert via Resend
    sendSystemAlert({
      type: 'NEW_DISPUTE',
      severity: 'WARNING',
      title: `Dispute Resolved: Scenario ${scenarioNumber} (${scenario.name})`,
      transactionId,
      details: {
        resolutionAction,
        buyerRefundAmount,
        vendorPayoutAmount,
        platformFee: relyvoraFee,
        resolvedBy: verifiedAdminEmail,
        notes: resolutionNotes,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      transactionId,
      resolutionId: rpcResult.resolution_id,
      newStatus: rpcResult.new_status,
      message: `Dispute successfully resolved under Scenario ${scenarioNumber}: ${scenario.name}.`,
    });
  } catch (err: any) {
    console.error('Unhandled error resolving dispute:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
