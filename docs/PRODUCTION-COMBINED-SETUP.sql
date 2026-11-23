-- =========================================================================
-- RELYVORA — COMPLETE PRODUCTION SUPABASE SETUP (CONSOLIDATED & ORDERED)
-- Single pasteable, dependency-ordered, idempotent script for a brand-new
-- Production Supabase SQL Editor.
--
-- CONSOLIDATES ALL SQL SCHEMA & MIGRATION FILES IN THIS REPOSITORY:
--   1. supabase/schema.sql                 (baseline transactions & updated_at trigger)
--   2. docs/PHASE-G1-MIGRATION.sql         (vendors, webhook_events, Anchor/security cols)
--   3. docs/PHASE-G2-MIGRATION.sql         (transaction_ledger, dispute_resolutions)
--   4. docs/PHASE-G1.5-RLS-v2.sql / v3.sql (deposits, system_settings, admin_audit_log,
--                                           market_waitlist, immutable ledger triggers,
--                                           FORCE RLS lockdown, PII/plaintext column drop)
--   5. docs/PHASE-G2.5-ADMIN-RPC.sql / v2  (whatsapp_* tables, buyer_phone_verifications,
--                                           atomic two-phase dispute & deposit RPCs;
--                                           supersedes v1 rpc_admin_resolve_dispute)
--   6. docs/STAGING-ADDITIONS.sql          (risk_flags, order_evidence_files,
--                                           rate_limit_buckets, tier/risk/lifecycle/retention
--                                           settings, cooling window & distributed rate-limit RPCs)
--   7. docs/FULL-SCHEMA-FROM-SCRATCH.sql   (unified from-scratch schema baseline)
--   8. Private Storage Bucket Setup        (relyvora-evidence private bucket for dispute/dispatch proof)
--   9. docs/ADMIN-SETUP-PROD.sql           (included at bottom as commented post-signup step)
--
-- HOW TO RUN:
--   1. Open Production Supabase Dashboard -> SQL Editor -> New Query.
--   2. Paste this entire file and click Run (Sections 1-9 commit atomically).
--   3. Review the Section 10 Verification Summary table returned below.
--   4. Create your admin user in Authentication -> Users, then run the
--      commented Section 11 Admin Promotion SQL (replacing <YOUR_ADMIN_EMAIL>).
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
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified_at TIMESTAMPTZ,
    phone_hash TEXT,
    legal_first_name VARCHAR(255),
    legal_last_name VARCHAR(255),
    settlement_bank_code VARCHAR(32),
    settlement_account_number VARCHAR(32),
    settlement_account_name TEXT,
    payout_account_verified BOOLEAN NOT NULL DEFAULT FALSE,
    settlement_account_name_matched BOOLEAN NOT NULL DEFAULT FALSE,
    settlement_name_match_score NUMERIC(5, 4),
    pending_settlement_bank_code VARCHAR(32),
    pending_settlement_account_number VARCHAR(32),
    pending_settlement_account_name TEXT,
    pending_settlement_requested_at TIMESTAMPTZ,
    pending_settlement_confirmed_at TIMESTAMPTZ,
    payout_hold_until TIMESTAMPTZ,
    anchor_customer_id VARCHAR(255) UNIQUE,
    anchor_deposit_account_id TEXT,
    kyc_status public.vendor_kyc_status NOT NULL DEFAULT 'pending',
    is_allowlisted BOOLEAN NOT NULL DEFAULT FALSE,
    tier TEXT NOT NULL DEFAULT 'NEW' CONSTRAINT vendors_tier_check CHECK (tier IN ('NEW', 'ESTABLISHED', 'TRUSTED')),
    successful_sales_count INT NOT NULL DEFAULT 0,
    completed_orders_count INT NOT NULL DEFAULT 0,
    disputes_count INT NOT NULL DEFAULT 0,
    first_order_at TIMESTAMPTZ,
    tier_updated_at TIMESTAMPTZ,
    cap_override_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
    cap_override_reason TEXT,
    cap_override_by TEXT,
    cap_override_at TIMESTAMPTZ,
    signup_ip_hash TEXT,
    signup_ip_expires_at TIMESTAMPTZ,
    signup_ua_hash TEXT,
    signup_device_hash TEXT,
    compliance_strikes INT NOT NULL DEFAULT 0,
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    suspended_at TIMESTAMPTZ,
    suspension_reason TEXT,
    terms_accepted_at TIMESTAMPTZ,
    terms_version TEXT,
    prohibited_items_accepted_at TIMESTAMPTZ,
    prohibited_items_version TEXT,
    signup_consent_ip_hash TEXT,
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
    item_price NUMERIC(15, 2) NOT NULL DEFAULT 0 CONSTRAINT transactions_item_price_check CHECK (item_price >= 0),
    delivery_fee NUMERIC(15, 2) NOT NULL DEFAULT 0 CONSTRAINT transactions_delivery_fee_check CHECK (delivery_fee >= 0),
    protection_fee NUMERIC(15, 2) NOT NULL DEFAULT 0 CONSTRAINT transactions_protection_fee_check CHECK (protection_fee >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CONSTRAINT transactions_total_amount_check CHECK (total_amount >= 0),
    amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0,
    excess_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    vendor_handle TEXT NOT NULL DEFAULT 'Relyvora Vendor',
    buyer_phone TEXT,
    buyer_phone_hash TEXT,
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
    code_verified_at TIMESTAMPTZ,
    payout_available_at TIMESTAMPTZ,
    cooling_window_hours INT,
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
    sender_account_number TEXT,
    sender_bank_code TEXT,
    sender_name TEXT,
    creator_ip_hash TEXT,
    creator_ip_expires_at TIMESTAMPTZ,
    creator_ua_hash TEXT,
    creator_device_hash TEXT,
    buyer_ip_hash TEXT,
    buyer_ip_expires_at TIMESTAMPTZ,
    buyer_ua_hash TEXT,
    buyer_device_hash TEXT,
    risk_score INT NOT NULL DEFAULT 0,
    risk_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    review_hold BOOLEAN NOT NULL DEFAULT FALSE,
    review_hold_reason TEXT,
    review_cleared_by TEXT,
    review_cleared_at TIMESTAMPTZ,
    review_clear_reason TEXT,
    order_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    order_block_reason TEXT,
    delivery_type TEXT NOT NULL DEFAULT 'same_city',
    delivery_window_days INT NOT NULL DEFAULT 3,
    dispatch_deadline_at TIMESTAMPTZ,
    delivery_deadline_at TIMESTAMPTZ,
    reminder_sent_at TIMESTAMPTZ,
    courier_name TEXT,
    courier_phone TEXT,
    tracking_number TEXT,
    dispatch_notes TEXT,
    dispatch_proof_count INT NOT NULL DEFAULT 0,
    handover_proof_count INT NOT NULL DEFAULT 0,
    dispute_raised_by TEXT,
    dispute_response_deadline_at TIMESTAMPTZ,
    counterparty_response_text TEXT,
    counterparty_responded_at TIMESTAMPTZ,
    refund_account_ciphertext TEXT,
    refund_account_iv TEXT,
    refund_account_auth_tag TEXT,
    refund_account_verified BOOLEAN NOT NULL DEFAULT FALSE,
    refund_account_verified_at TIMESTAMPTZ,
    refund_account_source TEXT,
    expires_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    cancellation_reason TEXT,
    virtual_account_closed BOOLEAN NOT NULL DEFAULT FALSE,
    excess_refund_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    excess_refund_transfer_id TEXT,
    buyer_terms_accepted_at TIMESTAMPTZ,
    buyer_terms_version TEXT,
    buyer_consent_ip_hash TEXT,
    whatsapp_retry_count INT NOT NULL DEFAULT 0,
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
            'REFUNDED',
            'EXPIRED',
            'CANCELLED'
        )
    ),
    CONSTRAINT transactions_whatsapp_delivery_status_check CHECK (
        whatsapp_delivery_status IN ('not_sent', 'queued', 'sent', 'delivered', 'read', 'failed')
    ),
    CONSTRAINT transactions_delivery_type_check CHECK (
        delivery_type IN ('same_city', 'interstate')
    ),
    CONSTRAINT transactions_delivery_window_days_check CHECK (
        delivery_window_days >= 1 AND delivery_window_days <= 14
    ),
    CONSTRAINT transactions_dispute_raised_by_check CHECK (
        dispute_raised_by IS NULL OR dispute_raised_by IN ('BUYER', 'VENDOR', 'ADMIN', 'SYSTEM')
    ),
    CONSTRAINT transactions_refund_account_source_check CHECK (
        refund_account_source IS NULL OR refund_account_source IN ('DEPOSIT_SENDER', 'BUYER_OTP_CONFIRMED')
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
        CONSTRAINT buyer_phone_verifications_verification_method_check CHECK (verification_method IN ('WHATSAPP_QUICK_REPLY', 'WHATSAPP_INBOUND')),
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
        CONSTRAINT deposits_status_check CHECK (status IN ('RECORDED', 'REFUND_PENDING', 'REFUNDED', 'EXCESS_DEPOSIT', 'LATE_DEPOSIT', 'LATE_AFTER_TERMINAL')),
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
    reason TEXT NOT NULL CONSTRAINT whatsapp_do_not_contact_reason_check CHECK (reason IN ('NOT_ME', 'STOP_REPLY', 'MANUAL')),
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
    status TEXT NOT NULL CONSTRAINT whatsapp_message_log_status_check CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'blocked')),
    error_code TEXT,
    retry_count INT NOT NULL DEFAULT 0,
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
    market TEXT NOT NULL CONSTRAINT market_waitlist_market_check CHECK (market IN ('GH', 'KE', 'ZA')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.14 Risk Scoring Flags & Review Holds
CREATE TABLE IF NOT EXISTS public.risk_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
    score INT NOT NULL DEFAULT 0,
    severity TEXT NOT NULL CONSTRAINT risk_flags_severity_check CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    action_taken TEXT NOT NULL CONSTRAINT risk_flags_action_taken_check CHECK (action_taken IN ('ALLOW', 'FLAG_REVIEW', 'HOLD_PAYOUT', 'BLOCK')),
    signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'OPEN' CONSTRAINT risk_flags_status_check CHECK (status IN ('OPEN', 'CLEARED', 'BLOCKED')),
    cleared_by TEXT,
    cleared_reason TEXT,
    cleared_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.15 Order Evidence & Proof of Delivery Storage Metadata (Private Bucket, Signed URL Only)
CREATE TABLE IF NOT EXISTS public.order_evidence_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    uploaded_by_role TEXT NOT NULL CONSTRAINT order_evidence_files_role_check CHECK (uploaded_by_role IN ('BUYER', 'VENDOR', 'ADMIN')),
    evidence_category TEXT NOT NULL CONSTRAINT order_evidence_files_category_check CHECK (evidence_category IN ('DISPUTE_EVIDENCE', 'DISPATCH_PROOF', 'DELIVERY_HANDOVER_PROOF')),
    scenario_id INT,
    storage_bucket TEXT NOT NULL DEFAULT 'relyvora-evidence',
    storage_object_path TEXT NOT NULL UNIQUE,
    original_filename TEXT,
    mime_type TEXT NOT NULL CONSTRAINT order_evidence_files_mime_check CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf')),
    file_size_bytes BIGINT NOT NULL CONSTRAINT order_evidence_files_size_check CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
    sha256_checksum TEXT,
    description TEXT,
    retention_delete_after TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.16 Shared Distributed Rate Limit Buckets
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
    key TEXT PRIMARY KEY,
    count INT NOT NULL DEFAULT 1 CONSTRAINT rate_limit_buckets_count_check CHECK (count >= 0),
    reset_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
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

DROP TRIGGER IF EXISTS update_risk_flags_modtime ON public.risk_flags;
CREATE TRIGGER update_risk_flags_modtime
    BEFORE UPDATE ON public.risk_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.update_modified_column();

DROP TRIGGER IF EXISTS update_rate_limit_buckets_modtime ON public.rate_limit_buckets;
CREATE TRIGGER update_rate_limit_buckets_modtime
    BEFORE UPDATE ON public.rate_limit_buckets
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
CREATE INDEX IF NOT EXISTS idx_vendors_tier ON public.vendors(tier);
CREATE INDEX IF NOT EXISTS idx_vendors_phone_hash ON public.vendors(phone_hash);

CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_handle ON public.transactions(vendor_handle);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_id ON public.transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_code_hash ON public.transactions(release_code_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_virtual_nuban ON public.transactions(virtual_account_number);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON public.transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_transactions_wa_msg_id ON public.transactions(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_transactions_review_hold ON public.transactions(review_hold, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer_phone_hash ON public.transactions(buyer_phone_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_creator_ip_hash ON public.transactions(creator_ip_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_dispatch_deadline ON public.transactions(dispatch_deadline_at);
CREATE INDEX IF NOT EXISTS idx_transactions_expires_at ON public.transactions(expires_at);

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

CREATE INDEX IF NOT EXISTS idx_risk_flags_status_created ON public.risk_flags(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_flags_tx ON public.risk_flags(transaction_id);
CREATE INDEX IF NOT EXISTS idx_risk_flags_vendor ON public.risk_flags(vendor_id);

CREATE INDEX IF NOT EXISTS idx_order_evidence_files_tx_cat ON public.order_evidence_files(transaction_id, evidence_category);
CREATE INDEX IF NOT EXISTS idx_order_evidence_files_retention ON public.order_evidence_files(retention_delete_after);
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset ON public.rate_limit_buckets(reset_at);

-- -------------------------------------------------------------------------
-- SECTION 6: INITIAL SYSTEM SETTINGS SEEDS (OPEN SIGNUP + TIERS + RISK CONFIG)
-- -------------------------------------------------------------------------

INSERT INTO public.system_settings (key, value, description, updated_by)
VALUES
    ('checkout_enabled', 'true'::jsonb, 'Master kill switch for checkout link creation and payments', 'system'),
    ('payouts_enabled', 'true'::jsonb, 'Master incident kill switch pausing all vendor payouts when false', 'system'),
    ('max_order_ngn', 'null'::jsonb, 'Optional maximum order limit in NGN (null = no cap)', 'system'),
    ('max_daily_vendor_volume_ngn', 'null'::jsonb, 'Optional per-vendor daily transaction volume ceiling in NGN (null = no cap)', 'system'),
    ('vendor_allowlist_mode', 'false'::jsonb, 'Instant kill switch: when true, only is_allowlisted vendors can create links', 'system'),
    ('max_daily_vendor_whatsapp_messages', '50'::jsonb, 'Maximum outbound WhatsApp messages a single vendor can trigger per UTC day.', 'system'),
    ('max_daily_buyer_whatsapp_messages', '5'::jsonb, 'Maximum outbound WhatsApp messages sent to a single buyer phone number per UTC day.', 'system'),
    ('tier1_order_limit_ngn', '2500000'::jsonb, 'Tier 1 (NEW vendor) per-order limit in NGN before reaching tier_upgrade_threshold', 'system'),
    ('tier_upgrade_threshold', '5'::jsonb, 'Number of successful RELEASED sales required to graduate from Tier 1 order cap to uncapped', 'system'),
    ('tier_config', '{"tiers":{"NEW":{"per_order_cap_ngn":2500000,"daily_volume_cap_ngn":5000000},"ESTABLISHED":{"per_order_cap_ngn":10000000,"daily_volume_cap_ngn":20000000},"TRUSTED":{"per_order_cap_ngn":null,"daily_volume_cap_ngn":null}},"promotion":{"established_min_completed_orders":5,"established_min_days_since_first_order":14,"established_max_disputes":0}}'::jsonb, 'Configurable vendor tier limits and automatic promotion rules', 'system'),
    ('payout_safety_config', '{"name_match_min_score":0.7,"settlement_change_wait_hours":48,"require_whatsapp_confirm_on_bank_change":true}'::jsonb, 'Name matching threshold and settlement account change waiting period', 'system'),
    ('risk_engine_config', '{"review_hold_threshold":3,"block_threshold":6,"amount_review_threshold_ngn":500000,"near_cap_ratio_min":0.85,"velocity_window_minutes":60,"velocity_max_orders":5,"repeat_pair_window_hours":24,"repeat_pair_max_orders":3,"spike_multiplier":3,"spike_min_baseline_ngn":50000,"ip_hash_retention_hours":72,"weights":{"ABOVE_REVIEW_AMOUNT":2,"HIGH_VELOCITY_VENDOR":2,"REPEATED_BUYER_VENDOR_PAIR":2,"REPEATED_NEAR_CAP_ORDER":2,"SUDDEN_AMOUNT_SPIKE":2,"SHARED_DEVICE_OR_IP":3,"MISSING_DEPOSIT_SENDER_NAME":3,"DEPOSIT_EXCEEDS_TIER_CAP":3,"SETTLEMENT_HOLD_ACTIVE":3,"SHARED_PHONE_VENDOR_BUYER":6,"SELF_DEALING_NAME_MATCH":6,"SELF_DEALING_ACCOUNT_MATCH":6}}'::jsonb, 'Configurable risk scoring thresholds, windows, retention hours, and signal weights', 'system'),
    ('cooling_window_config', '{"hours_by_tier":{"NEW":2,"ESTABLISHED":0,"TRUSTED":0},"high_value_cooling_hours":2,"notify_buyer_on_code_use":true}'::jsonb, 'Configurable payout cooling delay hours per vendor tier', 'system'),
    ('admin_safety_config', '{"session_max_age_minutes":15,"high_value_confirm_threshold_ngn":500000,"require_typed_confirmation":true,"alert_on_every_admin_action":true}'::jsonb, 'Admin session freshness, typed confirmation thresholds, and audit alerting rules', 'system'),
    ('delivery_window_config', '{"same_city_days":3,"interstate_days":7,"grace_days":3,"hard_max_days":14,"dispatch_deadline_days":3,"reminder_hours_before_expiry":24}'::jsonb, 'Configurable delivery window days, dispatch deadlines, code lifetime grace, and reminders', 'system'),
    ('dispute_policy_config', '{"timezone":"Africa/Lagos","start_hour":8,"end_hour":20,"work_days":[1,2,3,4,5,6]}'::jsonb, 'Business-hour dispute SLA clock configuration', 'system'),
    ('dispatch_proof_config', '{"require_upload":true,"require_courier_name":true,"require_courier_phone":true,"require_tracking_for_interstate":true}'::jsonb, 'Configurable mandatory proof-of-delivery requirements at dispatch', 'system'),
    ('order_lifecycle_config', '{"payment_expiry_hours":24,"stuck_settlement_minutes":15,"refund_fee_on_vendor_cancel":true}'::jsonb, 'Unpaid order expiry window, stuck transfer recovery cadence, and cancellation fee rule', 'system'),
    ('retention_and_storage_config', '{"evidence_retention_days":180,"ip_hash_retention_days":90,"whatsapp_message_log_retention_days":180,"max_image_bytes":10485760,"max_video_bytes":26214400,"signed_url_ttl_seconds":300}'::jsonb, 'NDPA data retention windows and private evidence storage limits', 'system')
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------------------
-- SECTION 7: HARDENED RPC FUNCTIONS (SECURITY DEFINER + search_path)
-- -------------------------------------------------------------------------

-- 7.1 ATOMIC CODE ATTEMPT COUNTER & RELEASE PREPARATION (WITH PAYOUT SAFETY & COOLING WINDOW)
CREATE OR REPLACE FUNCTION public.rpc_verify_and_prepare_release(
    p_transaction_id UUID,
    p_hmac_hash TEXT,
    p_max_attempts INT DEFAULT 5,
    p_cooling_hours INT DEFAULT 0
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
    v_payouts_enabled BOOLEAN := TRUE;
    v_allowlist_mode BOOLEAN := FALSE;
    v_setting JSONB;
    v_cooling INT := GREATEST(0, COALESCE(p_cooling_hours, 0));
    v_available_at TIMESTAMPTZ;
BEGIN
    SELECT value INTO v_setting FROM public.system_settings WHERE key = 'payouts_enabled';
    IF FOUND AND v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'boolean' THEN
        v_payouts_enabled := (v_setting::text)::boolean;
    END IF;
    IF NOT v_payouts_enabled THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payouts are currently paused by an operations safety switch.',
            'status_code', 503
        );
    END IF;

    SELECT value INTO v_setting FROM public.system_settings WHERE key = 'vendor_allowlist_mode';
    IF FOUND AND v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'boolean' THEN
        v_allowlist_mode := (v_setting::text)::boolean;
    END IF;

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

    IF COALESCE(v_tx.order_blocked, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', COALESCE(v_tx.order_block_reason, 'Transaction is blocked pending security investigation. Payout blocked.'),
            'status_code', 423
        );
    END IF;

    IF COALESCE(v_tx.review_hold, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', COALESCE(v_tx.review_hold_reason, 'Transaction is on manual risk review hold. Admin clearance required before payout.'),
            'status_code', 423
        );
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
        RETURN jsonb_build_object('success', false, 'error', 'Release code has expired while funds stay safely held. Buyer can request a fresh code via the resend flow.', 'status_code', 410);
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
    WHERE id = v_tx.vendor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Vendor record not found for transaction vendor_id.',
            'status_code', 422
        );
    END IF;

    IF COALESCE(v_vendor.is_suspended, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Vendor account is suspended pending compliance review. Payout blocked.',
            'status_code', 423
        );
    END IF;

    IF v_vendor.kyc_status <> 'verified' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Vendor KYC verification is not verified (current: ' || COALESCE(v_vendor.kyc_status::text, 'none') || '). Payout blocked.',
            'status_code', 422
        );
    END IF;

    IF v_allowlist_mode AND NOT COALESCE(v_vendor.is_allowlisted, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Vendor is not on the active launch allowlist. Payout blocked.',
            'status_code', 422
        );
    END IF;

    IF NOT COALESCE(v_vendor.payout_account_verified, false) OR NOT COALESCE(v_vendor.settlement_account_name_matched, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Vendor settlement bank account name enquiry is unverified or mismatched with KYC legal name. Payout blocked.',
            'status_code', 422
        );
    END IF;

    IF v_vendor.payout_hold_until IS NOT NULL AND v_now < v_vendor.payout_hold_until THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payouts are temporarily held due to a recent settlement bank account change.',
            'payout_hold_until', v_vendor.payout_hold_until,
            'status_code', 423
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
        IF v_tx.payout_available_at IS NULL AND v_cooling > 0 THEN
            v_available_at := v_now + (v_cooling::text || ' hours')::interval;
            UPDATE public.transactions
            SET
                code_verified_at = COALESCE(code_verified_at, v_now),
                payout_available_at = v_available_at,
                cooling_window_hours = v_cooling,
                failed_code_attempts = 0,
                updated_at = v_now
            WHERE id = p_transaction_id;

            RETURN jsonb_build_object(
                'success', true,
                'cooling_active', true,
                'cooling_window_hours', v_cooling,
                'payout_available_at', v_available_at,
                'transaction_id', v_tx.id,
                'status_code', 202
            );
        END IF;

        IF v_tx.payout_available_at IS NOT NULL AND v_now < v_tx.payout_available_at THEN
            RETURN jsonb_build_object(
                'success', true,
                'cooling_active', true,
                'cooling_window_hours', COALESCE(v_tx.cooling_window_hours, v_cooling),
                'payout_available_at', v_tx.payout_available_at,
                'transaction_id', v_tx.id,
                'status_code', 202
            );
        END IF;

        UPDATE public.transactions
        SET
            status = 'RELEASING',
            releasing_at = v_now,
            code_verified_at = COALESCE(code_verified_at, v_now),
            failed_code_attempts = 0,
            updated_at = v_now
        WHERE id = p_transaction_id;

        RETURN jsonb_build_object(
            'success', true,
            'cooling_active', false,
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
    v_eligible_sale BOOLEAN := FALSE;
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

        IF v_tx.vendor_id IS NOT NULL THEN
            SELECT
                (
                    v_tx.disputed_at IS NULL
                    AND v_tx.dispute_reason IS NULL
                    AND NOT EXISTS (
                        SELECT 1 FROM public.dispute_resolutions dr WHERE dr.transaction_id = p_transaction_id
                    )
                    AND NOT (
                        COALESCE(v_tx.risk_signals, '[]'::jsonb) @> '[{"code":"SHARED_PHONE_VENDOR_BUYER"}]'::jsonb
                        OR COALESCE(v_tx.risk_signals, '[]'::jsonb) @> '[{"code":"SHARED_DEVICE_OR_IP"}]'::jsonb
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM public.vendors v
                        WHERE v.id = v_tx.vendor_id
                          AND (
                              (v_tx.buyer_phone_hash IS NOT NULL AND v.phone_hash IS NOT NULL AND v_tx.buyer_phone_hash = v.phone_hash)
                              OR (v_tx.buyer_ip_hash IS NOT NULL AND ((v.signup_ip_hash IS NOT NULL AND v_tx.buyer_ip_hash = v.signup_ip_hash) OR (v_tx.creator_ip_hash IS NOT NULL AND v_tx.buyer_ip_hash = v_tx.creator_ip_hash)))
                              OR (v_tx.buyer_device_hash IS NOT NULL AND ((v.signup_device_hash IS NOT NULL AND v_tx.buyer_device_hash = v.signup_device_hash) OR (v_tx.creator_device_hash IS NOT NULL AND v_tx.buyer_device_hash = v_tx.creator_device_hash)))
                          )
                    )
                )
            INTO v_eligible_sale;

            IF v_eligible_sale THEN
                UPDATE public.vendors
                SET
                    successful_sales_count = COALESCE(successful_sales_count, 0) + 1,
                    completed_orders_count = COALESCE(completed_orders_count, 0) + 1,
                    first_order_at = COALESCE(first_order_at, v_now),
                    updated_at = v_now
                WHERE id = v_tx.vendor_id;
            END IF;
        END IF;

        RETURN jsonb_build_object('success', true, 'status', 'RELEASED', 'vendor_sales_incremented', COALESCE(v_eligible_sale, false));
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
            WHEN v_tx.status IN ('EXPIRED', 'CANCELLED') THEN 'LATE_AFTER_TERMINAL'
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
            review_hold = CASE WHEN v_tx.status IN ('EXPIRED', 'CANCELLED') THEN TRUE ELSE COALESCE(review_hold, FALSE) END,
            review_hold_reason = CASE
                WHEN v_tx.status IN ('EXPIRED', 'CANCELLED') THEN 'Late deposit received on ' || v_tx.status || ' order; queued for buyer refund.'
                ELSE review_hold_reason
            END,
            sender_account_number = COALESCE(v_sender_account, sender_account_number),
            sender_bank_code = COALESCE(v_sender_bank, sender_bank_code),
            sender_name = COALESCE(v_sender_name, sender_name),
            refund_destination_account = COALESCE(v_sender_account, refund_destination_account),
            refund_destination_bank = COALESCE(v_sender_bank, refund_destination_bank),
            refund_destination_name = COALESCE(v_sender_name, refund_destination_name),
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
            sender_account_number = COALESCE(v_sender_account, sender_account_number),
            sender_bank_code = COALESCE(v_sender_bank, sender_bank_code),
            sender_name = COALESCE(v_sender_name, sender_name),
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
            'vendor_id', v_tx.vendor_id,
            'total_deposited', v_cumulative_deposited,
            'total_due', v_total_due,
            'sender_name', v_sender_name,
            'sender_account_number', v_sender_account,
            'sender_bank_code', v_sender_bank,
            'order_blocked', COALESCE(v_tx.order_blocked, false),
            'review_hold', COALESCE(v_tx.review_hold, false)
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
            sender_account_number = COALESCE(v_sender_account, sender_account_number),
            sender_bank_code = COALESCE(v_sender_bank, sender_bank_code),
            sender_name = COALESCE(v_sender_name, sender_name),
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
            'vendor_id', v_tx.vendor_id,
            'amount_paid', v_cumulative_deposited,
            'total_deposited', v_cumulative_deposited,
            'total_due', v_total_due,
            'excess_amount', v_excess_amount,
            'sender_name', v_sender_name,
            'sender_account_number', v_sender_account,
            'sender_bank_code', v_sender_bank,
            'order_blocked', COALESCE(v_tx.order_blocked, false),
            'review_hold', COALESCE(v_tx.review_hold, false),
            'needs_code_issue', (v_tx.release_code_hash IS NULL)
        );
    END IF;
END;
$$;

-- 7.3B ATOMIC ADMIN CLEAR RISK REVIEW HOLD
CREATE OR REPLACE FUNCTION public.rpc_admin_clear_risk_hold(
    p_transaction_id UUID,
    p_admin_email TEXT,
    p_reason TEXT,
    p_unblock BOOLEAN DEFAULT FALSE,
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
    v_cleared_flags INT := 0;
BEGIN
    IF TRIM(COALESCE(p_reason, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'A non-empty reason is required to clear a risk hold.', 'status_code', 400);
    END IF;

    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found', 'status_code', 404);
    END IF;

    UPDATE public.transactions
    SET
        review_hold = FALSE,
        review_cleared_by = p_admin_email,
        review_cleared_at = v_now,
        review_clear_reason = p_reason,
        order_blocked = CASE WHEN p_unblock THEN FALSE ELSE order_blocked END,
        order_block_reason = CASE WHEN p_unblock THEN NULL ELSE order_block_reason END,
        updated_at = v_now
    WHERE id = p_transaction_id;

    UPDATE public.risk_flags
    SET
        status = 'CLEARED',
        cleared_by = p_admin_email,
        cleared_reason = p_reason,
        cleared_at = v_now,
        updated_at = v_now
    WHERE transaction_id = p_transaction_id
      AND status IN ('OPEN', 'BLOCKED');

    GET DIAGNOSTICS v_cleared_flags = ROW_COUNT;

    INSERT INTO public.admin_audit_log (
        admin_email, action, target_type, target_id, ip_address, metadata, created_at
    ) VALUES (
        p_admin_email, 'ADMIN_CLEAR_RISK_HOLD', 'transaction', p_transaction_id::text, p_ip_address,
        jsonb_build_object('reason', p_reason, 'unblock', p_unblock, 'cleared_flags_count', v_cleared_flags),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', p_transaction_id,
        'cleared_by', p_admin_email,
        'cleared_at', v_now,
        'cleared_flags_count', v_cleared_flags,
        'unblocked', p_unblock
    );
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

-- 7.8 ROW-LOCKED ATOMIC DISPUTE RAISE & IMMEDIATE PAYOUT HOLD
CREATE OR REPLACE FUNCTION public.rpc_raise_dispute_with_lock(
    p_transaction_id UUID,
    p_raised_by TEXT,
    p_scenario_id INT,
    p_reason TEXT,
    p_response_deadline_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx public.transactions%ROWTYPE;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_role TEXT := UPPER(COALESCE(p_raised_by, 'BUYER'));
BEGIN
    IF v_role NOT IN ('BUYER', 'VENDOR', 'ADMIN', 'SYSTEM') THEN
        RETURN jsonb_build_object('success', false, 'status_code', 400, 'error', 'Invalid dispute initiator role.');
    END IF;

    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status_code', 404, 'error', 'Transaction not found.');
    END IF;

    IF v_tx.status = 'RELEASED' OR v_tx.code_verified_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'status_code', 400, 'error', 'Cannot dispute a transaction after the release code has been accepted.');
    END IF;

    IF v_tx.status = 'DISPUTED' THEN
        RETURN jsonb_build_object('success', false, 'status_code', 400, 'error', 'Transaction is already in dispute.');
    END IF;

    IF v_tx.status NOT IN ('FUNDS_LOCKED', 'DISPATCHED') THEN
        RETURN jsonb_build_object('success', false, 'status_code', 400, 'error', 'Cannot raise dispute in status ' || v_tx.status || '.');
    END IF;

    UPDATE public.transactions
    SET
        status = 'DISPUTED',
        review_hold = TRUE,
        review_hold_reason = 'Dispute frozen (Scenario ' || COALESCE(p_scenario_id::text, 'N/A') || ') raised by ' || v_role,
        disputed_at = v_now,
        dispute_scenario = COALESCE(p_scenario_id, dispute_scenario),
        dispute_reason = COALESCE(NULLIF(TRIM(p_reason), ''), dispute_reason),
        dispute_raised_by = v_role,
        dispute_response_deadline_at = COALESCE(p_response_deadline_at, v_now + interval '12 hours'),
        dispute_otp_hash = NULL,
        dispute_otp_expires_at = NULL,
        dispute_otp_attempts = 0,
        updated_at = v_now
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'DISPUTED',
        'review_hold', true,
        'disputed_at', v_now,
        'dispute_response_deadline_at', COALESCE(p_response_deadline_at, v_now + interval '12 hours'),
        'transaction_id', p_transaction_id
    );
END;
$$;

-- 7.9 SHARED DISTRIBUTED SLIDING-WINDOW RATE LIMITER
CREATE OR REPLACE FUNCTION public.rpc_check_rate_limit(
    p_key TEXT,
    p_limit INT DEFAULT 10,
    p_window_ms BIGINT DEFAULT 900000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_window INTERVAL := (GREATEST(1000, COALESCE(p_window_ms, 900000)) / 1000.0) * interval '1 second';
    v_row public.rate_limit_buckets%ROWTYPE;
    v_allowed BOOLEAN;
    v_remaining INT;
BEGIN
    INSERT INTO public.rate_limit_buckets (key, count, reset_at, updated_at)
    VALUES (p_key, 1, v_now + v_window, v_now)
    ON CONFLICT (key) DO UPDATE
    SET
        count = CASE
            WHEN public.rate_limit_buckets.reset_at <= v_now THEN 1
            ELSE public.rate_limit_buckets.count + 1
        END,
        reset_at = CASE
            WHEN public.rate_limit_buckets.reset_at <= v_now THEN v_now + v_window
            ELSE public.rate_limit_buckets.reset_at
        END,
        updated_at = v_now
    RETURNING * INTO v_row;

    v_allowed := v_row.count <= GREATEST(1, COALESCE(p_limit, 10));
    v_remaining := GREATEST(0, GREATEST(1, COALESCE(p_limit, 10)) - v_row.count);

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'count', v_row.count,
        'remaining', v_remaining,
        'reset_at', v_row.reset_at
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
        'market_waitlist',
        'risk_flags',
        'order_evidence_files',
        'rate_limit_buckets'
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

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;
    END IF;
END $$;

-- Explicit DEFAULT PRIVILEGES hardening for any future tables/sequences/functions
DO $$
BEGIN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role, postgres;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role, postgres;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role, postgres;
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- SECTION 9: PRIVATE EVIDENCE STORAGE BUCKET (relyvora-evidence)
-- -------------------------------------------------------------------------
-- Creates the private bucket used by lib/evidenceStorage.ts (Public = OFF).
-- No permissive policies are added on storage.objects; files are accessed
-- strictly server-side via service_role short-lived signed URLs.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'relyvora-evidence',
            'relyvora-evidence',
            false,
            26214400,
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']
        )
        ON CONFLICT (id) DO UPDATE
        SET
            public = false,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
    END IF;
EXCEPTION
    WHEN insufficient_privilege OR undefined_column OR undefined_table THEN
        RAISE NOTICE 'Skipped automatic storage.buckets creation due to role privileges; create private bucket relyvora-evidence manually in Supabase Dashboard -> Storage (Public = OFF).';
END $$;

COMMIT;

-- -------------------------------------------------------------------------
-- SECTION 10: PRODUCTION VERIFICATION SUMMARY (SINGLE RESULT GRID IN SQL EDITOR)
-- -------------------------------------------------------------------------
-- Expected values:
--   enums_count             = 2
--   tables_count            = 16
--   rls_enabled_count       = 16
--   rls_forced_count        = 16
--   deny_all_policies_count = 16
--   functions_count         = 12
--   triggers_count          = 9
--   system_settings_count   = 19
--   anon_auth_table_privs   = 0
--   anon_auth_fn_privs      = 0
--   legacy_pii_cols_present = 0

SELECT
    (SELECT COUNT(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typname IN ('vendor_kyc_status', 'kyc_status')) AS enums_count,
    (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r') AS tables_count,
    (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) AS rls_enabled_count,
    (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity) AS rls_forced_count,
    (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE') AS deny_all_policies_count,
    (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public') AS functions_count,
    (SELECT COUNT(*)::int FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT tg.tgisinternal) AS triggers_count,
    (SELECT COUNT(*)::int FROM public.system_settings) AS system_settings_count,
    (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND (
           has_table_privilege('anon', c.oid, 'SELECT')
           OR has_table_privilege('anon', c.oid, 'INSERT')
           OR has_table_privilege('anon', c.oid, 'UPDATE')
           OR has_table_privilege('anon', c.oid, 'DELETE')
           OR has_table_privilege('authenticated', c.oid, 'SELECT')
           OR has_table_privilege('authenticated', c.oid, 'INSERT')
           OR has_table_privilege('authenticated', c.oid, 'UPDATE')
           OR has_table_privilege('authenticated', c.oid, 'DELETE')
       )) AS anon_auth_table_privs,
    (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (
           has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       )) AS anon_auth_fn_privs,
    (SELECT COUNT(*)::int FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name IN ('release_code', 'release_code_salt', 'buyer_email', 'date_of_birth', 'gender', 'business_address', 'id_type', 'id_number', 'bvn', 'nin')) AS legacy_pii_cols_present;

-- -------------------------------------------------------------------------
-- SECTION 11: POST-SIGNUP PRODUCTION ADMIN PROMOTION (RUN SEPARATELY LATER)
-- -------------------------------------------------------------------------
-- From docs/ADMIN-SETUP-PROD.sql.
-- Run ONLY AFTER creating your admin user in Production Supabase
-- (Authentication -> Users), then enroll TOTP MFA (AAL2 required).
-- Copy the returned UUID into Vercel Production env var ADMIN_USER_IDS.
--
-- BEGIN;
-- UPDATE auth.users
-- SET
--     raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb,
--     email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc'::text, now())),
--     updated_at = timezone('utc'::text, now())
-- WHERE LOWER(email) = LOWER('<YOUR_ADMIN_EMAIL>');
--
-- SELECT
--     id AS add_this_uuid_to_ADMIN_USER_IDS,
--     email,
--     email_confirmed_at,
--     raw_app_meta_data->>'role' AS app_metadata_role,
--     last_sign_in_at
-- FROM auth.users
-- WHERE LOWER(email) = LOWER('<YOUR_ADMIN_EMAIL>');
-- COMMIT;

