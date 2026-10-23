-- =========================================================================
-- RELYVORA - SOCIAL COMMERCE ESCROW DATABASE SCHEMA
-- Execute this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bepvqjqjybhhpsfbblqk/sql
-- =========================================================================

-- Enable pgcrypto for UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Item and Vendor Information
    item_name TEXT NOT NULL,
    item_price NUMERIC(12, 2) NOT NULL CHECK (item_price >= 0),
    protection_fee NUMERIC(12, 2) NOT NULL CHECK (protection_fee >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    vendor_handle TEXT NOT NULL DEFAULT '@LagosHairPlug',
    buyer_phone TEXT,
    buyer_notes TEXT,
    
    -- Transaction State Machine
    -- AWAITING_PAYMENT -> FUNDS_LOCKED -> DISPATCHED -> RELEASED
    -- or DISPUTED (from FUNDS_LOCKED or DISPATCHED)
    status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT' 
        CHECK (status IN ('AWAITING_PAYMENT', 'FUNDS_LOCKED', 'DISPATCHED', 'RELEASED', 'DISPUTED')),
    
    -- Secret 6-Digit Delivery Release Code (generated upon payment)
    release_code VARCHAR(6),
    
    -- Audit & Lifecycle Timestamps
    paid_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    disputed_at TIMESTAMPTZ,
    
    -- Dispute & Payment Details
    dispute_reason TEXT,
    payment_method TEXT
);

-- Auto-update updated_at on record modification
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_transactions_updated_at ON public.transactions;
CREATE TRIGGER trigger_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- We allow anonymous public read, insert, and update for the simulated demo.
-- =========================================================================

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Public can update transactions" ON public.transactions;
CREATE POLICY "Public can update transactions" 
    ON public.transactions 
    FOR UPDATE 
    USING (true);

-- Index for fast status querying and vendor metrics
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor ON public.transactions(vendor_handle);
