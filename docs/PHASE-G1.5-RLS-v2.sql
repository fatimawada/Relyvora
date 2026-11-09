-- =========================================================================
-- RELYVORA - PHASE G1.5: DATABASE SECURITY HARDENING & RLS LOCKDOWN (v2)
-- Execute this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/<project-id>/sql
--
-- FACTUAL SCHEMA FINDINGS (CONFIRMED ON LIVE DATABASE):
-- 1. transactions.id is type UUID (e.g., 'c8fdca0f-0e11-43ca-ae60-65bb046eec79').
-- 2. status column is type TEXT with existing distinct values:
--    'AWAITING_PAYMENT', 'RELEASED', 'DISPUTED'.
-- 3. All foreign keys referencing transactions.id MUST be type UUID.
-- 4. Application code has been refactored to verify codes solely via HMAC-SHA256
--    (release_code_hash). No application code queries release_code or release_code_salt.
--
-- MIGRATION ORDER:
-- 1. Deploy application code (branch go-live-prod) which ignores plaintext release_code.
-- 2. Execute this SQL script (PHASE-G1.5-RLS-v2.sql) in Supabase SQL Editor.
-- 3. Verify zero routine privileges and table grants remain for anon, authenticated, and PUBLIC.
--
-- ROLLBACK SCRIPT (IF NEEDED):
-- ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS release_code VARCHAR(6);
-- ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS release_code_salt TEXT;
-- =========================================================================

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
    status TEXT NOT NULL DEFAULT 'RECORDED', -- 'RECORDED', 'REFUND_PENDING', 'REFUNDED'
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
-- SECTION 2: ALTER EXISTING TABLES (vendors & transactions)
-- -------------------------------------------------------------------------

-- 2.1 Vendors: Add allowlist, banking destination, and daily volume tracking
ALTER TABLE public.vendors 
    ADD COLUMN IF NOT EXISTS is_allowlisted BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS anchor_deposit_account_id TEXT,
    ADD COLUMN IF NOT EXISTS daily_volume_ngn NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS daily_volume_reset_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    ADD COLUMN IF NOT EXISTS settlement_bank_code TEXT,
    ADD COLUMN IF NOT EXISTS settlement_account_number TEXT,
    ADD COLUMN IF NOT EXISTS settlement_account_name TEXT,
    ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'pending';

-- 2.2 Transactions: Add vendor relation, multi-leg settlement, deposits, excess
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id),
    ADD COLUMN IF NOT EXISTS anchor_deposit_id TEXT,
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS excess_amount NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS releasing_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vendor_paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS anchor_vendor_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS anchor_fee_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS leg1_idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS leg2_idempotency_key TEXT;

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
-- Even if a future migration grants table SELECT/INSERT/UPDATE to authenticated,
-- these RESTRICTIVE policies will cause the query to evaluate to false and fail.
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
-- SECTION 7: IMMUTABLE APPEND-ONLY LEDGER TRIGGER
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_ledger_modification()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: public.transaction_ledger is append-only. Updates and deletions are strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ledger_mutation ON public.transaction_ledger;
CREATE TRIGGER trg_prevent_ledger_mutation
    BEFORE UPDATE OR DELETE ON public.transaction_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_ledger_modification();

-- -------------------------------------------------------------------------
-- SECTION 8: SEED DYNAMIC SYSTEM SETTINGS
-- -------------------------------------------------------------------------
INSERT INTO public.system_settings (key, value, description)
VALUES 
    ('checkout_enabled', 'true'::jsonb, 'Master kill switch for checkout link creation and payments'),
    ('max_order_ngn', '50000'::jsonb, 'Soft launch maximum order limit in NGN'),
    ('max_daily_vendor_volume_ngn', '200000'::jsonb, 'Soft launch per-vendor daily transaction volume ceiling in NGN'),
    ('vendor_allowlist_mode', 'true'::jsonb, 'When true, only vendors with is_allowlisted = true can create links')
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------------------
-- SECTION 9: HARDENED RPC FUNCTIONS (SECURITY DEFINER + search_path)
-- All signatures use exact types: UUID, NUMERIC(15, 2).
-- Production database behaviour never relies on caller-supplied p_is_sandbox.
-- -------------------------------------------------------------------------

-- 9.1 ATOMIC CODE ATTEMPT COUNTER & RELEASE PREPARATION
-- Reads vendor payout destination strictly from public.vendors by vendor_id.
-- Row locked via SELECT ... FOR UPDATE. Ledger entry written on transfer, not here.
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
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_new_attempts INT;
    v_is_locked BOOLEAN;
    v_vendor_account_id TEXT;
    v_vendor_handle TEXT;
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

    -- 6. Resolve vendor payout destination strictly by vendor_id
    IF v_tx.vendor_id IS NULL THEN
        -- Fallback lookup by vendor_handle for backward-compatibility with pre-migration rows
        SELECT id, anchor_deposit_account_id, store_name INTO v_tx.vendor_id, v_vendor_account_id, v_vendor_handle
        FROM public.vendors
        WHERE store_name = v_tx.vendor_handle OR email = v_tx.vendor_handle
        LIMIT 1;
    ELSE
        SELECT anchor_deposit_account_id, store_name INTO v_vendor_account_id, v_vendor_handle
        FROM public.vendors
        WHERE id = v_tx.vendor_id;
    END IF;

    -- 7. Constant-time HMAC comparison
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
            'protection_fee', v_tx.protection_fee,
            'total_amount', v_tx.total_amount,
            'vendor_handle', COALESCE(v_vendor_handle, v_tx.vendor_handle),
            'vendor_anchor_account_id', v_vendor_account_id
        );
    ELSE
        -- 8. Atomic attempt increment & lockout check
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
            p_transaction_id, 'PAYOUT_VENDOR', v_tx.item_price, 'NGN', 'Relyvora Escrow FBO', 'Vendor Account',
            p_transfer_id, p_transaction_id::text || '_PAYOUT_VENDOR',
            jsonb_build_object('vendor_id', v_tx.vendor_id, 'transfer_id', p_transfer_id, 'vendor_handle', v_tx.vendor_handle)
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

-- 9.3 ATOMIC WEBHOOK DEPOSIT HANDLER (DB-FIRST IDEMPOTENCY & CUMULATIVE DEPOSITS)
-- Tracks cumulative deposits, handles underpayment as PARTIALLY_FUNDED,
-- handles overpayment as excess_amount, flags unmatched deposits as UNMATCHED without marking processed.
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
    v_new_total NUMERIC(15, 2);
    v_excess NUMERIC(15, 2) := 0;
BEGIN
    -- 1. Check for duplicate webhook event (replay protection)
    IF EXISTS (SELECT 1 FROM public.webhook_events WHERE event_id = p_event_id) THEN
        RETURN jsonb_build_object('success', true, 'replayed', true, 'message', 'Webhook event already recorded');
    END IF;

    -- Record receipt in webhook_events with initial status 'RECEIVED'
    INSERT INTO public.webhook_events (event_id, event_type, payload, status, created_at)
    VALUES (p_event_id, p_event_type, p_payload, 'RECEIVED', v_now);

    -- 2. Locate and lock transaction row
    IF p_metadata_tx_id IS NOT NULL THEN
        SELECT * INTO v_tx FROM public.transactions WHERE id = p_metadata_tx_id FOR UPDATE;
    ELSE
        SELECT * INTO v_tx FROM public.transactions WHERE virtual_account_number = p_account_number FOR UPDATE;
    END IF;

    -- If no matching transaction found: record as UNMATCHED and DO NOT mark processed
    IF NOT FOUND THEN
        UPDATE public.webhook_events
        SET status = 'UNMATCHED',
            error_message = 'No matching transaction for account: ' || COALESCE(p_account_number, 'NULL')
        WHERE event_id = p_event_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'UNMATCHED',
            'error', 'No matching transaction for deposit. Recorded as UNMATCHED.',
            'event_id', p_event_id
        );
    END IF;

    -- 3. Record deposit row in deposits table
    INSERT INTO public.deposits (
        transaction_id, anchor_event_id, account_number, amount, status, metadata
    ) VALUES (
        v_tx.id, p_event_id, p_account_number, p_amount_naira, 'RECORDED', p_payload
    );

    -- 4. Calculate cumulative deposits
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
WHERE conname = 'transactions_status_check';

-- 11.4 In-SQL Anonymous Role Denial Proof
SET ROLE anon;

-- Test A: anon SELECT fails
DO $$
DECLARE v_rec RECORD;
BEGIN
    SELECT * INTO v_rec FROM public.transactions LIMIT 1;
    RAISE EXCEPTION 'SECURITY FAILURE: anon SELECT was not blocked!';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'SUCCESS: anon SELECT raised insufficient_privilege';
END $$;

-- Test B: anon INSERT fails
DO $$
BEGIN
    INSERT INTO public.transactions (id, item_name, item_price, protection_fee, total_amount, vendor_handle, status)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Exploit', 1000, 500, 1500, '@hacker', 'AWAITING_PAYMENT');
    RAISE EXCEPTION 'SECURITY FAILURE: anon INSERT was not blocked!';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'SUCCESS: anon INSERT raised insufficient_privilege';
END $$;

-- Test C: anon RPC call fails
DO $$
BEGIN
    PERFORM public.rpc_admin_unlock_transaction('00000000-0000-0000-0000-000000000001'::uuid, 'hacker@test.com', 'hack');
    RAISE EXCEPTION 'SECURITY FAILURE: anon RPC was not blocked!';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'SUCCESS: anon RPC raised insufficient_privilege';
END $$;

RESET ROLE;

DO $$
BEGIN
    RAISE NOTICE '=== PHASE G1.5 v2 DATABASE SECURITY HARDENING MIGRATION COMPLETE ===';
END $$;
