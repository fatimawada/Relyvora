/**
 * Daily Reconciliation Engine & Integrity Audit
 * Phase G2.5 Requirement 3
 * 
 * Verifies consistency across Anchor banking records, transactions table,
 * and immutable transaction ledger:
 * 
 * 1. FUNDS_LOCKED / DISPATCHED:
 *    - amount_paid >= total_amount
 *    - matching DEPOSIT_LOCKED ledger entry exists
 * 
 * 2. RELEASED:
 *    - PAYOUT_VENDOR + FEE_REVENUE ledger entries equal total_amount
 *    - Both Anchor transfer IDs are recorded
 * 
 * 3. STUCK SETTLEMENTS:
 *    - Any transaction in RELEASING or VENDOR_PAID for > 15 minutes
 *    - Flagged as STUCK_SETTLEMENT and triggers Resend alert (RECONCILIATION_MISMATCH)
 */

import { getServiceSupabase } from './supabaseServer';
import { sendSystemAlert } from './alerts';
import { getAnchorAccountBalance, RELYVORA_FBO_ACCOUNT_ID } from './anchor';

export type ReconciliationIssueType = 
  | 'MISSING_DEPOSIT_LEDGER'
  | 'UNDERPAID_ESCROW'
  | 'UNBALANCED_RELEASE_LEDGER'
  | 'MISSING_ANCHOR_TRANSFER_ID'
  | 'STUCK_SETTLEMENT';

export interface TransactionReconciliationIssue {
  transactionId: string;
  type: ReconciliationIssueType;
  severity: 'WARNING' | 'CRITICAL';
  status: string;
  vendorHandle?: string;
  message: string;
  details: Record<string, any>;
}

export interface DailyReconciliationResult {
  timestamp: string;
  totalTransactionsAudited: number;
  statusCounts: Record<string, number>;
  issuesFound: number;
  criticalCount: number;
  warningCount: number;
  issues: TransactionReconciliationIssue[];
  ledgerTotals: {
    totalDeposited: number;
    totalPaidToVendors: number;
    totalPlatformFees: number;
    totalRefundedToBuyers: number;
    expectedEscrowBalance: number;
  };
  anchorBalance?: {
    availableBalanceNaira: number;
    expectedEscrowBalance: number;
    variance: number;
    isBalanced: boolean;
  } | null;
  isClean: boolean;
}

/**
 * Runs deep reconciliation across transactions and transaction_ledger.
 */
export async function runDailyReconciliation(
  supabaseOverride?: any,
  options: { sendAlerts?: boolean } = { sendAlerts: true }
): Promise<DailyReconciliationResult> {
  const supabase = supabaseOverride || getServiceSupabase();
  const now = new Date();
  const nowIso = now.toISOString();

  const issues: TransactionReconciliationIssue[] = [];
  const statusCounts: Record<string, number> = {};

  // 1. Fetch all transactions
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('id, status, amount_paid, total_amount, item_price, protection_fee, anchor_deposit_id, created_at, updated_at, vendor_handle, payments_mode');

  if (txError || !transactions) {
    throw new Error(`Failed to query transactions for reconciliation: ${txError?.message}`);
  }

  // 2. Fetch all transaction ledger entries
  const { data: ledgerEntries, error: ledgerError } = await supabase
    .from('transaction_ledger')
    .select('id, transaction_id, entry_type, amount, anchor_transfer_id, idempotency_key, created_at');

  if (ledgerError || !ledgerEntries) {
    throw new Error(`Failed to query transaction_ledger for reconciliation: ${ledgerError?.message}`);
  }

  // Group ledger entries by transaction_id
  const ledgerMap = new Map<string, any[]>();
  let totalDeposited = 0;
  let totalPaidToVendors = 0;
  let totalPlatformFees = 0;
  let totalRefundedToBuyers = 0;

  for (const entry of ledgerEntries) {
    const list = ledgerMap.get(entry.transaction_id) || [];
    list.push(entry);
    ledgerMap.set(entry.transaction_id, list);

    const amt = Number(entry.amount) || 0;
    switch (entry.entry_type) {
      case 'DEPOSIT_LOCKED':
        totalDeposited += amt;
        break;
      case 'PAYOUT_VENDOR':
      case 'SPLIT_VENDOR':
        totalPaidToVendors += amt;
        break;
      case 'FEE_REVENUE':
        totalPlatformFees += amt;
        break;
      case 'REFUND_BUYER':
      case 'SPLIT_BUYER':
        totalRefundedToBuyers += amt;
        break;
    }
  }

  // 3. Inspect every transaction
  for (const tx of transactions) {
    const status = tx.status || 'UNKNOWN';
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const txLedger = ledgerMap.get(tx.id) || [];
    const amountPaid = Number(tx.amount_paid) || 0;
    const totalAmount = Number(tx.total_amount) || 0;

    // CHECK A: FUNDS_LOCKED or DISPATCHED
    if (status === 'FUNDS_LOCKED' || status === 'DISPATCHED') {
      // Must be fully funded
      if (amountPaid < totalAmount) {
        issues.push({
          transactionId: tx.id,
          type: 'UNDERPAID_ESCROW',
          severity: 'CRITICAL',
          status,
          vendorHandle: tx.vendor_handle,
          message: `Transaction ${tx.id} in '${status}' status has amount_paid (₦${amountPaid}) < total_amount (₦${totalAmount}).`,
          details: { amountPaid, totalAmount, deficit: totalAmount - amountPaid },
        });
      }

      // Must have matching DEPOSIT_LOCKED ledger entry
      const hasDepositLedger = txLedger.some(l => l.entry_type === 'DEPOSIT_LOCKED');
      if (!hasDepositLedger) {
        issues.push({
          transactionId: tx.id,
          type: 'MISSING_DEPOSIT_LEDGER',
          severity: 'CRITICAL',
          status,
          vendorHandle: tx.vendor_handle,
          message: `Transaction ${tx.id} in '${status}' status lacks a corresponding 'DEPOSIT_LOCKED' ledger entry.`,
          details: { amountPaid, totalAmount },
        });
      }
    }

    // CHECK B: RELEASED
    if (status === 'RELEASED') {
      const payoutEntries = txLedger.filter(l => l.entry_type === 'PAYOUT_VENDOR' || l.entry_type === 'SPLIT_VENDOR');
      const feeEntries = txLedger.filter(l => l.entry_type === 'FEE_REVENUE');

      const sumPayout = payoutEntries.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
      const sumFee = feeEntries.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
      const sumTotalSettled = sumPayout + sumFee;

      // PAYOUT_VENDOR + FEE_REVENUE ledger entries must equal total_amount (within ₦1 tolerance for rounding)
      if (Math.abs(sumTotalSettled - totalAmount) > 1) {
        issues.push({
          transactionId: tx.id,
          type: 'UNBALANCED_RELEASE_LEDGER',
          severity: 'CRITICAL',
          status,
          vendorHandle: tx.vendor_handle,
          message: `Transaction ${tx.id} in 'RELEASED' status has settled ledger entries (₦${sumTotalSettled}) != total_amount (₦${totalAmount}).`,
          details: { sumPayout, sumFee, sumTotalSettled, totalAmount, discrepancy: sumTotalSettled - totalAmount },
        });
      }

      // Both Anchor transfer IDs must be present in live payments mode
      const isLive = tx.payments_mode === 'live' || process.env.PAYMENTS_MODE === 'live';
      if (isLive) {
        const hasPayoutTransferId = payoutEntries.some(e => Boolean(e.anchor_transfer_id));
        const hasFeeTransferId = feeEntries.some(e => Boolean(e.anchor_transfer_id));
        if (!hasPayoutTransferId || !hasFeeTransferId) {
          issues.push({
            transactionId: tx.id,
            type: 'MISSING_ANCHOR_TRANSFER_ID',
            severity: 'CRITICAL',
            status,
            vendorHandle: tx.vendor_handle,
            message: `Live transaction ${tx.id} in 'RELEASED' status is missing banking Anchor transfer IDs in ledger records.`,
            details: { hasPayoutTransferId, hasFeeTransferId },
          });
        }
      }
    }

    // CHECK C: STUCK IN RELEASING OR VENDOR_PAID FOR > 15 MINUTES
    if (status === 'RELEASING' || status === 'VENDOR_PAID') {
      const updatedAtMs = new Date(tx.updated_at || tx.created_at).getTime();
      const elapsedMinutes = (now.getTime() - updatedAtMs) / (1000 * 60);

      if (elapsedMinutes > 15) {
        const stuckIssue: TransactionReconciliationIssue = {
          transactionId: tx.id,
          type: 'STUCK_SETTLEMENT',
          severity: 'CRITICAL',
          status,
          vendorHandle: tx.vendor_handle,
          message: `CRITICAL: Transaction ${tx.id} has been stuck in '${status}' state for ${Math.round(elapsedMinutes)} minutes (> 15m threshold).`,
          details: {
            status,
            updatedAt: tx.updated_at,
            elapsedMinutes: Math.round(elapsedMinutes),
            totalAmount,
            amountPaid,
          },
        };

        issues.push(stuckIssue);

        // Immediately trigger critical Resend alert
        if (options.sendAlerts) {
          sendSystemAlert({
            type: 'RECONCILIATION_MISMATCH',
            severity: 'CRITICAL',
            title: `STUCK_SETTLEMENT: Transaction stuck in ${status} for >15m`,
            transactionId: tx.id,
            vendorHandle: tx.vendor_handle,
            details: stuckIssue.details,
          }).catch(() => {});
        }
      }
    }
  }

  // 4. Anchor Account Balance Variance Check
  const expectedEscrowBalance = totalDeposited - totalPaidToVendors - totalPlatformFees - totalRefundedToBuyers;
  let anchorBalance: DailyReconciliationResult['anchorBalance'] = null;

  try {
    const anchorData = await getAnchorAccountBalance(RELYVORA_FBO_ACCOUNT_ID);
    if (anchorData?.availableBalance !== undefined) {
      const availableBalanceNaira = anchorData.availableBalance / 100;
      const variance = Math.abs(expectedEscrowBalance - availableBalanceNaira);
      anchorBalance = {
        availableBalanceNaira,
        expectedEscrowBalance,
        variance,
        isBalanced: variance < 1,
      };

      if (!anchorBalance.isBalanced && options.sendAlerts) {
        sendSystemAlert({
          type: 'RECONCILIATION_MISMATCH',
          severity: 'CRITICAL',
          title: `FBO ESCROW BALANCE MISMATCH: Variance of ₦${variance.toLocaleString()}`,
          details: {
            expectedEscrowBalance,
            actualAnchorBalance: availableBalanceNaira,
            variance,
          },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Anchor account balance check skipped (credentials or sandbox offline):', err);
  }

  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const warningCount = issues.filter(i => i.severity === 'WARNING').length;

  return {
    timestamp: nowIso,
    totalTransactionsAudited: transactions.length,
    statusCounts,
    issuesFound: issues.length,
    criticalCount,
    warningCount,
    issues,
    ledgerTotals: {
      totalDeposited,
      totalPaidToVendors,
      totalPlatformFees,
      totalRefundedToBuyers,
      expectedEscrowBalance,
    },
    anchorBalance,
    isClean: issues.length === 0 && (!anchorBalance || anchorBalance.isBalanced),
  };
}
