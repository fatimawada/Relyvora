-- =========================================================================
-- RELYVORA - PHASE G1 DATABASE MIGRATION SCRIPT
-- Execute this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/<project-id>/sql
-- =========================================================================

-- 1. REVOKE PUBLIC UPDATE & DELETE PERMISSIONS (CRITICAL SECURITY FIX)
-- Prevents anonymous clients from directly modifying transaction statuses,
-- prices, or release codes. All state transitions must now run via 
-- authenticated server Route Handlers using the Service Role Key.
DROP POLICY IF EXISTS "Public can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Public can delete transactions" ON public.transactions;

-- Ensure SELECT and INSERT policies are properly scoped
DROP POLICY IF EXISTS "Public can view transactions" ON public.transactions;
CREATE POLICY "Public can view transactions" 
    ON public.transactions 
    FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Public can create transactions" ON public.transactions;
CREATE POLICY "Public can create transactions" 
    ON public.transactions 
    FOR INSERT 
    WITH CHECK (true);

-- 2. ADD SECURITY, ANCHOR & CRYPTOGRAPHIC COLUMNS TO TRANSACTIONS TABLE
ALTER TABLE public.transactions 
    ADD COLUMN IF NOT EXISTS release_code_hash TEXT,
    ADD COLUMN IF NOT EXISTS release_code_salt TEXT,
    ADD COLUMN IF NOT EXISTS failed_code_attempts INT DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS code_locked BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS code_locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS virtual_nuban_id TEXT,
    ADD COLUMN IF NOT EXISTS virtual_account_number TEXT,
    ADD COLUMN IF NOT EXISTS virtual_bank_name TEXT,
    ADD COLUMN IF NOT EXISTS virtual_account_name TEXT,
    ADD COLUMN IF NOT EXISTS anchor_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS anchor_revenue_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS payments_mode TEXT DEFAULT 'sandbox' NOT NULL;

-- 3. CREATE WEBHOOK EVENTS & IDEMPOTENCY LEDGER TABLE
-- Tracks incoming Anchor webhooks to prevent replay attacks and ensure
-- idempotent processing.
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    resource_id TEXT,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSED' CHECK (status IN ('PROCESSED', 'FAILED', 'IGNORED'))
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Deny all public access to webhook events (Service Role only)
DROP POLICY IF EXISTS "Deny public access to webhook_events" ON public.webhook_events;
CREATE POLICY "Deny public access to webhook_events"
    ON public.webhook_events
    FOR ALL
    USING (false);

-- 4. CREATE VENDORS TABLE (FOR ANCHOR CUSTOMER & KYC LINKAGE)
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID,
    store_name TEXT NOT NULL,
    legal_first_name TEXT,
    legal_last_name TEXT,
    email TEXT UNIQUE NOT NULL,
    phone_number TEXT NOT NULL,
    anchor_customer_id TEXT UNIQUE,
    anchor_deposit_account_id TEXT,
    settlement_bank_code TEXT,
    settlement_account_number TEXT,
    settlement_account_name TEXT,
    kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected', 'sandbox_provisioned')),
    is_allowlisted BOOLEAN DEFAULT TRUE NOT NULL
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- Deny public direct access to vendor banking profiles (Service Role only)
DROP POLICY IF EXISTS "Deny public access to vendors" ON public.vendors;
CREATE POLICY "Deny public access to vendors"
    ON public.vendors
    FOR ALL
    USING (false);

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_transactions_code_hash ON public.transactions(release_code_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_virtual_nuban ON public.transactions(virtual_account_number);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON public.transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_webhook_events_id ON public.webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_vendors_anchor_customer ON public.vendors(anchor_customer_id);
