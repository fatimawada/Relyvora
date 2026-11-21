/**
 * Immutable Append-Only Transaction Ledger & Reconciliation Engine
 * Fail-closed implementation: DB/ledger errors alert ops and raise exceptions rather than silently skipping.
 */

import { getServiceSupabase } from './supabaseServer';
import { getAnchorAccountBalance, RELYVORA_FBO_ACCOUNT_ID } from './anchor';
import { sendSystemAlert } from './alerts';

export type LedgerEntryType =
  | 'DEPOSIT_LOCKED'
  | 'PAYOUT_VENDOR'
  | 'FEE_REVENUE'
  | 'REFUND_BUYER'
  | 'SPLIT_VENDOR'
  | 'SPLIT_BUYER'
  | 'DISPUTE_FREEZE'
  | 'RELEASE_CODE_REISSUED';

export interface LedgerEntryInput {
  transactionId: string;
  entryType: LedgerEntryType;
  amount: number;
  currency?: string;
  fromAccount?: string | null;
  toAccount?: string | null;
  anchorTransferId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, any>;
}

export interface LedgerRecord {
  id: string;
  transaction_id: string;
  entry_type: LedgerEntryType;
  amount: number;
  currency: string;
  from_account?: string | null;
  to_account?: string | null;
  anchor_transfer_id?: string | null;
  idempotency_key?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

/**
 * Append an immutable entry to the transaction ledger (fails closed on DB error).
 */
export async function recordLedgerEntry(
  input: LedgerEntryInput,
  supabaseOverride?: any
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = supabaseOverride || getServiceSupabase();
  const idempotencyKey = input.idempotencyKey || `ledger_${input.transactionId}_${input.entryType}_${Date.now()}`;

  const payload = {
    transaction_id: input.transactionId,
    entry_type: input.entryType,
    amount: Math.abs(input.amount),
    currency: input.currency || 'NGN',
    from_account: input.fromAccount || null,
    to_account: input.toAccount || null,
    anchor_transfer_id: input.anchorTransferId || null,
    idempotency_key: idempotencyKey,
    metadata: input.metadata || {},
  };

  const { data, error } = await supabase
    .from('transaction_ledger')
    .insert([payload])
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: true };
    }
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Immutable Ledger Insert Failed (Fail Closed)',
      transactionId: input.transactionId,
      details: { entryType: input.entryType, idempotencyKey, error: error.message },
    }).catch(() => {});
    throw new Error(`Failed to insert transaction_ledger entry: ${error.message}`);
  }

  return { success: true, id: data.id };
}

/**
 * Retrieve immutable audit entries for a given transaction.
 */
export async function getTransactionLedger(transactionId: string): Promise<LedgerRecord[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('transaction_ledger')
    .select('*')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true });

  if (error) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Immutable Ledger Query Failed (Fail Closed)',
      transactionId,
      details: { error: error.message },
    }).catch(() => {});
    throw new Error(`Failed fetching ledger entries: ${error.message}`);
  }
  return (data || []) as LedgerRecord[];
}

export interface ReconciliationReport {
  timestamp: string;
  totalDeposited: number;
  totalPaidToVendors: number;
  totalPlatformFees: number;
  totalRefundedToBuyers: number;
  expectedEscrowBalance: number;
  anchorReportedBalance?: number | null;
  variance?: number | null;
  isBalanced: boolean;
  totalEntries: number;
}

/**
 * Compute daily reconciliation comparing ledger audit calculations with actual Anchor balance.
 */
export async function runReconciliationReport(): Promise<ReconciliationReport> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();

  let totalDeposited = 0;
  let totalPaidToVendors = 0;
  let totalPlatformFees = 0;
  let totalRefundedToBuyers = 0;

  const { data, error } = await supabase
    .from('transaction_ledger')
    .select('entry_type, amount');

  if (error || !data) {
    await sendSystemAlert({
      type: 'SYSTEM_FAILURE',
      severity: 'CRITICAL',
      title: 'Reconciliation Ledger Query Failed (Fail Closed)',
      details: { error: error?.message || 'Empty ledger response' },
    }).catch(() => {});
    throw new Error(`Reconciliation ledger query failed: ${error?.message || 'Unknown error'}`);
  }

  const totalEntries = data.length;
  for (const row of data) {
    const amt = Number(row.amount) || 0;
    switch (row.entry_type) {
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

  const expectedEscrowBalance = totalDeposited - totalPaidToVendors - totalPlatformFees - totalRefundedToBuyers;

  const anchorData = await getAnchorAccountBalance(RELYVORA_FBO_ACCOUNT_ID);
  if (anchorData?.availableBalance === undefined) {
    throw new Error('Anchor FBO balance query returned no availableBalance (FAILED_TO_VERIFY)');
  }
  const anchorReportedBalance = anchorData.availableBalance / 100;
  const variance = Math.abs(expectedEscrowBalance - anchorReportedBalance);
  const isBalanced = variance < 1;

  return {
    timestamp: now,
    totalDeposited,
    totalPaidToVendors,
    totalPlatformFees,
    totalRefundedToBuyers,
    expectedEscrowBalance,
    anchorReportedBalance,
    variance,
    isBalanced,
    totalEntries,
  };
}
