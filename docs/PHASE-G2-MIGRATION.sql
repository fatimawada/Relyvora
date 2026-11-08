-- =========================================================================
-- RELYVORA - PHASE G2 DATABASE MIGRATION SCRIPT
-- Execute this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/<project-id>/sql
-- =========================================================================

-- 1. IMMUTABLE APPEND-ONLY TRANSACTION LEDGER TABLE
-- Records every financial movement (escrow deposit, payout, fee collection, refund, split)
-- for audit compliance, reporting, and daily balance reconciliation against Anchor.
CREATE TABLE IF NOT EXISTS public.transaction_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL CHECK (
        entry_type IN (
            'DEPOSIT_LOCKED',
            'PAYOUT_VENDOR',
            'FEE_REVENUE',
            'REFUND_BUYER',
            'SPLIT_VENDOR',
            'SPLIT_BUYER',
            'DISPUTE_FREEZE'
        )
    ),
    amount NUMERIC(15, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'NGN',
    from_account TEXT,
    to_account TEXT,
    anchor_transfer_id TEXT,
    idempotency_key TEXT UNIQUE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Performance & Query Indexes for Ledger
CREATE INDEX IF NOT EXISTS idx_ledger_transaction_id ON public.transaction_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_type ON public.transaction_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.transaction_ledger(created_at);

-- Row Level Security: Deny all public access (Service Role Only)
ALTER TABLE public.transaction_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny public access to transaction_ledger" ON public.transaction_ledger;
CREATE POLICY "Deny public access to transaction_ledger" 
    ON public.transaction_ledger 
    FOR ALL 
    USING (false);

-- 2. DISPUTE RESOLUTIONS & ARBITRATION AUDIT LOG TABLE
-- Stores binding arbitration actions taken across the 8 dispute scenarios.
CREATE TABLE IF NOT EXISTS public.dispute_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    scenario_number INT NOT NULL CHECK (scenario_number BETWEEN 1 AND 8),
    scenario_name TEXT NOT NULL,
    resolution_action TEXT NOT NULL CHECK (
        resolution_action IN (
            'FULL_REFUND_BUYER',
            'FULL_PAYOUT_VENDOR',
            'SPLIT_MINUS_DELIVERY',
            'CUSTOM_SPLIT'
        )
    ),
    buyer_refund_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    vendor_payout_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    relyvora_fee NUMERIC(15, 2) NOT NULL DEFAULT 0,
    resolved_by TEXT NOT NULL DEFAULT 'admin',
    resolution_notes TEXT,
    anchor_refund_transfer_id TEXT,
    anchor_vendor_transfer_id TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for Dispute Resolutions
CREATE INDEX IF NOT EXISTS idx_dispute_resolutions_tx ON public.dispute_resolutions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_dispute_resolutions_scenario ON public.dispute_resolutions(scenario_number);

-- Row Level Security: Deny public access (Service Role Only)
ALTER TABLE public.dispute_resolutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny public access to dispute_resolutions" ON public.dispute_resolutions;
CREATE POLICY "Deny public access to dispute_resolutions" 
    ON public.dispute_resolutions 
    FOR ALL 
    USING (false);

-- 3. EXTEND TRANSACTIONS TABLE WITH DISPUTE RESOLUTION STATUS
ALTER TABLE public.transactions 
    ADD COLUMN IF NOT EXISTS dispute_scenario INT,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolution_action TEXT,
    ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- Verify setup
COMMENT ON TABLE public.transaction_ledger IS 'Immutable audit ledger recording all financial movements across Relyvora Escrow.';
COMMENT ON TABLE public.dispute_resolutions IS 'Binding arbitration logs for the 8 dispute scenarios.';
