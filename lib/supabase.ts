import { createClient } from '@supabase/supabase-js';
import { Transaction } from './types';

// Default sandbox credentials fallback for build and demo environments
const DEFAULT_SUPABASE_URL = 'https://bepvqjqjybhhpsfbblqk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcHZxanFqeWJoaHBzZmJibHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzY2MjUsImV4cCI6MjEwODI1MjYyNX0.odSrmH_vTuWNS4RRwWhGJ7Q5ifGbk2AolWoS-P7_OXQ';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(
  supabaseUrl || DEFAULT_SUPABASE_URL,
  supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY
);

// Fallback in-memory / local storage key for resilience
const LOCAL_STORAGE_KEY = 'relyvora_transactions_cache';

function getLocalTransactions(): Transaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to read local cache', e);
    return [];
  }
}

function saveLocalTransaction(tx: Transaction) {
  if (typeof window === 'undefined') return;
  try {
    const list = getLocalTransactions();
    const index = list.findIndex(t => t.id === tx.id);
    if (index >= 0) {
      list[index] = tx;
    } else {
      list.unshift(tx);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to write local cache', e);
  }
}

/**
 * Fetch all transactions for a vendor, falling back to local storage if Supabase table is not yet created.
 */
export async function getTransactions(): Promise<{ data: Transaction[]; isLocalFallback?: boolean }> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetch error (schema might not be run yet):', error.message);
      return { data: getLocalTransactions(), isLocalFallback: true };
    }

    // Merge/sync into local storage for offline resilience
    if (typeof window !== 'undefined' && data) {
      const local = getLocalTransactions();
      const map = new Map<string, Transaction>();
      data.forEach((t: Transaction) => map.set(t.id, t));
      // keep any locally created items that might not have pushed
      local.forEach(t => {
        if (!map.has(t.id)) map.set(t.id, t);
      });
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
    }

    return { data: (data as Transaction[]) || [] };
  } catch (err) {
    console.error('Supabase query failed:', err);
    return { data: getLocalTransactions(), isLocalFallback: true };
  }
}

/**
 * Fetch a single transaction by ID.
 */
export async function getTransactionById(id: string): Promise<{ data: Transaction | null; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      // Check local cache
      const local = getLocalTransactions().find(t => t.id === id);
      if (local) {
        return { data: local };
      }
      return { data: null, error: error?.message || 'Transaction not found' };
    }

    return { data: data as Transaction };
  } catch (err: any) {
    const local = getLocalTransactions().find(t => t.id === id);
    if (local) return { data: local };
    return { data: null, error: err.message || 'Error fetching transaction' };
  }
}

/**
 * Create a new escrow transaction.
 */
export async function createTransaction(payload: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<{ data: Transaction | null; error?: string }> {
  const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}`;
  const now = new Date().toISOString();

  const fullTx: Transaction = {
    id: newId,
    created_at: now,
    updated_at: now,
    ...payload,
  };

  try {
    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          id: fullTx.id,
          item_name: fullTx.item_name,
          item_price: fullTx.item_price,
          protection_fee: fullTx.protection_fee,
          total_amount: fullTx.total_amount,
          vendor_handle: fullTx.vendor_handle,
          buyer_phone: fullTx.buyer_phone || null,
          buyer_notes: fullTx.buyer_notes || null,
          status: fullTx.status,
          release_code: fullTx.release_code || null,
        }
      ])
      .select()
      .single();

    if (error) {
      console.warn('Supabase insert failed, saving to local state:', error.message);
      saveLocalTransaction(fullTx);
      return { data: fullTx };
    }

    saveLocalTransaction(data as Transaction);
    return { data: data as Transaction };
  } catch (err: any) {
    console.warn('Network error on insert, saving locally:', err.message);
    saveLocalTransaction(fullTx);
    return { data: fullTx };
  }
}

/**
 * Update transaction fields (status, release_code, timestamps, etc.).
 */
export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<{ data: Transaction | null; error?: string }> {
  const now = new Date().toISOString();
  const updatePayload = {
    ...updates,
    updated_at: now,
  };

  try {
    const { data, error } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn('Supabase update failed, updating local state:', error.message);
      const list = getLocalTransactions();
      const existing = list.find(t => t.id === id);
      if (existing) {
        const merged = { ...existing, ...updatePayload };
        saveLocalTransaction(merged);
        return { data: merged };
      }
      return { data: null, error: error.message };
    }

    saveLocalTransaction(data as Transaction);
    return { data: data as Transaction };
  } catch (err: any) {
    console.warn('Network error on update, updating locally:', err.message);
    const list = getLocalTransactions();
    const existing = list.find(t => t.id === id);
    if (existing) {
      const merged = { ...existing, ...updatePayload };
      saveLocalTransaction(merged);
      return { data: merged };
    }
    return { data: null, error: err.message };
  }
}
