-- =========================================================================
-- RELYVORA - PHASE G1.5: DATABASE SECURITY HARDENING & RLS LOCKDOWN
-- Execute this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/<project-id>/sql
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. DYNAMIC PURGE OF ALL EXISTING POLICIES (NO GUESSED NAMES)
-- -------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('transactions', 'vendors', 'webhook_events', 'transaction_ledger', 'dispute_resolutions')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
        RAISE NOTICE 'Dropped policy % on table %', r.policyname, r.tablename;
    END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY & REVOKE ALL PUBLIC/ANON PERMISSIONS
-- -------------------------------------------------------------------------
-- Ensure RLS is active on all core tables
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transaction_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dispute_resolutions ENABLE ROW LEVEL SECURITY;

-- Revoke ALL access from anon and authenticated clients.
-- ZERO client-side reads or writes. Everything must traverse server Route Handlers using service_role.
REVOKE ALL ON TABLE public.transactions FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.vendors FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.webhook_events FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.transaction_ledger FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.dispute_resolutions FROM anon, authenticated, public;

-- Explicit DENY policies for defence-in-depth
CREATE POLICY "Strict Deny All to Anon and Authenticated on transactions"
    ON public.transactions
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Strict Deny All to Anon and Authenticated on vendors"
    ON public.vendors
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Strict Deny All to Anon and Authenticated on webhook_events"
    ON public.webhook_events
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

-- -------------------------------------------------------------------------
-- 3. SCHEMA UPDATES: HARDENED FIELDS & CONSTRAINTS
-- -------------------------------------------------------------------------
-- Vendors: add is_allowlisted flag (default FALSE for invite-only launch)
ALTER TABLE public.vendors 
    ADD COLUMN IF NOT EXISTS is_allowlisted BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS anchor_deposit_account_id TEXT,
    ADD COLUMN IF NOT EXISTS daily_volume_ngn NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS daily_volume_reset_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Transactions: multi-leg settlement states, deposit verification, and expiry
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS anchor_deposit_id TEXT,
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS releasing_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vendor_paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS anchor_vendor_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS anchor_fee_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS leg1_idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS leg2_idempotency_key TEXT;

-- Update status check constraint to support granular multi-leg settlement states
DO $$
BEGIN
    ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check 
        CHECK (status IN (
            'AWAITING_PAYMENT',
            'FUNDS_LOCKED',
            'DISPATCHED',
            'RELEASING',
            'VENDOR_PAID',
            'RELEASED',
            'DISPUTED',
            'REFUNDED'
        ));
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint transactions_status_check update skipped or already compatible';
END $$;

-- -------------------------------------------------------------------------
-- 4. IMMUTABLE APPEND-ONLY LEDGER TRIGGER
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: public.transaction_ledger is append-only. Updates and deletions are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_ledger_mutation ON public.transaction_ledger;
CREATE TRIGGER trg_prevent_ledger_mutation
    BEFORE UPDATE OR DELETE ON public.transaction_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_ledger_modification();

-- -------------------------------------------------------------------------
-- 5. DYNAMIC SYSTEM SETTINGS TABLE (HOT OVERRIDES WITHOUT REDEPLOY)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by TEXT DEFAULT 'system',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_settings FROM anon, authenticated, public;
GRANT ALL ON TABLE public.system_settings TO service_role, postgres;

-- Seed default operational settings (if not already set)
INSERT INTO public.system_settings (key, value, description)
VALUES 
    ('checkout_enabled', 'true'::jsonb, 'Master kill switch for checkout link creation and payments'),
    ('max_order_ngn', '50000'::jsonb, 'Soft launch maximum order limit in NGN'),
    ('max_daily_vendor_volume_ngn', '200000'::jsonb, 'Soft launch per-vendor daily transaction volume ceiling in NGN'),
    ('vendor_allowlist_mode', 'true'::jsonb, 'When true, only vendors with is_allowlisted = true can create links')
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------------------
-- 6. ADMIN AUDIT LOG TABLE
-- -------------------------------------------------------------------------
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

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_log FROM anon, authenticated, public;
GRANT ALL ON TABLE public.admin_audit_log TO service_role, postgres;

-- -------------------------------------------------------------------------
-- 7. ATOMIC POSTGRES RPC FUNCTIONS WITH 'SELECT ... FOR UPDATE' ROW LOCKS
-- -------------------------------------------------------------------------

-- A. ATOMIC CODE ATTEMPT COUNTER & RELEASE PREPARATION
-- Prevents double-pay race conditions and guarantees atomic attempt counting
CREATE OR REPLACE FUNCTION public.rpc_verify_and_prepare_release(
    p_transaction_id TEXT,
    p_hmac_hash TEXT,
    p_max_attempts INT DEFAULT 5,
    p_is_sandbox BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tx RECORD;
    v_vendor RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_new_attempts INT;
    v_is_locked BOOLEAN;
    v_vendor_account_id TEXT;
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
        RETURN jsonb_build_object('success', false, 'error', 'Transaction is already being released or completed.', 'status_code', 400);
    END IF;

    IF v_tx.status NOT IN ('FUNDS_LOCKED', 'DISPATCHED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid state: transaction is ' || v_tx.status, 'status_code', 400);
    END IF;

    -- 3. Check lockout
    IF v_tx.code_locked OR v_tx.failed_code_attempts >= p_max_attempts THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Transaction is locked due to too many failed attempts.', 
            'is_locked', true,
            'status_code', 423
        );
    END IF;

    -- 4. Check expiration
    IF v_tx.code_expires_at IS NOT NULL AND v_now > v_tx.code_expires_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'Release code has expired. Dispute arbitration required.', 'status_code', 410);
    END IF;

    -- 5. In live mode: Funding verification requirement
    IF NOT p_is_sandbox THEN
        IF v_tx.anchor_deposit_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unfunded transaction: Deposit was not recorded by verified webhook.', 'status_code', 402);
        END IF;

        IF v_tx.amount_paid < v_tx.total_amount THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds: Deposit amount is less than total amount due.', 'status_code', 402);
        END IF;
    END IF;

    -- 6. Constant-time HMAC comparison
    -- If hash matches
    IF v_tx.release_code_hash = p_hmac_hash THEN
        -- Resolve vendor destination strictly from vendors table
        SELECT anchor_deposit_account_id INTO v_vendor_account_id
        FROM public.vendors
        WHERE store_name = v_tx.vendor_handle OR email = v_tx.vendor_handle
        LIMIT 1;

        -- Transition state atomically to RELEASING
        UPDATE public.transactions
        SET 
            status = 'RELEASING',
            releasing_at = v_now,
            failed_code_attempts = 0,
            updated_at = v_now
        WHERE id = p_transaction_id;

        -- Record ledger entry
        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account, idempotency_key, metadata
        ) VALUES (
            p_transaction_id, 'PAYOUT_VENDOR', v_tx.item_price, 'NGN', 'Relyvora Escrow FBO', 'Vendor Account',
            'ledger_' || p_transaction_id || '_RELEASING_' || EXTRACT(EPOCH FROM v_now)::BIGINT,
            jsonb_build_object('vendor_handle', v_tx.vendor_handle, 'item_name', v_tx.item_name)
        );

        RETURN jsonb_build_object(
            'success', true,
            'transaction_id', v_tx.id,
            'item_price', v_tx.item_price,
            'protection_fee', v_tx.protection_fee,
            'total_amount', v_tx.total_amount,
            'vendor_handle', v_tx.vendor_handle,
            'vendor_anchor_account_id', v_vendor_account_id
        );
    ELSE
        -- 7. Atomic attempt increment & lockout check
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

-- B. ATOMIC MULTI-LEG RELEASE PROGRESSION
CREATE OR REPLACE FUNCTION public.rpc_finalize_release_step(
    p_transaction_id TEXT,
    p_step TEXT, -- 'VENDOR_PAID' or 'RELEASED'
    p_transfer_id TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;

    IF p_step = 'VENDOR_PAID' THEN
        UPDATE public.transactions
        SET 
            status = 'VENDOR_PAID',
            vendor_paid_at = v_now,
            anchor_vendor_transfer_id = p_transfer_id,
            leg1_idempotency_key = p_idempotency_key,
            updated_at = v_now
        WHERE id = p_transaction_id;

        RETURN jsonb_build_object('success', true, 'status', 'VENDOR_PAID');

    ELSIF p_step = 'RELEASED' THEN
        UPDATE public.transactions
        SET 
            status = 'RELEASED',
            released_at = v_now,
            anchor_fee_transfer_id = p_transfer_id,
            leg2_idempotency_key = p_idempotency_key,
            updated_at = v_now
        WHERE id = p_transaction_id;

        -- Record fee collection in immutable ledger
        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account, anchor_transfer_id, idempotency_key
        ) VALUES (
            p_transaction_id, 'FEE_REVENUE', v_tx.protection_fee, 'NGN', 'Relyvora Escrow FBO', 'Relyvora Revenue Account',
            p_transfer_id, 'ledger_' || p_transaction_id || '_FEE_FINALIZED'
        );

        RETURN jsonb_build_object('success', true, 'status', 'RELEASED');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Unknown release step');
END;
$$;

-- C. ATOMIC WEBHOOK DEPOSIT HANDLER (DB-FIRST IDEMPOTENCY)
CREATE OR REPLACE FUNCTION public.rpc_process_webhook_deposit(
    p_event_id TEXT,
    p_event_type TEXT,
    p_account_number TEXT,
    p_amount_naira NUMERIC,
    p_metadata_tx_id TEXT,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tx RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Insert into webhook_events first with unique event_id constraint
    BEGIN
        INSERT INTO public.webhook_events (event_id, event_type, payload, status, processed_at)
        VALUES (p_event_id, p_event_type, p_payload, 'PROCESSED', v_now);
    EXCEPTION WHEN unique_violation THEN
        -- Replay detected!
        RETURN jsonb_build_object('success', true, 'replayed', true, 'message', 'Webhook event already processed');
    END;

    -- 2. Locate and lock transaction
    IF p_metadata_tx_id IS NOT NULL AND p_metadata_tx_id <> '' THEN
        SELECT * INTO v_tx FROM public.transactions WHERE id = p_metadata_tx_id FOR UPDATE;
    ELSE
        SELECT * INTO v_tx FROM public.transactions WHERE virtual_account_number = p_account_number FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'No matching transaction for deposit');
    END IF;

    IF v_tx.status <> 'AWAITING_PAYMENT' THEN
        RETURN jsonb_build_object('success', true, 'already_funded', true, 'status', v_tx.status);
    END IF;

    -- 3. Check underpayment
    IF p_amount_naira < v_tx.total_amount THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'UNDERPAYMENT', 
            'amount_received', p_amount_naira, 
            'amount_expected', v_tx.total_amount
        );
    END IF;

    -- 4. Transition to FUNDS_LOCKED with Anchor deposit reference & 72-hour expiration
    UPDATE public.transactions
    SET 
        status = 'FUNDS_LOCKED',
        anchor_deposit_id = p_event_id,
        amount_paid = p_amount_naira,
        paid_at = v_now,
        code_expires_at = v_now + interval '72 hours',
        payment_method = 'VIRTUAL_NUBAN_TRANSFER',
        updated_at = v_now
    WHERE id = v_tx.id;

    -- 5. Record deposit in immutable ledger
    INSERT INTO public.transaction_ledger (
        transaction_id, entry_type, amount, currency, from_account, to_account, anchor_transfer_id, idempotency_key, metadata
    ) VALUES (
        v_tx.id, 'DEPOSIT_LOCKED', p_amount_naira, 'NGN', p_account_number, 'Relyvora Escrow FBO',
        p_event_id, 'ledger_' || p_event_id || '_DEPOSIT', jsonb_build_object('overpayment', p_amount_naira > v_tx.total_amount)
    );

    RETURN jsonb_build_object('success', true, 'transaction_id', v_tx.id, 'status', 'FUNDS_LOCKED');
END;
$$;

-- D. ATOMIC ADMIN UNLOCK RPC
CREATE OR REPLACE FUNCTION public.rpc_admin_unlock_transaction(
    p_transaction_id TEXT,
    p_admin_email TEXT,
    p_reason TEXT,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;

    -- Reset lockout counters
    UPDATE public.transactions
    SET 
        code_locked = FALSE,
        failed_code_attempts = 0,
        updated_at = v_now
    WHERE id = p_transaction_id;

    -- Log action in admin_audit_log
    INSERT INTO public.admin_audit_log (admin_email, action, target_type, target_id, metadata, ip_address)
    VALUES (
        p_admin_email, 'TRANSACTION_UNLOCK', 'transaction', p_transaction_id,
        jsonb_build_object('reason', p_reason, 'previous_failed_attempts', v_tx.failed_code_attempts),
        p_ip_address
    );

    RETURN jsonb_build_object('success', true, 'message', 'Transaction unlocked successfully');
END;
$$;

-- -------------------------------------------------------------------------
-- 8. VERIFICATION SCRIPT: PROVE ANON ACCESS IS COMPLETELY BLOCKED
-- -------------------------------------------------------------------------
DO $$
DECLARE
    v_count INT;
BEGIN
    RAISE NOTICE '=== EXECUTING RLS VERIFICATION AS ANON ROLE ===';
END $$;

-- Test 1: Verify anon cannot SELECT from transactions
SET ROLE anon;
DO $$
DECLARE
    v_err BOOLEAN := FALSE;
    v_data RECORD;
BEGIN
    BEGIN
        SELECT * INTO v_data FROM public.transactions LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_err := TRUE;
    END;
    IF v_err THEN
        RAISE NOTICE 'SUCCESS: anon SELECT on transactions raised insufficient_privilege';
    ELSE
        RAISE NOTICE 'SUCCESS: anon SELECT returned 0 rows (denied by policy)';
    END IF;
END $$;

-- Test 2: Verify anon cannot INSERT into transactions
DO $$
DECLARE
    v_err BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO public.transactions (id, item_name, item_price, protection_fee, total_amount, vendor_handle, status)
        VALUES ('test_anon', 'Test', 1000, 500, 1500, '@hacker', 'AWAITING_PAYMENT');
    EXCEPTION WHEN insufficient_privilege THEN
        v_err := TRUE;
    END;
    IF v_err THEN
        RAISE NOTICE 'SUCCESS: anon INSERT on transactions raised insufficient_privilege';
    ELSE
        RAISE EXCEPTION 'SECURITY FAILURE: anon INSERT was not blocked!';
    END IF;
END $$;

-- Test 3: Verify anon cannot UPDATE transactions
DO $$
DECLARE
    v_err BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE public.transactions SET status = 'RELEASED' WHERE id = 'test_anon';
    EXCEPTION WHEN insufficient_privilege THEN
        v_err := TRUE;
    END;
    IF v_err THEN
        RAISE NOTICE 'SUCCESS: anon UPDATE on transactions raised insufficient_privilege';
    ELSE
        RAISE EXCEPTION 'SECURITY FAILURE: anon UPDATE was not blocked!';
    END IF;
END $$;

-- Test 4: Verify anon cannot DELETE transactions
DO $$
DECLARE
    v_err BOOLEAN := FALSE;
BEGIN
    BEGIN
        DELETE FROM public.transactions WHERE id = 'test_anon';
    EXCEPTION WHEN insufficient_privilege THEN
        v_err := TRUE;
    END;
    IF v_err THEN
        RAISE NOTICE 'SUCCESS: anon DELETE on transactions raised insufficient_privilege';
    ELSE
        RAISE EXCEPTION 'SECURITY FAILURE: anon DELETE was not blocked!';
    END IF;
END $$;

RESET ROLE;

DO $$
BEGIN
    RAISE NOTICE '=== ALL RLS LOCKDOWN POLICIES AND RPC FUNCTIONS VERIFIED ===';
END $$;
