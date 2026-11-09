/**
 * Immutable Append-Only Transaction Ledger & Reconciliation Engine
 * Phase G2 Implementation
 */

import { getServiceSupabase } from './supabaseServer';
import { getAnchorAccountBalance, RELYVORA_FBO_ACCOUNT_ID } from './anchor';

export type LedgerEntryType = 
  | 'DEPOSIT_LOCKED'
  | 'PAYOUT_VENDOR'
  | 'FEE_REVENUE'
  | 'REFUND_BUYER'
  | 'SPLIT_VENDOR'
  | 'SPLIT_BUYER'
  | 'DISPUTE_FREEZE';

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
 * Append an immutable entry to the transaction ledger.
 */
export async function recordLedgerEntry(
  input: LedgerEntryInput,
  supabaseOverride?: any
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
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
      // Check if duplicate idempotency key (already logged)
      if (error.code === '23505') {
        console.log(`Ledger entry with key ${idempotencyKey} already exists. Skipping duplicate.`);
        return { success: true };
      }
      console.warn('Failed to insert ledger entry (table may not be migrated yet):', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (err: any) {
    console.error('Unhandled error recording ledger entry:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Retrieve immutable audit entries for a given transaction.
 */
export async function getTransactionLedger(transactionId: string): Promise<LedgerRecord[]> {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('transaction_ledger')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: true });

    if (error || !data) return [];
    return data as LedgerRecord[];
  } catch (err) {
    console.error('Error fetching ledger for tx:', transactionId, err);
    return [];
  }
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
  let totalEntries = 0;

  try {
    const { data, error } = await supabase
      .from('transaction_ledger')
      .select('entry_type, amount');

    if (!error && data) {
      totalEntries = data.length;
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
    }
  } catch (e) {
    console.warn('Reconciliation ledger query error:', e);
  }

  // Expected balance currently remaining inside Escrow FBO
  const expectedEscrowBalance = totalDeposited - totalPaidToVendors - totalPlatformFees - totalRefundedToBuyers;

  // Query actual Anchor balance if credentials are present
  let anchorReportedBalance: number | null = null;
  let variance: number | null = null;
  let isBalanced = true;

  try {
    const anchorData = await getAnchorAccountBalance(RELYVORA_FBO_ACCOUNT_ID);
    if (anchorData?.availableBalance !== undefined) {
      anchorReportedBalance = anchorData.availableBalance / 100; // Kobo to NGN
      variance = Math.abs(expectedEscrowBalance - anchorReportedBalance);
      isBalanced = variance < 1; // within ₦1 rounding tolerance
    }
  } catch (anchorErr) {
    console.warn('Could not query live Anchor balance during reconciliation:', anchorErr);
  }

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
