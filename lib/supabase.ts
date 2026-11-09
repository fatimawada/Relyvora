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
export async function getTransactions(vendorHandle?: string): Promise<{ data: Transaction[]; isLocalFallback?: boolean }> {
  try {
    // Phase G1.5 Security: Traverse server route handler with service role
    const url = vendorHandle 
      ? `/api/escrow/list?vendorHandle=${encodeURIComponent(vendorHandle)}`
      : '/api/escrow/list';

    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.transactions)) {
        return { data: json.transactions };
      }
    }

    return { data: getLocalTransactions(), isLocalFallback: true };
  } catch (err) {
    console.warn('Escrow list fetch failed, falling back to local cache:', err);
    return { data: getLocalTransactions(), isLocalFallback: true };
  }
}

/**
 * Fetch a single transaction by ID through authenticated server route handler.
 */
export async function getTransactionById(id: string): Promise<{ data: Transaction | null; error?: string }> {
  try {
    // Phase G1.5 Security: Always fetch through sanitized server route handler
    const res = await fetch(`/api/escrow/${encodeURIComponent(id)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.transaction) {
        return { data: json.transaction as Transaction };
      }
    }

    // Check local cache if server route returned 404 or network error
    const local = getLocalTransactions().find(t => t.id === id);
    if (local) {
      return { data: local };
    }
    return { data: null, error: 'Transaction not found' };
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
  try {
    // Phase G1.5 Security: Traverse authenticated server route handler
    const res = await fetch('/api/escrow/create-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemName: payload.item_name,
        itemPrice: payload.item_price,
        deliveryFee: (payload as any).delivery_fee || 0,
        vendorHandle: payload.vendor_handle,
        buyerPhone: payload.buyer_phone,
        buyerNotes: payload.buyer_notes,
      }),
    });

    const json = await res.json();
    if (json.success && json.transaction) {
      saveLocalTransaction(json.transaction as Transaction);
      return { data: json.transaction as Transaction };
    }
    return { data: null, error: json.error || 'Failed to create escrow link' };
  } catch (err: any) {
    console.warn('Network error creating transaction via server route:', err.message);
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}`;
    const now = new Date().toISOString();
    const fallbackTx: Transaction = {
      id: newId,
      created_at: now,
      updated_at: now,
      ...payload,
    };
    saveLocalTransaction(fallbackTx);
    return { data: fallbackTx };
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
