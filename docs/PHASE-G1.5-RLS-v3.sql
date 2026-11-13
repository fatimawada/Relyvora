-- =========================================================================
-- RELYVORA - PHASE G1.5: DATABASE SECURITY HARDENING & RLS LOCKDOWN (v3)
-- Execute this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/<project-id>/sql
--
-- FACTUAL SCHEMA FINDINGS (CONFIRMED ON LIVE DATABASE):
-- 1. transactions.id is type UUID (e.g. 'c8fdca0f-0e11-43ca-ae60-65bb046eec79').
-- 2. transactions.status is type TEXT with existing distinct values:
--    'AWAITING_PAYMENT', 'RELEASED', 'DISPUTED'.
-- 3. vendors.kyc_status uses existing Postgres ENUM public.vendor_kyc_status
--    with exact labels: 'pending', 'submitted', 'verified', 'rejected'.
-- 4. webhook_events has columns (id, event_id, event_type, resource_id, payload, processed_at)
--    and a check constraint allowing only 'PROCESSED', 'FAILED', 'IGNORED'.
--    This migration adds created_at, error_message, and updates the CHECK constraint.
--
-- DEPLOYMENT ORDER:
-- 1. STAGING: Run this script inside a staging Supabase project.
-- 2. STAGING: Run automated test suite (tests/phase-g1.5-v3.test.ts) to verify RLS denial,
--    atomic ON CONFLICT replay protection, late/excess deposit status freeze, and vendor verification.
-- 3. PRODUCTION STEP 1: Deploy application code (branch go-live-prod) which completely ignores
--    release_code and release_code_salt.
-- 4. PRODUCTION STEP 2: Execute this script in Production Supabase SQL Editor.
-- 5. PRODUCTION STEP 3: Run Section 11 verification queries in SQL Editor to confirm 0 privileges for anon/authenticated.
--
-- ROLLBACK SCRIPT (IF NEEDED):
-- ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS release_code VARCHAR(6);
-- ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS release_code_salt TEXT;
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- SECTION 1: CREATE MISSING OBJECTS & ALIGN COLUMN TYPES (UUID)
-- Must precede all REVOKE, GRANT, CREATE POLICY, and TRIGGER definitions.
-- -------------------------------------------------------------------------

-- 1.1 Append-only Transaction Ledger
CREATE TABLE IF NOT EXISTS public.transaction_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'NGN',
    from_account TEXT NOT NULL,
    to_account TEXT NOT NULL,
    anchor_transfer_id TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.2 Dispute Resolutions Table
CREATE TABLE IF NOT EXISTS public.dispute_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    scenario_id INT NOT NULL,
    action TEXT NOT NULL,
    notes TEXT,
    admin_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.3 Cumulative Deposits Tracking Table
CREATE TABLE IF NOT EXISTS public.deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    anchor_event_id TEXT NOT NULL UNIQUE,
    account_number TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'RECORDED' 
        CHECK (status IN ('RECORDED', 'REFUND_PENDING', 'REFUNDED', 'EXCESS_DEPOSIT', 'LATE_DEPOSIT')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.4 Dynamic System Settings Table (Hot overrides without redeployment)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by TEXT DEFAULT 'system',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.5 Admin Audit Log Table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -------------------------------------------------------------------------
-- SECTION 2: ALTER EXISTING TABLES (webhook_events, vendors, transactions)
-- -------------------------------------------------------------------------

-- 2.1 webhook_events: Add missing created_at and error_message columns, and update status CHECK
ALTER TABLE public.webhook_events
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Drop old check constraint on webhook_events.status and add comprehensive statuses
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.webhook_events'::regclass 
          AND contype = 'c'
    ) LOOP
        EXECUTE format('ALTER TABLE public.webhook_events DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_status_check
    CHECK (status IN (
        'RECEIVED',
        'PROCESSED',
        'FAILED',
        'IGNORED',
        'UNMATCHED',
        'PARTIALLY_FUNDED'
    ));

-- 2.2 Vendors: Add allowlist, banking destination, and daily volume tracking
-- NOTE: kyc_status already exists on public.vendors as public.vendor_kyc_status enum
-- ('pending', 'submitted', 'verified', 'rejected').
ALTER TABLE public.vendors 
    ADD COLUMN IF NOT EXISTS is_allowlisted BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS anchor_deposit_account_id TEXT,
    ADD COLUMN IF NOT EXISTS daily_volume_ngn NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS daily_volume_reset_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    ADD COLUMN IF NOT EXISTS settlement_bank_code TEXT,
    ADD COLUMN IF NOT EXISTS settlement_account_number TEXT,
    ADD COLUMN IF NOT EXISTS settlement_account_name TEXT;

-- 2.3 Transactions: Add vendor relation, delivery_fee, multi-leg settlement, deposits, excess
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id),
    ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS anchor_deposit_id TEXT,
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS excess_amount NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS releasing_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vendor_paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS anchor_vendor_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS anchor_fee_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS leg1_idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS leg2_idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS buyer_whatsapp_consent BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS buyer_phone_verified BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS buyer_phone_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_delivery_status TEXT DEFAULT 'not_sent' NOT NULL,
    ADD COLUMN IF NOT EXISTS whatsapp_blocked BOOLEAN DEFAULT FALSE NOT NULL;

ALTER TABLE public.transactions DROP COLUMN IF EXISTS buyer_email;

-- -------------------------------------------------------------------------
-- SECTION 3: STATUS CHECK CONSTRAINT (FAIL-LOUD VALIDATION)
-- Dropped and re-added cleanly without WHEN OTHERS error suppression.
-- -------------------------------------------------------------------------
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check 
    CHECK (status IN (
        'AWAITING_PAYMENT',
        'PARTIALLY_FUNDED',
        'FUNDS_LOCKED',
        'DISPATCHED',
        'RELEASING',
        'VENDOR_PAID',
        'RELEASED',
        'DISPUTED',
        'REFUNDED'
    ));

-- -------------------------------------------------------------------------
-- SECTION 4: DROP LEGACY PLAINTEXT RELEASE CODE & SALT COLUMNS
-- Defense-in-depth: Plaintext code never exists in the database.
-- -------------------------------------------------------------------------
ALTER TABLE public.transactions DROP COLUMN IF EXISTS release_code;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS release_code_salt;

-- -------------------------------------------------------------------------
-- SECTION 5: DYNAMIC PURGE OF ALL EXISTING POLICIES (NO GUESSED NAMES)
-- -------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN (
              'transactions', 
              'vendors', 
              'webhook_events', 
              'transaction_ledger', 
              'dispute_resolutions',
              'deposits',
              'system_settings',
              'admin_audit_log'
          )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
        RAISE NOTICE 'Dropped policy % on table %', r.policyname, r.tablename;
    END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- SECTION 6: ROW LEVEL SECURITY & EXPLICIT RESTRICTIVE DENY POLICIES
-- Combines SQL REVOKE ALL with CREATE POLICY ... AS RESTRICTIVE for total defense.
-- -------------------------------------------------------------------------
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Revoke ALL table permissions from anon, authenticated, and PUBLIC
REVOKE ALL ON TABLE public.transactions FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.vendors FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.webhook_events FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.transaction_ledger FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.dispute_resolutions FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.deposits FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.system_settings FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.admin_audit_log FROM anon, authenticated, public;

-- Explicit RESTRICTIVE Deny Policies: unconditionally block anon and authenticated
CREATE POLICY "Strict Restrictive Deny All on transactions"
    ON public.transactions
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Strict Restrictive Deny All on vendors"
    ON public.vendors
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Strict Restrictive Deny All on webhook_events"
    ON public.webhook_events
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Strict Restrictive Deny All on transaction_ledger"
    ON public.transaction_ledger
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Strict Restrictive Deny All on dispute_resolutions"
    ON public.dispute_resolutions
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Strict Restrictive Deny All on deposits"
    ON public.deposits
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Strict Restrictive Deny All on system_settings"
    ON public.system_settings
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Strict Restrictive Deny All on admin_audit_log"
    ON public.admin_audit_log
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

-- Grant privileges solely to service_role and postgres superuser
GRANT ALL ON TABLE public.transactions TO service_role, postgres;
GRANT ALL ON TABLE public.vendors TO service_role, postgres;
GRANT ALL ON TABLE public.webhook_events TO service_role, postgres;
GRANT ALL ON TABLE public.transaction_ledger TO service_role, postgres;
GRANT ALL ON TABLE public.dispute_resolutions TO service_role, postgres;
GRANT ALL ON TABLE public.deposits TO service_role, postgres;
GRANT ALL ON TABLE public.system_settings TO service_role, postgres;
GRANT ALL ON TABLE public.admin_audit_log TO service_role, postgres;

-- -------------------------------------------------------------------------
-- SECTION 7: IMMUTABLE APPEND-ONLY LEDGER TRIGGERS (UPDATE, DELETE & TRUNCATE)
-- -------------------------------------------------------------------------
-- STAGING CLEANUP / TEST RESET INSTRUCTIONS:
-- Because the trigger blocks TRUNCATE and DELETE, and ON DELETE CASCADE on transactions
-- cascades to transaction_ledger, deleting a transaction or resetting staging data must be done
-- by the service_role executing:
--   ALTER TABLE public.transaction_ledger DISABLE TRIGGER trg_prevent_ledger_mutation;
--   ALTER TABLE public.transaction_ledger DISABLE TRIGGER trg_prevent_ledger_truncate;
--   DELETE FROM public.transaction_ledger WHERE transaction_id = '<id>'; -- or DELETE FROM public.transactions
--   ALTER TABLE public.transaction_ledger ENABLE TRIGGER trg_prevent_ledger_mutation;
--   ALTER TABLE public.transaction_ledger ENABLE TRIGGER trg_prevent_ledger_truncate;

CREATE OR REPLACE FUNCTION public.prevent_ledger_modification()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: public.transaction_ledger is append-only. Updates, deletions, and truncations are strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ledger_mutation ON public.transaction_ledger;
CREATE TRIGGER trg_prevent_ledger_mutation
    BEFORE UPDATE OR DELETE ON public.transaction_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_ledger_modification();

DROP TRIGGER IF EXISTS trg_prevent_ledger_truncate ON public.transaction_ledger;
CREATE TRIGGER trg_prevent_ledger_truncate
    BEFORE TRUNCATE ON public.transaction_ledger
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prevent_ledger_modification();

-- -------------------------------------------------------------------------
-- SECTION 8: SEED DYNAMIC SYSTEM SETTINGS
-- -------------------------------------------------------------------------
INSERT INTO public.system_settings (key, value, description)
VALUES 
    ('checkout_enabled', 'true'::jsonb, 'Master kill switch for checkout link creation and payments'),
    ('max_order_ngn', 'null'::jsonb, 'Optional maximum order limit in NGN (null = no cap)'),
    ('max_daily_vendor_volume_ngn', 'null'::jsonb, 'Optional per-vendor daily transaction volume ceiling in NGN (null = no cap)'),
    ('vendor_allowlist_mode', 'true'::jsonb, 'When true, only vendors with is_allowlisted = true can create links'),
    ('max_daily_vendor_whatsapp_messages', '50'::jsonb, 'Maximum outbound WhatsApp messages a single vendor can trigger per UTC day'),
    ('max_daily_buyer_whatsapp_messages', '5'::jsonb, 'Maximum outbound WhatsApp messages sent to a single buyer phone number per UTC day')
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------------------
-- SECTION 9: HARDENED RPC FUNCTIONS (SECURITY DEFINER + search_path)
-- All signatures use exact types: UUID, NUMERIC(15, 2).
-- Production database behaviour never relies on caller-supplied p_is_sandbox.
-- -------------------------------------------------------------------------

-- 9.1 ATOMIC CODE ATTEMPT COUNTER & RELEASE PREPARATION
-- Reads vendor payout destination strictly from public.vendors by vendor_id (no handle fallback).
-- Computes vendor_payout_amount = total_amount - protection_fee in DB.
-- Enforces: vendor exists, is KYC 'verified', is allowlisted, and has payout account BEFORE counting attempts.
CREATE OR REPLACE FUNCTION public.rpc_verify_and_prepare_release(
    p_transaction_id UUID,
    p_hmac_hash TEXT,
    p_max_attempts INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_vendor RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_new_attempts INT;
    v_is_locked BOOLEAN;
    v_vendor_payout_amount NUMERIC(15, 2);
BEGIN
    -- 1. Acquire exclusive row lock on the transaction
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found', 'status_code', 404);
    END IF;

    -- 2. State validation
    IF v_tx.status = 'DISPUTED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction is in dispute. Code verification is disabled.', 'status_code', 400);
    END IF;

    IF v_tx.status IN ('RELEASING', 'VENDOR_PAID', 'RELEASED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction is already releasing or completed.', 'status_code', 400);
    END IF;

    IF v_tx.status NOT IN ('FUNDS_LOCKED', 'DISPATCHED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid state: transaction is ' || v_tx.status, 'status_code', 400);
    END IF;

    -- 3. Lockout enforcement
    IF v_tx.code_locked OR v_tx.failed_code_attempts >= p_max_attempts THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Transaction is locked due to too many failed attempts.', 
            'is_locked', true,
            'status_code', 423
        );
    END IF;

    -- 4. Expiration check
    IF v_tx.code_expires_at IS NOT NULL AND v_now > v_tx.code_expires_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'Release code has expired. Dispute arbitration required.', 'status_code', 410);
    END IF;

    -- 5. Unconditional live funding check
    IF v_tx.anchor_deposit_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unfunded transaction: Deposit was not recorded by verified webhook.', 'status_code', 402);
    END IF;

    IF v_tx.amount_paid < v_tx.total_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds: Deposit amount is less than total amount due.', 'status_code', 402);
    END IF;

    -- 6. STRICT VENDOR VALIDATION (MUST OCCUR BEFORE CODE VERIFICATION / ATTEMPT INCREMENTING)
    -- No handle text fallback permitted.
    IF v_tx.vendor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Transaction has no associated vendor_id. Vendor verification failed.', 
            'status_code', 422
        );
    END IF;

    SELECT * INTO v_vendor
    FROM public.vendors
    WHERE id = v_tx.vendor_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Vendor record not found for transaction vendor_id.', 
            'status_code', 422
        );
    END IF;

    IF v_vendor.kyc_status <> 'verified' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Vendor KYC verification is not verified (current: ' || COALESCE(v_vendor.kyc_status::text, 'none') || '). Payout blocked.', 
            'status_code', 422
        );
    END IF;

    IF NOT v_vendor.is_allowlisted THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Vendor is not on the active launch allowlist. Payout blocked.', 
            'status_code', 422
        );
    END IF;

    IF v_vendor.anchor_deposit_account_id IS NULL OR TRIM(v_vendor.anchor_deposit_account_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Vendor has no configured Anchor payout account ID. Payout blocked.', 
            'status_code', 422
        );
    END IF;

    -- 7. Compute vendor payout amount strictly in the database: total_amount - protection_fee
    v_vendor_payout_amount := v_tx.total_amount - v_tx.protection_fee;

    -- 8. Hash comparison against stored HMAC-SHA256 digest
    -- Note: Constant-time comparison is verified in Node application layer using crypto.timingSafeEqual
    IF v_tx.release_code_hash = p_hmac_hash THEN
        -- Transition state atomically to RELEASING
        UPDATE public.transactions
        SET 
            status = 'RELEASING',
            releasing_at = v_now,
            failed_code_attempts = 0,
            updated_at = v_now
        WHERE id = p_transaction_id;

        -- NOTE: Ledger entries are written in rpc_finalize_release_step when transfers complete, NOT here.
        RETURN jsonb_build_object(
            'success', true,
            'transaction_id', v_tx.id,
            'item_price', v_tx.item_price,
            'delivery_fee', v_tx.delivery_fee,
            'protection_fee', v_tx.protection_fee,
            'total_amount', v_tx.total_amount,
            'vendor_payout_amount', v_vendor_payout_amount,
            'vendor_id', v_vendor.id,
            'vendor_handle', v_vendor.store_name,
            'vendor_anchor_account_id', v_vendor.anchor_deposit_account_id
        );
    ELSE
        -- 9. Atomic attempt increment & lockout check ONLY if vendor checks passed but code was wrong
        v_new_attempts := v_tx.failed_code_attempts + 1;
        v_is_locked := v_new_attempts >= p_max_attempts;

        UPDATE public.transactions
        SET 
            failed_code_attempts = v_new_attempts,
            code_locked = v_is_locked,
            code_locked_at = CASE WHEN v_is_locked THEN v_now ELSE code_locked_at END,
            updated_at = v_now
        WHERE id = p_transaction_id;

        RETURN jsonb_build_object(
            'success', false,
            'error', CASE WHEN v_is_locked THEN 'Maximum verification attempts exceeded. Escrow is locked.' ELSE 'Invalid 6-digit release code.' END,
            'remaining_attempts', GREATEST(0, p_max_attempts - v_new_attempts),
            'is_locked', v_is_locked,
            'status_code', CASE WHEN v_is_locked THEN 423 ELSE 400 END
        );
    END IF;
END;
$$;

-- 9.2 ATOMIC MULTI-LEG RELEASE PROGRESSION
-- Enforces: VENDOR_PAID only from RELEASING, RELEASED only from VENDOR_PAID.
-- Reject repeated calls idempotently; deterministic ledger idempotency keys.
-- Payout amount for Leg 1 = total_amount - protection_fee.
CREATE OR REPLACE FUNCTION public.rpc_finalize_release_step(
    p_transaction_id UUID,
    p_step TEXT, -- 'VENDOR_PAID' or 'RELEASED'
    p_transfer_id TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_payout_amount NUMERIC(15, 2);
BEGIN
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found', 'status_code', 404);
    END IF;

    -- STEP 1: VENDOR_PAID transition
    IF p_step = 'VENDOR_PAID' THEN
        -- Idempotent no-op if already in VENDOR_PAID or RELEASED
        IF v_tx.status IN ('VENDOR_PAID', 'RELEASED') THEN
            RETURN jsonb_build_object('success', true, 'idempotent', true, 'status', v_tx.status);
        END IF;

        IF v_tx.status <> 'RELEASING' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid state transition: cannot move to VENDOR_PAID from ' || v_tx.status, 'status_code', 400);
        END IF;

        v_payout_amount := v_tx.total_amount - v_tx.protection_fee;

        UPDATE public.transactions
        SET 
            status = 'VENDOR_PAID',
            vendor_paid_at = v_now,
            anchor_vendor_transfer_id = p_transfer_id,
            leg1_idempotency_key = p_idempotency_key,
            updated_at = v_now
        WHERE id = p_transaction_id;

        -- Write immutable ledger entry for vendor payout (deterministic key: txid_PAYOUT_VENDOR)
        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account, anchor_transfer_id, idempotency_key, metadata
        ) VALUES (
            p_transaction_id, 'PAYOUT_VENDOR', v_payout_amount, 'NGN', 'Relyvora Escrow FBO', 'Vendor Account',
            p_transfer_id, p_transaction_id::text || '_PAYOUT_VENDOR',
            jsonb_build_object(
                'vendor_id', v_tx.vendor_id, 
                'transfer_id', p_transfer_id, 
                'item_price', v_tx.item_price,
                'delivery_fee', v_tx.delivery_fee,
                'total_vendor_share', v_payout_amount
            )
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        RETURN jsonb_build_object('success', true, 'status', 'VENDOR_PAID');

    -- STEP 2: RELEASED transition (platform fee collection)
    ELSIF p_step = 'RELEASED' THEN
        -- Idempotent no-op if already RELEASED
        IF v_tx.status = 'RELEASED' THEN
            RETURN jsonb_build_object('success', true, 'idempotent', true, 'status', 'RELEASED');
        END IF;

        IF v_tx.status <> 'VENDOR_PAID' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid state transition: cannot move to RELEASED from ' || v_tx.status || ' (must be VENDOR_PAID first)', 'status_code', 400);
        END IF;

        UPDATE public.transactions
        SET 
            status = 'RELEASED',
            released_at = v_now,
            anchor_fee_transfer_id = p_transfer_id,
            leg2_idempotency_key = p_idempotency_key,
            updated_at = v_now
        WHERE id = p_transaction_id;

        -- Write immutable ledger entry for fee collection (deterministic key: txid_FEE_REVENUE)
        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account, anchor_transfer_id, idempotency_key, metadata
        ) VALUES (
            p_transaction_id, 'FEE_REVENUE', v_tx.protection_fee, 'NGN', 'Relyvora Escrow FBO', 'Relyvora Revenue Account',
            p_transfer_id, p_transaction_id::text || '_FEE_REVENUE',
            jsonb_build_object('fee', v_tx.protection_fee, 'transfer_id', p_transfer_id)
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        RETURN jsonb_build_object('success', true, 'status', 'RELEASED');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Unknown release step: ' || COALESCE(p_step, 'NULL'), 'status_code', 400);
END;
$$;

-- 9.3 ATOMIC WEBHOOK DEPOSIT HANDLER (DB-FIRST IDEMPOTENCY & RESTRICTED STATE MACHINE)
-- Uses INSERT ... ON CONFLICT (event_id) DO NOTHING and tests ROW_COUNT.
-- Requires metadata tx id and virtual account number to match the same transaction.
-- Only transitions status if currently AWAITING_PAYMENT or PARTIALLY_FUNDED.
-- Any other status (FUNDS_LOCKED, DISPATCHED, RELEASING, VENDOR_PAID, RELEASED, DISPUTED, REFUNDED)
-- records deposit as EXCESS_DEPOSIT or LATE_DEPOSIT WITHOUT changing transaction status.
CREATE OR REPLACE FUNCTION public.rpc_process_webhook_deposit(
    p_event_id TEXT,
    p_event_type TEXT,
    p_account_number TEXT,
    p_amount_naira NUMERIC,
    p_metadata_tx_id UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_inserted_count INT;
    v_new_total NUMERIC(15, 2);
    v_excess NUMERIC(15, 2) := 0;
    v_deposit_status TEXT;
BEGIN
    -- 1. Atomic Replay Protection via INSERT ... ON CONFLICT DO NOTHING and ROW_COUNT check
    INSERT INTO public.webhook_events (event_id, event_type, payload, status, created_at)
    VALUES (p_event_id, p_event_type, p_payload, 'RECEIVED', v_now)
    ON CONFLICT (event_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    IF v_inserted_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'replayed', true, 'message', 'Webhook event already recorded');
    END IF;

    -- 2. Locate transaction with cross-validation
    IF p_metadata_tx_id IS NOT NULL AND (p_account_number IS NOT NULL AND TRIM(p_account_number) <> '') THEN
        -- Both metadata ID and account number provided: ensure they match the same row
        SELECT * INTO v_tx
        FROM public.transactions
        WHERE id = p_metadata_tx_id
        FOR UPDATE;

        IF NOT FOUND OR v_tx.virtual_account_number IS NULL OR v_tx.virtual_account_number <> p_account_number THEN
            UPDATE public.webhook_events
            SET status = 'UNMATCHED',
                error_message = 'Cross-validation mismatch: metadata transactionId (' || p_metadata_tx_id::text || ') does not match virtual account (' || p_account_number || ')'
            WHERE event_id = p_event_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'UNMATCHED',
                'error', 'Cross-validation failure: metadata transactionId and account number do not match the same transaction.',
                'event_id', p_event_id
            );
        END IF;

    ELSIF p_metadata_tx_id IS NOT NULL THEN
        SELECT * INTO v_tx
        FROM public.transactions
        WHERE id = p_metadata_tx_id
        FOR UPDATE;

    ELSIF p_account_number IS NOT NULL AND TRIM(p_account_number) <> '' THEN
        SELECT * INTO v_tx
        FROM public.transactions
        WHERE virtual_account_number = p_account_number
        FOR UPDATE;
    ELSE
        v_tx := NULL;
    END IF;

    -- If no matching transaction found: record as UNMATCHED and alert
    IF v_tx.id IS NULL THEN
        UPDATE public.webhook_events
        SET status = 'UNMATCHED',
            error_message = 'No matching transaction for account: ' || COALESCE(p_account_number, 'NULL') || ' or id: ' || COALESCE(p_metadata_tx_id::text, 'NULL')
        WHERE event_id = p_event_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'UNMATCHED',
            'error', 'No matching transaction for deposit. Recorded as UNMATCHED.',
            'event_id', p_event_id
        );
    END IF;

    -- 3. RESTRICTED STATE MACHINE:
    -- Only AWAITING_PAYMENT and PARTIALLY_FUNDED may transition status.
    -- For any other status (FUNDS_LOCKED, DISPATCHED, RELEASING, VENDOR_PAID, RELEASED, DISPUTED, REFUNDED),
    -- record deposit as EXCESS_DEPOSIT or LATE_DEPOSIT WITHOUT changing transaction status!
    IF v_tx.status NOT IN ('AWAITING_PAYMENT', 'PARTIALLY_FUNDED') THEN
        v_deposit_status := CASE 
            WHEN v_tx.status IN ('RELEASED', 'REFUNDED') THEN 'LATE_DEPOSIT' 
            ELSE 'EXCESS_DEPOSIT' 
        END;

        -- Record in deposits table
        INSERT INTO public.deposits (
            transaction_id, anchor_event_id, account_number, amount, status, metadata
        ) VALUES (
            v_tx.id, p_event_id, p_account_number, p_amount_naira, v_deposit_status, p_payload
        );

        -- Update cumulative amount_paid and excess_amount WITHOUT altering status
        UPDATE public.transactions
        SET 
            amount_paid = COALESCE(amount_paid, 0) + p_amount_naira,
            excess_amount = COALESCE(excess_amount, 0) + p_amount_naira,
            updated_at = v_now
        WHERE id = v_tx.id;

        -- Record excess in ledger
        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account, anchor_transfer_id, idempotency_key, metadata
        ) VALUES (
            v_tx.id, v_deposit_status, p_amount_naira, 'NGN', p_account_number, 'Relyvora Escrow FBO',
            p_event_id, v_tx.id::text || '_' || v_deposit_status || '_' || p_event_id,
            jsonb_build_object('tx_status', v_tx.status, 'amount_naira', p_amount_naira)
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        -- Mark webhook processed
        UPDATE public.webhook_events
        SET status = 'PROCESSED', processed_at = v_now
        WHERE event_id = p_event_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', v_tx.status,
            'late_or_excess', true,
            'deposit_status', v_deposit_status,
            'transaction_id', v_tx.id,
            'current_status', v_tx.status,
            'amount_received', p_amount_naira,
            'total_deposited', COALESCE(v_tx.amount_paid, 0) + p_amount_naira,
            'excess_amount', COALESCE(v_tx.excess_amount, 0) + p_amount_naira
        );
    END IF;

    -- 4. Normal Funding Path for AWAITING_PAYMENT or PARTIALLY_FUNDED
    INSERT INTO public.deposits (
        transaction_id, anchor_event_id, account_number, amount, status, metadata
    ) VALUES (
        v_tx.id, p_event_id, p_account_number, p_amount_naira, 'RECORDED', p_payload
    );

    v_new_total := COALESCE(v_tx.amount_paid, 0) + p_amount_naira;

    -- CASE A: Underpayment -> PARTIALLY_FUNDED
    IF v_new_total < v_tx.total_amount THEN
        UPDATE public.transactions
        SET 
            status = 'PARTIALLY_FUNDED',
            amount_paid = v_new_total,
            anchor_deposit_id = p_event_id,
            updated_at = v_now
        WHERE id = v_tx.id;

        UPDATE public.webhook_events
        SET status = 'PARTIALLY_FUNDED',
            processed_at = v_now
        WHERE event_id = p_event_id;

        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account, anchor_transfer_id, idempotency_key, metadata
        ) VALUES (
            v_tx.id, 'DEPOSIT_PARTIAL', p_amount_naira, 'NGN', p_account_number, 'Relyvora Escrow FBO',
            p_event_id, v_tx.id::text || '_PARTIAL_' || p_event_id,
            jsonb_build_object('cumulative_amount', v_new_total, 'total_due', v_tx.total_amount)
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'PARTIALLY_FUNDED',
            'transaction_id', v_tx.id,
            'amount_received', p_amount_naira,
            'total_deposited', v_new_total,
            'total_due', v_tx.total_amount
        );
    END IF;

    -- CASE B: Fully funded or Overfunded -> FUNDS_LOCKED
    IF v_new_total > v_tx.total_amount THEN
        v_excess := v_new_total - v_tx.total_amount;
    END IF;

    UPDATE public.transactions
    SET 
        status = 'FUNDS_LOCKED',
        anchor_deposit_id = p_event_id,
        amount_paid = v_new_total,
        excess_amount = v_excess,
        paid_at = COALESCE(v_tx.paid_at, v_now),
        code_expires_at = COALESCE(v_tx.code_expires_at, v_now + interval '72 hours'),
        payment_method = 'VIRTUAL_NUBAN_TRANSFER',
        updated_at = v_now
    WHERE id = v_tx.id;

    UPDATE public.webhook_events
    SET status = 'PROCESSED',
        processed_at = v_now
    WHERE event_id = p_event_id;

    INSERT INTO public.transaction_ledger (
        transaction_id, entry_type, amount, currency, from_account, to_account, anchor_transfer_id, idempotency_key, metadata
    ) VALUES (
        v_tx.id, 'DEPOSIT_LOCKED', p_amount_naira, 'NGN', p_account_number, 'Relyvora Escrow FBO',
        p_event_id, v_tx.id::text || '_DEPOSIT_' || p_event_id,
        jsonb_build_object('cumulative_amount', v_new_total, 'total_due', v_tx.total_amount, 'excess_amount', v_excess)
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'FUNDS_LOCKED',
        'transaction_id', v_tx.id,
        'amount_paid', v_new_total,
        'excess_amount', v_excess,
        'needs_code_issue', (v_tx.release_code_hash IS NULL)
    );
END;
$$;

-- 9.4 ATOMIC ADMIN UNLOCK RPC
CREATE OR REPLACE FUNCTION public.rpc_admin_unlock_transaction(
    p_transaction_id UUID,
    p_admin_email TEXT,
    p_reason TEXT,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found', 'status_code', 404);
    END IF;

    -- Reset lockout counters atomically
    UPDATE public.transactions
    SET 
        code_locked = FALSE,
        failed_code_attempts = 0,
        updated_at = v_now
    WHERE id = p_transaction_id;

    -- Record in admin_audit_log
    INSERT INTO public.admin_audit_log (admin_email, action, target_type, target_id, metadata, ip_address)
    VALUES (
        p_admin_email, 'TRANSACTION_UNLOCK', 'transaction', p_transaction_id::text,
        jsonb_build_object('reason', p_reason, 'previous_failed_attempts', v_tx.failed_code_attempts),
        p_ip_address
    );

    RETURN jsonb_build_object('success', true, 'message', 'Transaction unlocked successfully');
END;
$$;

-- -------------------------------------------------------------------------
-- SECTION 10: CRITICAL FUNCTION & TABLE ACCESS LOCKDOWN
-- Explicitly revokes EXECUTE on all public functions and alters default privileges.
-- -------------------------------------------------------------------------

-- Revoke execute from public, anon, and authenticated
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Grant execute exclusively to service_role and postgres superuser
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role, postgres;

-- Alter default privileges for FUTURE functions created in schema public
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role, postgres;

-- Alter default privileges for FUTURE tables created in schema public
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role, postgres;

-- -------------------------------------------------------------------------
-- SECTION 11: VERIFICATION QUERIES (RUN IN SQL EDITOR TO VERIFY 0 PRIVILEGES)
-- -------------------------------------------------------------------------

-- 11.1 Verify Routine Privileges (Expected: 0 rows)
SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');

-- 11.2 Verify Table Privileges (Expected: 0 rows)
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN (
      'transactions', 
      'vendors', 
      'webhook_events', 
      'transaction_ledger', 
      'dispute_resolutions',
      'deposits',
      'system_settings',
      'admin_audit_log'
  )
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');

-- 11.3 Verify Check Constraint Definition
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname IN ('transactions_status_check', 'webhook_events_status_check');

COMMIT;
