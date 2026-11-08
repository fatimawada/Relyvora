import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://bepvqjqjybhhpsfbblqk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcHZxanFqeWJoaHBzZmJibHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzY2MjUsImV4cCI6MjEwODI1MjYyNX0.odSrmH_vTuWNS4RRwWhGJ7Q5ifGbk2AolWoS-P7_OXQ';

/**
 * Server-side Supabase client with Service Role privileges.
 * Bypasses RLS to securely execute state transitions, webhooks, and ledger entries.
 * STRICTLY SERVER-SIDE: Never import in client components.
 */
export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
