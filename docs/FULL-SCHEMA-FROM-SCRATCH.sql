-- =========================================================================
-- RELYVORA — COMPLETE PRODUCTION & STAGING SCHEMA FROM SCRATCH
-- Builds the entire Relyvora database cleanly on an EMPTY Supabase project.
-- Dependency-ordered & wrapped in BEGIN; ... COMMIT; (idempotent).
--
-- SAFETY NOTICE:
-- - Run ONLY on an empty Supabase project or a brand-new throwaway instance.
-- - For incremental upgrades on an existing populated project, use:
--   1. docs/PHASE-G1.5-RLS-v3.sql
--   2. docs/PHASE-G2.5-ADMIN-RPC-v2.sql
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- SECTION 1: EXTENSIONS & ENUM TYPES
-- -------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgcrypto') THEN
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    END IF;
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'uuid-ossp') THEN
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    END IF;
END $$;

-- Vendor KYC Status ENUM (both public.vendor_kyc_status and public.kyc_status)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'vendor_kyc_status'
    ) THEN
        CREATE TYPE public.vendor_kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'kyc_status'
    ) THEN
        CREATE TYPE public.kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected');
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- SECTION 2: TRIGGER FUNCTIONS (HARDENED SECURITY DEFINER + search_path)
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

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

-- -------------------------------------------------------------------------
-- SECTION 3: CORE TABLES (STRICT TOPOLOGICAL DEPENDENCY ORDER)
-- -------------------------------------------------------------------------

-- 3.1 Vendors
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    store_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(64) NOT NULL,
    legal_first_name VARCHAR(255),
    legal_last_name VARCHAR(255),
    date_of_birth DATE,
    gender VARCHAR(32),
    business_address TEXT,
    id_type VARCHAR(32),
    id_number VARCHAR(64),
    settlement_bank_code VARCHAR(32),
    settlement_account_number VARCHAR(32),
    settlement_account_name TEXT,
    anchor_customer_id VARCHAR(255) UNIQUE,
    anchor_deposit_account_id TEXT,
    kyc_status public.vendor_kyc_status NOT NULL DEFAULT 'pending',
    is_allowlisted BOOLEAN NOT NULL DEFAULT FALSE,
    daily_volume_ngn NUMERIC(15, 2) NOT NULL DEFAULT 0,
    daily_volume_reset_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.2 Escrow Transactions (Never stores plaintext release_code, salt, or buyer_email)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    vendor_id UUID REFERENCES public.vendors(id),
    item_name TEXT NOT NULL,
    item_price NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (item_price >= 0),
    delivery_fee NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    protection_fee NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (protection_fee >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
    amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0,
    excess_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    vendor_handle TEXT NOT NULL DEFAULT '@LagosHairPlug',
    buyer_phone TEXT,
    buyer_notes TEXT,
    buyer_whatsapp_consent BOOLEAN NOT NULL DEFAULT FALSE,
    buyer_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    buyer_phone_verified_at TIMESTAMPTZ,
    whatsapp_message_id TEXT,
    whatsapp_delivery_status TEXT NOT NULL DEFAULT 'not_sent',
    whatsapp_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
    payments_mode TEXT NOT NULL DEFAULT 'sandbox',
    payment_method TEXT,
    paid_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    releasing_at TIMESTAMPTZ,
    vendor_paid_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    disputed_at TIMESTAMPTZ,
    resolving_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    dispute_reason TEXT,
    dispute_scenario INT,
    resolution_action TEXT,
    resolution_notes TEXT,
    release_code_hash TEXT,
    failed_code_attempts INT NOT NULL DEFAULT 0,
    code_locked BOOLEAN NOT NULL DEFAULT FALSE,
    code_locked_at TIMESTAMPTZ,
    code_expires_at TIMESTAMPTZ,
    dispute_otp_hash TEXT,
    dispute_otp_expires_at TIMESTAMPTZ,
    dispute_otp_attempts INT DEFAULT 0,
    virtual_nuban_id TEXT,
    virtual_account_number TEXT,
    virtual_bank_name TEXT,
    virtual_account_name TEXT,
    anchor_deposit_id TEXT,
    anchor_transfer_id TEXT,
    anchor_revenue_transfer_id TEXT,
    anchor_vendor_transfer_id TEXT,
    anchor_fee_transfer_id TEXT,
    leg1_idempotency_key TEXT,
    leg2_idempotency_key TEXT,
    refund_transfer_id TEXT,
    payout_transfer_id TEXT,
    refund_destination_account TEXT,
    refund_destination_bank TEXT,
    refund_destination_name TEXT,
    idempotency_key TEXT UNIQUE,
    CONSTRAINT transactions_status_check CHECK (
        status IN (
            'AWAITING_PAYMENT',
            'PARTIALLY_FUNDED',
            'FUNDS_LOCKED',
            'DISPATCHED',
            'RELEASING',
            'RESOLVING',
            'VENDOR_PAID',
            'RELEASED',
            'DISPUTED',
            'REFUNDED'
        )
    ),
    CONSTRAINT transactions_whatsapp_delivery_status_check CHECK (
        whatsapp_delivery_status IN ('not_sent', 'queued', 'sent', 'delivered', 'read', 'failed')
    )
);

-- 3.3 Dedicated Buyer WhatsApp Phone Verifications Audit Record (No plaintext phone stored)
CREATE TABLE IF NOT EXISTS public.buyer_phone_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
    phone_hash TEXT NOT NULL,
    masked_phone TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT TRUE,
    verification_method TEXT NOT NULL DEFAULT 'WHATSAPP_QUICK_REPLY'
        CHECK (verification_method IN ('WHATSAPP_QUICK_REPLY', 'WHATSAPP_INBOUND')),
    whatsapp_message_id TEXT,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.4 Cumulative Deposits Tracking (Verified Sender Bank Details for AML Refunds)
CREATE TABLE IF NOT EXISTS public.deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    anchor_event_id TEXT NOT NULL UNIQUE,
    account_number TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'RECORDED'
        CHECK (status IN ('RECORDED', 'REFUND_PENDING', 'REFUNDED', 'EXCESS_DEPOSIT', 'LATE_DEPOSIT')),
    metadata JSONB DEFAULT '{}'::jsonb,
    sender_account_number TEXT,
    sender_bank_code TEXT,
    sender_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.5 Anchor Webhook Events & Replay Idempotency Ledger
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    resource_id TEXT,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    status TEXT NOT NULL DEFAULT 'PROCESSED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    error_message TEXT,
    CONSTRAINT webhook_events_status_check CHECK (
        status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED', 'UNMATCHED', 'PARTIALLY_FUNDED')
    )
);

-- 3.6 Immutable Append-Only Transaction Ledger
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.7 Dispute Resolutions Audit Log
CREATE TABLE IF NOT EXISTS public.dispute_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    scenario_id INT,
    scenario_number INT,
    scenario_name TEXT,
    action TEXT,
    resolution_action TEXT,
    buyer_refund_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    vendor_payout_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    relyvora_fee NUMERIC(15, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    resolution_notes TEXT,
    admin_email TEXT,
    resolved_by TEXT,
    override_reason TEXT,
    override_confirmed BOOLEAN DEFAULT FALSE,
    anchor_refund_transfer_id TEXT,
    anchor_payout_transfer_id TEXT,
    refund_destination_account TEXT,
    refund_destination_bank TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.8 Runtime System Settings (Kill Switches, Overrides & WhatsApp Rate Caps)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by TEXT DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.9 Admin Action Audit Log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.10 WhatsApp Opt-Out / Do-Not-Contact Registry (HMAC-hashed phone only)
CREATE TABLE IF NOT EXISTS public.whatsapp_do_not_contact (
    phone_hash TEXT PRIMARY KEY,
    masked_phone TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('NOT_ME', 'STOP_REPLY', 'MANUAL')),
    source_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.11 WhatsApp Outbound Message Audit Log (NO release codes, NO full phone numbers)
CREATE TABLE IF NOT EXISTS public.whatsapp_message_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT UNIQUE,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    vendor_handle TEXT,
    recipient_phone_hash TEXT NOT NULL,
    masked_number TEXT NOT NULL,
    template_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'blocked')),
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.12 WhatsApp Inbound Webhook Replay Protection
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
    event_key TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.13 International Expansion Waitlist
CREATE TABLE IF NOT EXISTS public.market_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    market TEXT NOT NULL CHECK (market IN ('GH', 'KE', 'ZA')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -------------------------------------------------------------------------
-- SECTION 4: TRIGGERS
-- -------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_vendors_modtime ON public.vendors;
CREATE TRIGGER update_vendors_modtime
    BEFORE UPDATE ON public.vendors
    FOR EACH ROW
    EXECUTE FUNCTION public.update_modified_column();

DROP TRIGGER IF EXISTS update_transactions_modtime ON public.transactions;
DROP TRIGGER IF EXISTS trigger_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_modtime
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_modified_column();

DROP TRIGGER IF EXISTS update_system_settings_modtime ON public.system_settings;
CREATE TRIGGER update_system_settings_modtime
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_modified_column();

DROP TRIGGER IF EXISTS update_whatsapp_message_log_modtime ON public.whatsapp_message_log;
CREATE TRIGGER update_whatsapp_message_log_modtime
    BEFORE UPDATE ON public.whatsapp_message_log
    FOR EACH ROW
    EXECUTE FUNCTION public.update_modified_column();

DROP TRIGGER IF EXISTS update_buyer_phone_verifications_modtime ON public.buyer_phone_verifications;
CREATE TRIGGER update_buyer_phone_verifications_modtime
    BEFORE UPDATE ON public.buyer_phone_verifications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_modified_column();

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
-- SECTION 5: PERFORMANCE INDEXES
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_vendors_anchor_customer ON public.vendors(anchor_customer_id);
CREATE INDEX IF NOT EXISTS idx_vendors_allowlisted ON public.vendors(is_allowlisted, kyc_status);

CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_handle ON public.transactions(vendor_handle);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_id ON public.transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_code_hash ON public.transactions(release_code_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_virtual_nuban ON public.transactions(virtual_account_number);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON public.transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_transactions_wa_msg_id ON public.transactions(whatsapp_message_id);

CREATE INDEX IF NOT EXISTS idx_buyer_phone_verifications_tx ON public.buyer_phone_verifications(transaction_id);
CREATE INDEX IF NOT EXISTS idx_buyer_phone_verifications_hash ON public.buyer_phone_verifications(phone_hash);

CREATE INDEX IF NOT EXISTS idx_deposits_transaction_id ON public.deposits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_id ON public.webhook_events(event_id);

CREATE INDEX IF NOT EXISTS idx_ledger_transaction_id ON public.transaction_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_type ON public.transaction_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.transaction_ledger(created_at);

CREATE INDEX IF NOT EXISTS idx_dispute_resolutions_tx ON public.dispute_resolutions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_dispute_resolutions_scenario ON public.dispute_resolutions(scenario_number);

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_vendor_created ON public.whatsapp_message_log(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_phone_created ON public.whatsapp_message_log(recipient_phone_hash, created_at DESC);

-- -------------------------------------------------------------------------
-- SECTION 6: INITIAL SYSTEM SETTINGS SEEDS (UNCAPPED DEFAULTS)
-- -------------------------------------------------------------------------

INSERT INTO public.system_settings (key, value, description, updated_by)
VALUES
    ('checkout_enabled', 'true'::jsonb, 'Master kill switch for checkout link creation and payments', 'system'),
    ('max_order_ngn', 'null'::jsonb, 'Optional maximum order limit in NGN (null = no cap)', 'system'),
    ('max_daily_vendor_volume_ngn', 'null'::jsonb, 'Optional per-vendor daily transaction volume ceiling in NGN (null = no cap)', 'system'),
    ('vendor_allowlist_mode', 'true'::jsonb, 'When true, only vendors with is_allowlisted = true can create links', 'system'),
    ('max_daily_vendor_whatsapp_messages', '50'::jsonb, 'Maximum outbound WhatsApp messages a single vendor can trigger per UTC day.', 'system'),
    ('max_daily_buyer_whatsapp_messages', '5'::jsonb, 'Maximum outbound WhatsApp messages sent to a single buyer phone number per UTC day.', 'system')
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------------------
-- SECTION 7: HARDENED RPC FUNCTIONS (SECURITY DEFINER + search_path)
-- -------------------------------------------------------------------------

-- 7.1 ATOMIC CODE ATTEMPT COUNTER & RELEASE PREPARATION
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
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found', 'status_code', 404);
    END IF;

    IF v_tx.status = 'DISPUTED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction is in dispute. Code verification is disabled.', 'status_code', 400);
    END IF;

    IF v_tx.status IN ('RELEASING', 'VENDOR_PAID', 'RELEASED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction is already releasing or completed.', 'status_code', 400);
    END IF;

    IF v_tx.status NOT IN ('FUNDS_LOCKED', 'DISPATCHED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid state: transaction is ' || v_tx.status, 'status_code', 400);
    END IF;

    IF v_tx.code_locked OR v_tx.failed_code_attempts >= p_max_attempts THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Transaction is locked due to too many failed attempts.',
            'is_locked', true,
            'status_code', 423
        );
    END IF;

    IF v_tx.code_expires_at IS NOT NULL AND v_now > v_tx.code_expires_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'Release code has expired. Dispute arbitration required.', 'status_code', 410);
    END IF;

    IF v_tx.anchor_deposit_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unfunded transaction: Deposit was not recorded by verified webhook.', 'status_code', 402);
    END IF;

    IF v_tx.amount_paid < v_tx.total_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds: Deposit amount is less than total amount due.', 'status_code', 402);
    END IF;

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

    v_vendor_payout_amount := v_tx.total_amount - v_tx.protection_fee;

    IF v_tx.release_code_hash = p_hmac_hash THEN
        UPDATE public.transactions
        SET
            status = 'RELEASING',
            releasing_at = v_now,
            failed_code_attempts = 0,
            updated_at = v_now
        WHERE id = p_transaction_id;

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

-- 7.2 ATOMIC MULTI-LEG RELEASE PROGRESSION
CREATE OR REPLACE FUNCTION public.rpc_finalize_release_step(
    p_transaction_id UUID,
    p_step TEXT,
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

    IF p_step = 'VENDOR_PAID' THEN
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

    ELSIF p_step = 'RELEASED' THEN
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

-- 7.3 ATOMIC WEBHOOK DEPOSIT HANDLER (Captures Verified Sender Account & Preserves Closed/Disputed Statuses)
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
    v_tx public.transactions%ROWTYPE;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_inserted_count INT;
    v_cumulative_deposited NUMERIC(15, 2);
    v_total_due NUMERIC(15, 2);
    v_excess_amount NUMERIC(15, 2) := 0;
    v_new_status TEXT;
    v_deposit_status TEXT;
    v_sender_account TEXT;
    v_sender_bank TEXT;
    v_sender_name TEXT;
BEGIN
    v_sender_account := COALESCE(
        p_payload->'attributes'->'sender'->>'accountNumber',
        p_payload->'data'->'attributes'->'sender'->>'accountNumber',
        p_payload->'attributes'->>'senderAccountNumber',
        p_payload->'data'->'attributes'->>'senderAccountNumber'
    );
    v_sender_bank := COALESCE(
        p_payload->'attributes'->'sender'->>'bankCode',
        p_payload->'data'->'attributes'->'sender'->>'bankCode',
        p_payload->'attributes'->>'senderBankCode',
        p_payload->'data'->'attributes'->>'senderBankCode'
    );
    v_sender_name := COALESCE(
        p_payload->'attributes'->'sender'->>'accountName',
        p_payload->'data'->'attributes'->'sender'->>'accountName',
        p_payload->'attributes'->>'senderName',
        p_payload->'data'->'attributes'->>'senderName'
    );

    INSERT INTO public.webhook_events (event_id, event_type, payload, status, created_at)
    VALUES (p_event_id, p_event_type, p_payload, 'RECEIVED', v_now)
    ON CONFLICT (event_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'replayed', true, 'message', 'Webhook event already processed');
    END IF;

    IF p_metadata_tx_id IS NOT NULL AND (p_account_number IS NOT NULL AND TRIM(p_account_number) <> '') THEN
        SELECT * INTO v_tx FROM public.transactions WHERE id = p_metadata_tx_id FOR UPDATE;
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
        SELECT * INTO v_tx FROM public.transactions WHERE id = p_metadata_tx_id FOR UPDATE;
    ELSIF p_account_number IS NOT NULL AND TRIM(p_account_number) <> '' THEN
        SELECT * INTO v_tx FROM public.transactions WHERE virtual_account_number = p_account_number FOR UPDATE;
    END IF;

    IF v_tx.id IS NULL THEN
        UPDATE public.webhook_events
        SET status = 'UNMATCHED',
            error_message = 'No matching transaction found for account ' || COALESCE(p_account_number, 'NULL')
        WHERE event_id = p_event_id;
        RETURN jsonb_build_object(
            'success', false,
            'status', 'UNMATCHED',
            'error', 'No transaction found for virtual account ' || COALESCE(p_account_number, 'NULL'),
            'event_id', p_event_id
        );
    END IF;

    IF v_tx.status NOT IN ('AWAITING_PAYMENT', 'PARTIALLY_FUNDED') THEN
        v_deposit_status := CASE
            WHEN v_tx.status IN ('RELEASED', 'REFUNDED') THEN 'LATE_DEPOSIT'
            ELSE 'EXCESS_DEPOSIT'
        END;

        INSERT INTO public.deposits (
            transaction_id, anchor_event_id, account_number, amount, status, metadata,
            sender_account_number, sender_bank_code, sender_name
        ) VALUES (
            v_tx.id, p_event_id, p_account_number, p_amount_naira, v_deposit_status, p_payload,
            v_sender_account, v_sender_bank, v_sender_name
        );

        UPDATE public.transactions
        SET
            amount_paid = COALESCE(amount_paid, 0) + p_amount_naira,
            excess_amount = COALESCE(excess_amount, 0) + p_amount_naira,
            updated_at = v_now
        WHERE id = v_tx.id;

        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account,
            anchor_transfer_id, idempotency_key, metadata, created_at
        ) VALUES (
            v_tx.id, v_deposit_status, p_amount_naira, 'NGN',
            'Buyer Verified Account (' || COALESCE(v_sender_account, p_account_number) || ')',
            'Relyvora Excess Escrow Vault',
            p_event_id,
            v_tx.id::text || '_' || v_deposit_status || '_' || p_event_id,
            jsonb_build_object('event_id', p_event_id, 'deposit_status', v_deposit_status, 'current_status', v_tx.status),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        UPDATE public.webhook_events SET status = 'PROCESSED', processed_at = v_now WHERE event_id = p_event_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', v_tx.status,
            'late_or_excess', true,
            'deposit_status', v_deposit_status,
            'current_status', v_tx.status,
            'transaction_id', v_tx.id,
            'amount_naira', p_amount_naira,
            'total_deposited', COALESCE(v_tx.amount_paid, 0) + p_amount_naira,
            'excess_amount', COALESCE(v_tx.excess_amount, 0) + p_amount_naira
        );
    END IF;

    INSERT INTO public.deposits (
        transaction_id, anchor_event_id, account_number, amount, status, metadata,
        sender_account_number, sender_bank_code, sender_name
    ) VALUES (
        v_tx.id, p_event_id, p_account_number, p_amount_naira, 'RECORDED', p_payload,
        v_sender_account, v_sender_bank, v_sender_name
    );

    v_cumulative_deposited := COALESCE(v_tx.amount_paid, 0) + p_amount_naira;
    v_total_due := COALESCE(v_tx.total_amount, 0);

    IF v_cumulative_deposited < v_total_due THEN
        v_new_status := 'PARTIALLY_FUNDED';
        UPDATE public.transactions
        SET
            status = v_new_status,
            amount_paid = v_cumulative_deposited,
            anchor_deposit_id = p_event_id,
            refund_destination_account = COALESCE(v_sender_account, refund_destination_account),
            refund_destination_bank = COALESCE(v_sender_bank, refund_destination_bank),
            refund_destination_name = COALESCE(v_sender_name, refund_destination_name),
            updated_at = v_now
        WHERE id = v_tx.id;

        UPDATE public.webhook_events SET status = 'PARTIALLY_FUNDED', processed_at = v_now WHERE event_id = p_event_id;

        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account,
            anchor_transfer_id, idempotency_key, metadata, created_at
        ) VALUES (
            v_tx.id, 'DEPOSIT_PARTIAL', p_amount_naira, 'NGN',
            'Buyer Verified Account (' || COALESCE(v_sender_account, p_account_number) || ')',
            'Relyvora Escrow FBO',
            p_event_id,
            v_tx.id::text || '_PARTIAL_' || p_event_id,
            jsonb_build_object('cumulative_amount', v_cumulative_deposited, 'total_due', v_total_due),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'PARTIALLY_FUNDED',
            'transaction_id', v_tx.id,
            'total_deposited', v_cumulative_deposited,
            'total_due', v_total_due
        );
    ELSE
        v_new_status := 'FUNDS_LOCKED';
        v_excess_amount := v_cumulative_deposited - v_total_due;

        UPDATE public.transactions
        SET
            status = v_new_status,
            amount_paid = v_cumulative_deposited,
            excess_amount = v_excess_amount,
            anchor_deposit_id = p_event_id,
            refund_destination_account = COALESCE(v_sender_account, refund_destination_account),
            refund_destination_bank = COALESCE(v_sender_bank, refund_destination_bank),
            refund_destination_name = COALESCE(v_sender_name, refund_destination_name),
            paid_at = COALESCE(v_tx.paid_at, v_now),
            code_expires_at = COALESCE(v_tx.code_expires_at, v_now + interval '72 hours'),
            payment_method = 'VIRTUAL_NUBAN_TRANSFER',
            updated_at = v_now
        WHERE id = v_tx.id;

        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account,
            anchor_transfer_id, idempotency_key, metadata, created_at
        ) VALUES (
            v_tx.id, 'DEPOSIT_LOCKED', p_amount_naira, 'NGN',
            'Buyer Verified Account (' || COALESCE(v_sender_account, p_account_number) || ')',
            'Relyvora Escrow Vault',
            p_event_id,
            v_tx.id::text || '_DEPOSIT_' || p_event_id,
            jsonb_build_object('event_id', p_event_id, 'cumulative_deposited', v_cumulative_deposited, 'excess_amount', v_excess_amount),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        UPDATE public.webhook_events SET status = 'PROCESSED', processed_at = v_now WHERE event_id = p_event_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'FUNDS_LOCKED',
            'transaction_id', v_tx.id,
            'amount_paid', v_cumulative_deposited,
            'total_deposited', v_cumulative_deposited,
            'excess_amount', v_excess_amount,
            'needs_code_issue', (v_tx.release_code_hash IS NULL)
        );
    END IF;
END;
$$;

-- 7.4 ATOMIC ADMIN UNLOCK RPC
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

    UPDATE public.transactions
    SET
        code_locked = FALSE,
        failed_code_attempts = 0,
        updated_at = v_now
    WHERE id = p_transaction_id;

    INSERT INTO public.admin_audit_log (admin_email, action, target_type, target_id, metadata, ip_address)
    VALUES (
        p_admin_email, 'TRANSACTION_UNLOCK', 'transaction', p_transaction_id::text,
        jsonb_build_object('reason', p_reason, 'previous_failed_attempts', v_tx.failed_code_attempts),
        p_ip_address
    );

    RETURN jsonb_build_object('success', true, 'message', 'Transaction unlocked successfully');
END;
$$;

-- 7.5 PHASE 1 DISPUTE RESOLUTION PREPARE (Server Split & Owner Rules)
CREATE OR REPLACE FUNCTION public.rpc_admin_prepare_dispute_resolution(
    p_transaction_id UUID,
    p_scenario_number INT,
    p_admin_email TEXT,
    p_resolution_notes TEXT DEFAULT NULL,
    p_override_reason TEXT DEFAULT NULL,
    p_override_confirmed BOOLEAN DEFAULT FALSE,
    p_override_buyer_refund NUMERIC DEFAULT NULL,
    p_override_vendor_payout NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx public.transactions%ROWTYPE;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_net_escrow NUMERIC(15, 2);
    v_item_price NUMERIC(15, 2);
    v_delivery_fee NUMERIC(15, 2);
    v_fee_amt NUMERIC(15, 2);
    v_buyer_amt NUMERIC(15, 2) := 0;
    v_vendor_amt NUMERIC(15, 2) := 0;
    v_scenario_name TEXT;
    v_action TEXT;
    v_has_override BOOLEAN := FALSE;
    v_refund_dest_acc TEXT;
    v_refund_dest_bank TEXT;
BEGIN
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TRANSACTION_NOT_FOUND',
            'message', 'Transaction does not exist'
        );
    END IF;

    IF v_tx.status NOT IN ('DISPUTED', 'RESOLVING') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TRANSACTION_STATUS',
            'message', 'Cannot prepare dispute resolution: status is ' || v_tx.status || ', expected DISPUTED or RESOLVING',
            'current_status', v_tx.status
        );
    END IF;

    v_net_escrow := COALESCE(v_tx.amount_paid, 0) - COALESCE(v_tx.excess_amount, 0);
    IF v_net_escrow <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ZERO_ESCROW_BALANCE',
            'message', 'Net escrow balance is zero or negative'
        );
    END IF;

    v_fee_amt := COALESCE(v_tx.protection_fee, GREATEST(ROUND(v_tx.total_amount * 0.03), 500));
    v_delivery_fee := COALESCE(v_tx.delivery_fee, 0);
    v_item_price := COALESCE(v_tx.item_price, v_net_escrow - v_fee_amt - v_delivery_fee);

    IF p_override_buyer_refund IS NOT NULL OR p_override_vendor_payout IS NOT NULL THEN
        IF p_override_reason IS NULL OR LENGTH(TRIM(p_override_reason)) < 10 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'OVERRIDE_REASON_REQUIRED',
                'message', 'An explicit documented override reason of at least 10 characters is required for custom splits'
            );
        END IF;

        IF NOT COALESCE(p_override_confirmed, FALSE) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'OVERRIDE_CONFIRMATION_REQUIRED',
                'message', 'Explicit second confirmation (override_confirmed=true) is required for custom splits'
            );
        END IF;

        v_buyer_amt := COALESCE(p_override_buyer_refund, 0);
        v_vendor_amt := COALESCE(p_override_vendor_payout, 0);
        v_fee_amt := v_net_escrow - v_buyer_amt - v_vendor_amt;
        v_has_override := TRUE;
        v_scenario_name := 'Admin Documented Override';
        v_action := 'CUSTOM_SPLIT';
    ELSE
        CASE p_scenario_number
            WHEN 1 THEN
                v_scenario_name := 'Quality Mismatch ("What I Ordered vs. What I Got")';
                v_action := 'FULL_REFUND_BUYER';
                v_buyer_amt := v_net_escrow - v_fee_amt;
                v_vendor_amt := 0;
            WHEN 2 THEN
                v_scenario_name := 'Buyer Refuses Delivery / Unreachable ("Buyer Ghosts")';
                v_action := 'SPLIT_MINUS_DELIVERY';
                v_vendor_amt := v_delivery_fee;
                v_buyer_amt := v_net_escrow - v_fee_amt - v_delivery_fee;
            WHEN 3 THEN
                v_scenario_name := 'The "Hostage" Situation (Item Taken, Code Withheld)';
                v_action := 'FULL_PAYOUT_VENDOR';
                v_buyer_amt := 0;
                v_vendor_amt := v_net_escrow - v_fee_amt;
            WHEN 4 THEN
                v_scenario_name := 'Item Damaged in Transit';
                v_action := 'FULL_REFUND_BUYER';
                v_buyer_amt := v_net_escrow - v_fee_amt;
                v_vendor_amt := 0;
            WHEN 5 THEN
                v_scenario_name := 'Partial Acceptance (Multi-Item Orders)';
                v_action := 'CUSTOM_SPLIT';
                v_vendor_amt := ROUND((v_item_price / 2.0), 2) + v_delivery_fee;
                v_buyer_amt := v_net_escrow - v_fee_amt - v_vendor_amt;
            WHEN 6 THEN
                v_scenario_name := 'Vendor Failure to Deliver ("Vendor MIA")';
                v_action := 'FULL_REFUND_BUYER';
                v_buyer_amt := v_net_escrow - v_fee_amt;
                v_vendor_amt := 0;
            WHEN 7 THEN
                v_scenario_name := 'Buyer''s Remorse at the Door';
                v_action := 'SPLIT_MINUS_DELIVERY';
                v_vendor_amt := v_delivery_fee;
                v_buyer_amt := v_net_escrow - v_fee_amt - v_delivery_fee;
            WHEN 8 THEN
                v_scenario_name := 'Lost or Stolen in Transit (Rider Absconds)';
                v_action := 'FULL_REFUND_BUYER';
                v_buyer_amt := v_net_escrow - v_fee_amt;
                v_vendor_amt := 0;
            ELSE
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'INVALID_SCENARIO_NUMBER',
                    'message', 'Scenario number must be between 1 and 8'
                );
        END CASE;
    END IF;

    IF (v_buyer_amt + v_vendor_amt + v_fee_amt) != v_net_escrow THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'SOLVENCY_CONSTRAINT_VIOLATION',
            'message', 'Settlement split does not sum exactly to net escrow: ' ||
                       'buyer (' || v_buyer_amt || ') + vendor (' || v_vendor_amt || ') + fee (' || v_fee_amt || ') != ' || v_net_escrow,
            'net_escrow', v_net_escrow,
            'total_sum', (v_buyer_amt + v_vendor_amt + v_fee_amt)
        );
    END IF;

    v_refund_dest_acc := v_tx.refund_destination_account;
    v_refund_dest_bank := v_tx.refund_destination_bank;

    IF v_buyer_amt > 0 THEN
        IF v_refund_dest_acc IS NULL OR v_refund_dest_bank IS NULL THEN
            SELECT sender_account_number, sender_bank_code INTO v_refund_dest_acc, v_refund_dest_bank
            FROM public.deposits
            WHERE transaction_id = p_transaction_id AND sender_account_number IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_refund_dest_acc IS NULL OR v_refund_dest_bank IS NULL THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'NO_VERIFIED_REFUND_DESTINATION',
                    'message', 'Cannot issue refund: No verified sender bank account was reported by Anchor on the deposit webhook. Per anti-money-laundering rules, refunds cannot be routed to unverified accounts.'
                );
            END IF;
        END IF;
    END IF;

    UPDATE public.transactions
    SET
        status = 'RESOLVING',
        resolving_at = v_now,
        dispute_scenario = p_scenario_number,
        resolution_action = v_action,
        resolution_notes = p_resolution_notes,
        refund_destination_account = v_refund_dest_acc,
        refund_destination_bank = v_refund_dest_bank,
        updated_at = v_now
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', p_transaction_id,
        'status', 'RESOLVING',
        'scenario_number', p_scenario_number,
        'scenario_name', v_scenario_name,
        'resolution_action', v_action,
        'buyer_refund_amount', v_buyer_amt,
        'vendor_payout_amount', v_vendor_amt,
        'relyvora_fee', v_fee_amt,
        'net_escrow', v_net_escrow,
        'has_override', v_has_override,
        'refund_destination_account', v_refund_dest_acc,
        'refund_destination_bank', v_refund_dest_bank,
        'existing_refund_transfer_id', v_tx.refund_transfer_id,
        'existing_payout_transfer_id', v_tx.payout_transfer_id,
        'prepared_at', v_now
    );
END;
$$;

-- 7.6 PHASE 2 DISPUTE RESOLUTION FINALIZE
CREATE OR REPLACE FUNCTION public.rpc_admin_finalize_dispute_resolution(
    p_transaction_id UUID,
    p_scenario_number INT,
    p_scenario_name TEXT,
    p_resolution_action TEXT,
    p_buyer_refund_amount NUMERIC,
    p_vendor_payout_amount NUMERIC,
    p_relyvora_fee NUMERIC,
    p_anchor_refund_transfer_id TEXT,
    p_anchor_payout_transfer_id TEXT,
    p_admin_email TEXT,
    p_resolution_notes TEXT,
    p_override_reason TEXT DEFAULT NULL,
    p_override_confirmed BOOLEAN DEFAULT FALSE,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx public.transactions%ROWTYPE;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_resolution_id UUID;
    v_final_status TEXT;
    v_buyer_amt NUMERIC := COALESCE(p_buyer_refund_amount, 0);
    v_vendor_amt NUMERIC := COALESCE(p_vendor_payout_amount, 0);
    v_fee_amt NUMERIC := COALESCE(p_relyvora_fee, 0);
BEGIN
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TRANSACTION_NOT_FOUND',
            'message', 'Transaction does not exist'
        );
    END IF;

    IF v_tx.status != 'RESOLVING' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TRANSACTION_STATUS',
            'message', 'Cannot finalize dispute: status is ' || v_tx.status || ', expected RESOLVING',
            'current_status', v_tx.status
        );
    END IF;

    IF v_vendor_amt = 0 AND v_buyer_amt > 0 THEN
        v_final_status := 'REFUNDED';
    ELSE
        v_final_status := 'RELEASED';
    END IF;

    UPDATE public.transactions
    SET
        status = v_final_status,
        resolved_at = v_now,
        resolution_action = p_resolution_action,
        resolution_notes = p_resolution_notes,
        refund_transfer_id = COALESCE(p_anchor_refund_transfer_id, v_tx.refund_transfer_id),
        payout_transfer_id = COALESCE(p_anchor_payout_transfer_id, v_tx.payout_transfer_id),
        updated_at = v_now
    WHERE id = p_transaction_id;

    INSERT INTO public.dispute_resolutions (
        transaction_id, scenario_id, scenario_number, scenario_name,
        action, resolution_action, buyer_refund_amount, vendor_payout_amount,
        relyvora_fee, admin_email, resolved_by, notes, resolution_notes,
        override_reason, override_confirmed, anchor_refund_transfer_id,
        anchor_payout_transfer_id, refund_destination_account,
        refund_destination_bank, created_at
    ) VALUES (
        p_transaction_id, p_scenario_number, p_scenario_number, p_scenario_name,
        p_resolution_action, p_resolution_action, v_buyer_amt, v_vendor_amt,
        v_fee_amt, p_admin_email, p_admin_email, p_resolution_notes, p_resolution_notes,
        p_override_reason, p_override_confirmed, p_anchor_refund_transfer_id,
        p_anchor_payout_transfer_id, v_tx.refund_destination_account,
        v_tx.refund_destination_bank, v_now
    ) RETURNING id INTO v_resolution_id;

    IF v_buyer_amt > 0 THEN
        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account,
            anchor_transfer_id, idempotency_key, metadata, created_at
        ) VALUES (
            p_transaction_id,
            CASE WHEN p_resolution_action = 'FULL_REFUND_BUYER' THEN 'REFUND_BUYER' ELSE 'SPLIT_BUYER' END,
            v_buyer_amt, 'NGN', 'Relyvora Escrow Vault',
            'Buyer Verified Account (' || COALESCE(v_tx.refund_destination_account, 'Verified Bank') || ')',
            p_anchor_refund_transfer_id,
            'ledger_dispute_buyer_' || p_transaction_id::text || '_' || v_resolution_id::text,
            jsonb_build_object(
                'scenario_number', p_scenario_number,
                'resolution_action', p_resolution_action,
                'resolution_id', v_resolution_id,
                'anchor_transfer_id', p_anchor_refund_transfer_id
            ),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    IF v_vendor_amt > 0 THEN
        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account,
            anchor_transfer_id, idempotency_key, metadata, created_at
        ) VALUES (
            p_transaction_id,
            CASE WHEN p_resolution_action = 'FULL_PAYOUT_VENDOR' THEN 'PAYOUT_VENDOR' ELSE 'SPLIT_VENDOR' END,
            v_vendor_amt, 'NGN', 'Relyvora Escrow Vault',
            'Vendor (' || v_tx.vendor_handle || ')',
            p_anchor_payout_transfer_id,
            'ledger_dispute_vendor_' || p_transaction_id::text || '_' || v_resolution_id::text,
            jsonb_build_object(
                'scenario_number', p_scenario_number,
                'resolution_action', p_resolution_action,
                'resolution_id', v_resolution_id,
                'anchor_transfer_id', p_anchor_payout_transfer_id
            ),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    IF v_fee_amt > 0 THEN
        INSERT INTO public.transaction_ledger (
            transaction_id, entry_type, amount, currency, from_account, to_account,
            idempotency_key, metadata, created_at
        ) VALUES (
            p_transaction_id, 'FEE_REVENUE', v_fee_amt, 'NGN',
            'Relyvora Escrow Vault', 'Relyvora Revenue Account',
            'ledger_dispute_fee_' || p_transaction_id::text || '_' || v_resolution_id::text,
            jsonb_build_object(
                'scenario_number', p_scenario_number,
                'resolution_id', v_resolution_id,
                'fee_protection', true
            ),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    INSERT INTO public.admin_audit_log (
        admin_email, action, target_type, target_id, ip_address, metadata, created_at
    ) VALUES (
        p_admin_email, 'DISPUTE_FINALIZE_' || p_resolution_action, 'transaction',
        p_transaction_id::text, p_ip_address,
        jsonb_build_object(
            'scenario_number', p_scenario_number,
            'scenario_name', p_scenario_name,
            'resolution_action', p_resolution_action,
            'buyer_refund_amount', v_buyer_amt,
            'vendor_payout_amount', v_vendor_amt,
            'relyvora_fee', v_fee_amt,
            'final_status', v_final_status,
            'anchor_refund_transfer_id', p_anchor_refund_transfer_id,
            'anchor_payout_transfer_id', p_anchor_payout_transfer_id,
            'override_reason', p_override_reason,
            'override_confirmed', p_override_confirmed,
            'resolution_id', v_resolution_id
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', p_transaction_id,
        'resolution_id', v_resolution_id,
        'status', v_final_status,
        'buyer_refund_amount', v_buyer_amt,
        'vendor_payout_amount', v_vendor_amt,
        'relyvora_fee', v_fee_amt,
        'resolved_by', p_admin_email,
        'finalized_at', v_now
    );
END;
$$;

-- -------------------------------------------------------------------------
-- SECTION 8: STRICT RLS, RESTRICTIVE DENY POLICIES & ZERO PUBLIC ACCESS
-- -------------------------------------------------------------------------

DO $$
DECLARE
    r RECORD;
    t TEXT;
    tables_list TEXT[] := ARRAY[
        'vendors',
        'transactions',
        'buyer_phone_verifications',
        'deposits',
        'webhook_events',
        'transaction_ledger',
        'dispute_resolutions',
        'system_settings',
        'admin_audit_log',
        'whatsapp_do_not_contact',
        'whatsapp_message_log',
        'whatsapp_webhook_events',
        'market_waitlist'
    ];
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY(tables_list)
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;

    FOREACH t IN ARRAY tables_list LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
            'Strict Restrictive Deny All on ' || t,
            t
        );
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
            EXECUTE format('GRANT ALL ON TABLE public.%I TO postgres', t);
        END IF;
    END LOOP;
END $$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;
    END IF;
END $$;

-- Explicit DEFAULT PRIVILEGES hardening for any future tables/functions
DO $$
BEGIN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role, postgres;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role, postgres;
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- SECTION 9: VERIFICATION QUERIES (EXPECTED: ZERO ROWS / ALL FALSE)
-- -------------------------------------------------------------------------

-- 9.1 Any table privileges held by anon, authenticated, or PUBLIC (Expected: 0 rows)
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

-- 9.2 Any routine privileges held by anon, authenticated, or PUBLIC (Expected: 0 rows)
SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY routine_name, grantee, privilege_type;

-- 9.3 Per-table privilege boolean matrix (Expected: ALL false for anon & authenticated)
SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
    has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
    has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
    has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
    has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
    has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
    has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
    has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 9.4 Per-function EXECUTE privilege check (Expected: ALL false for anon & authenticated)
SELECT
    p.proname AS function_name,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- 9.5 System Settings Seed Check
SELECT key, value, updated_by
FROM public.system_settings
ORDER BY key;

COMMIT;
