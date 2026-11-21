import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { Transaction } from './types';

// Default sandbox credentials fallback for build and demo environments
const DEFAULT_SUPABASE_URL = 'https://bepvqjqjybhhpsfbblqk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcHZxanFqeWJoaHBzZmJibHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzY2MjUsImV4cCI6MjEwODI1MjYyNX0.odSrmH_vTuWNS4RRwWhGJ7Q5ifGbk2AolWoS-P7_OXQ';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase =
  typeof window !== 'undefined'
    ? createBrowserClient(supabaseUrl, supabaseAnonKey)
    : createClient(supabaseUrl, supabaseAnonKey);

async function getBrowserAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Fetch authenticated vendor transactions via server route handler (fail-closed, no localStorage fallback).
 */
export async function getTransactions(vendorHandle?: string): Promise<{
  data: Transaction[];
  vendorStoreName?: string;
  error?: string;
}> {
  const url = vendorHandle
    ? `/api/escrow/list?vendorHandle=${encodeURIComponent(vendorHandle)}`
    : '/api/escrow/list';

  const authHeaders = await getBrowserAuthHeaders();
  const res = await fetch(url, { headers: authHeaders, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !Array.isArray(json.transactions)) {
    return { data: [], error: json.error || `Request failed (HTTP ${res.status})` };
  }
  return {
    data: json.transactions as Transaction[],
    vendorStoreName: typeof json.vendorStoreName === 'string' ? json.vendorStoreName : undefined,
  };
}

/**
 * Fetch a single transaction by ID through sanitized server route handler (no localStorage fallback).
 */
export async function getTransactionById(id: string): Promise<{
  data: Transaction | null;
  error?: string;
  status?: number;
  code?: string;
  transactionPreview?: Record<string, any> | null;
}> {
  const authHeaders = await getBrowserAuthHeaders();
  const res = await fetch(`/api/escrow/${encodeURIComponent(id)}`, {
    headers: authHeaders,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.transaction) {
    return {
      data: null,
      status: res.status,
      code: json.code,
      transactionPreview: json.transactionPreview || null,
      error: json.error || `Transaction request failed (HTTP ${res.status})`,
    };
  }
  return { data: json.transaction as Transaction };
}
