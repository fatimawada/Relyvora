import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabaseServer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { listRiskFlagsAndHolds, getTxRiskFallback, hashPhoneSignal } from '@/lib/riskEngine';
import { getAdminAuditFallbackLogs } from '@/lib/adminSafety';
import { getHotSettings, isCheckoutEnabledServer, isPayoutsEnabledServer } from '@/lib/safetyLimits';
import {
  getDeliveryAndLifecycleConfig,
  mergeTransactionWithLifecycleOverlay,
} from '@/lib/orderLifecycle';
import { listOrderEvidenceRecords } from '@/lib/evidenceStorage';
import { resolveVerifiedRefundDestination } from '@/lib/refundDestination';
import { getInMemoryOutboundLogsForTests } from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdminSession(request);
    if (!auth.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error,
          code: auth.code,
          aal: auth.aal,
          mfaEnrolled: auth.mfaEnrolled,
          enrollmentUrl: auth.enrollmentUrl || '/admin/security',
        },
        { status: auth.statusCode }
      );
    }

    const supabase = getServiceSupabase();
    const searchQuery = (request.nextUrl.searchParams.get('q') || '').trim();

    const { data: allTxs, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (txErr) {
      console.warn('Failed to fetch disputes/transactions from Supabase:', txErr.message);
      return NextResponse.json({ success: false, error: txErr.message }, { status: 500 });
    }

    const lcCfg = await getDeliveryAndLifecycleConfig(supabase);
    const nowMs = Date.now();
    const stuckCutoffMs = nowMs - lcCfg.lifecycle.stuck_settlement_minutes * 60 * 1000;

    const enrichedBase = (allTxs || []).map((rawTx: any) => {
      const tx = mergeTransactionWithLifecycleOverlay(rawTx);
      const rf = getTxRiskFallback(tx.id);
      return {
        ...tx,
        risk_score: typeof tx.risk_score === 'number' ? tx.risk_score : rf?.risk_score || 0,
        risk_signals: Array.isArray(tx.risk_signals) ? tx.risk_signals : rf?.risk_signals || [],
        review_hold: typeof tx.review_hold === 'boolean' ? tx.review_hold : Boolean(rf?.review_hold),
        review_hold_reason: tx.review_hold_reason ?? rf?.review_hold_reason ?? null,
        order_blocked: typeof tx.order_blocked === 'boolean' ? tx.order_blocked : Boolean(rf?.order_blocked),
        order_block_reason: tx.order_block_reason ?? rf?.order_block_reason ?? null,
      };
    });

    // Apply optional ?q= filter (order ID, vendor handle, phone number hashed match)
    let searchPhoneHash: string | null = null;
    if (searchQuery && /\d{7,}/.test(searchQuery.replace(/\D/g, ''))) {
      searchPhoneHash = hashPhoneSignal(searchQuery);
    }

    const matchesQuery = (tx: any) => {
      if (!searchQuery) return true;
      const ql = searchQuery.toLowerCase();
      return (
        String(tx.id || '').toLowerCase().includes(ql) ||
        String(tx.vendor_handle || '').toLowerCase().includes(ql) ||
        String(tx.item_name || '').toLowerCase().includes(ql) ||
        String(tx.buyer_phone || '').toLowerCase().includes(ql) ||
        (searchPhoneHash && String(tx.buyer_phone_hash || '') === searchPhoneHash)
      );
    };

    const filteredTxs = enrichedBase.filter(matchesQuery);

    // Enrich disputes & priority orders with evidence metadata & masked refund state
    const disputesRaw = filteredTxs
      .filter((tx: any) => tx.status === 'DISPUTED' || tx.status === 'RESOLVING' || tx.dispute_reason !== null || tx.resolved_at !== null)
      .sort((a: any, b: any) => {
        const da = a.disputed_at ? new Date(a.disputed_at).getTime() : 0;
        const db = b.disputed_at ? new Date(b.disputed_at).getTime() : 0;
        return db - da;
      });

    const disputes = await Promise.all(
      disputesRaw.slice(0, 50).map(async (tx: any) => {
        const evidenceFiles = await listOrderEvidenceRecords(tx.id, supabase);
        const refundDest = await resolveVerifiedRefundDestination(tx, supabase);
        return {
          ...tx,
          evidence_files: evidenceFiles,
          refund_destination_verified: refundDest.verified,
          refund_destination_source: refundDest.source,
          refund_destination_masked: refundDest.maskedAccount,
        };
      })
    );

    const openDisputes = disputes.filter((tx: any) => ['DISPUTED', 'RESOLVING'].includes(tx.status));

    const overdueDispatch = filteredTxs.filter((tx: any) => {
      if (tx.status !== 'FUNDS_LOCKED') return false;
      const dlMs = tx.dispatch_deadline_at
        ? new Date(tx.dispatch_deadline_at).getTime()
        : tx.paid_at
          ? new Date(tx.paid_at).getTime() + lcCfg.delivery.dispatch_deadline_days * 24 * 3600 * 1000
          : Infinity;
      return dlMs <= nowMs;
    });

    const heldTransactions = filteredTxs.filter((tx: any) => tx.review_hold || tx.order_blocked);

    const stuckSettlements = filteredTxs.filter((tx: any) => {
      if (!['RELEASING', 'VENDOR_PAID'].includes(tx.status)) return false;
      const updatedMs = tx.updated_at ? new Date(tx.updated_at).getTime() : 0;
      return updatedMs <= stuckCutoffMs;
    });

    const { data: failedWaRows } = await supabase
      .from('whatsapp_message_log')
      .select('id, message_id, transaction_id, vendor_handle, masked_number, template_name, status, error_code, created_at')
      .in('status', ['failed', 'blocked'])
      .order('created_at', { ascending: false })
      .limit(50);

    const memFailedWa = getInMemoryOutboundLogsForTests().filter(
      (l) => l.status === 'failed' || l.status === 'blocked'
    );
    const failedWhatsappDeliveries =
      Array.isArray(failedWaRows) && failedWaRows.length > 0 ? failedWaRows : memFailedWa;

    const { data: unmatchedDeposits } = await supabase
      .from('deposits')
      .select('id, anchor_event_id, transaction_id, amount_naira, status, sender_name, created_at')
      .in('status', ['UNMATCHED', 'LATE_AFTER_TERMINAL', 'EXCESS'])
      .order('created_at', { ascending: false })
      .limit(50);

    const excessOrderRows = filteredTxs.filter((tx: any) => Number(tx.excess_amount || 0) > 0);

    const { data: resolutions } = await supabase
      .from('dispute_resolutions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: auditRows } = await supabase
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: vendorRows } = await supabase
      .from('vendors')
      .select('id, store_name, email, kyc_status, tier, compliance_strikes, is_suspended, suspension_reason, suspended_at, phone_verified, is_allowlisted, completed_orders_count, successful_sales_count, disputes_count')
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: settingsRows } = await supabase
      .from('system_settings')
      .select('key, value, description, updated_at')
      .order('key', { ascending: true });

    const { data: ledgerRows } = await supabase
      .from('transaction_ledger')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const riskFlags = await listRiskFlagsAndHolds(supabase);
    const hotSettings = await getHotSettings();
    const checkoutEnabled = await isCheckoutEnabledServer();
    const payoutsEnabled = await isPayoutsEnabledServer();

    return NextResponse.json({
      success: true,
      authenticatedAdmin: auth.user?.email,
      disputes,
      heldTransactions,
      queues: {
        openDisputes,
        overdueDispatch,
        reviewHolds: heldTransactions,
        stuckSettlements,
        failedWhatsappDeliveries,
        unmatchedOrExcessDeposits: [
          ...(unmatchedDeposits || []),
          ...excessOrderRows.map((tx: any) => ({
            id: `excess_${tx.id}`,
            transaction_id: tx.id,
            amount_naira: tx.excess_amount,
            status: 'EXCESS',
            created_at: tx.updated_at,
          })),
        ],
        riskFlags,
      },
      searchMatches: searchQuery ? filteredTxs.slice(0, 30) : [],
      vendors: vendorRows || [],
      systemSettings: settingsRows || [],
      recentLedger: ledgerRows || [],
      resolutions: resolutions || [],
      riskFlags,
      recentAdminActions:
        Array.isArray(auditRows) && auditRows.length > 0 ? auditRows : getAdminAuditFallbackLogs(50),
      incidentSwitches: {
        checkout_enabled: checkoutEnabled,
        payouts_enabled: payoutsEnabled,
        vendor_allowlist_mode: Boolean(
          hotSettings.vendor_allowlist_mode === true || hotSettings.vendor_allowlist_mode === 'true'
        ),
      },
    });
  } catch (err: any) {
    console.error('Unhandled error in disputes/list route:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
