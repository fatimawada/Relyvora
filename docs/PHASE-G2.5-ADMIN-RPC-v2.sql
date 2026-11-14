-- =========================================================================
-- RELYVORA PHASE G2.5 v2: ATOMIC TWO-PHASE DISPUTE RESOLUTION & SETTLEMENT
-- Target Environment: Supabase (Production & Staging)
-- Version: v2 (G2.5 Addendum & Owner Decisions)
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- SECTION 1: SCHEMA HARMONIZATION & COLUMN ADDITIONS
-- -------------------------------------------------------------------------

-- 1.1 Transactions Schema Alignment
ALTER TABLE public.transactions
    DROP COLUMN IF EXISTS buyer_email;

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS dispute_scenario INT,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolving_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolution_action TEXT,
    ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
    ADD COLUMN IF NOT EXISTS buyer_whatsapp_consent BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS buyer_phone_verified BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS buyer_phone_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_delivery_status TEXT DEFAULT 'not_sent' NOT NULL,
    ADD COLUMN IF NOT EXISTS whatsapp_blocked BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS refund_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS payout_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS refund_destination_account TEXT,
    ADD COLUMN IF NOT EXISTS refund_destination_bank TEXT,
    ADD COLUMN IF NOT EXISTS refund_destination_name TEXT,
    ADD COLUMN IF NOT EXISTS excess_amount NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS item_price NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS protection_fee NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS dispute_otp_hash TEXT,
    ADD COLUMN IF NOT EXISTS dispute_otp_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dispute_otp_attempts INT DEFAULT 0;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_whatsapp_delivery_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_whatsapp_delivery_status_check CHECK (
    whatsapp_delivery_status IN ('not_sent', 'queued', 'sent', 'delivered', 'read', 'failed')
);

-- 1.2 Update Transaction Status CHECK Constraint to include 'RESOLVING'
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK (
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
);

-- 1.3 Dispute Resolutions Schema Alignment
ALTER TABLE public.dispute_resolutions
    ADD COLUMN IF NOT EXISTS scenario_number INT,
    ADD COLUMN IF NOT EXISTS scenario_name TEXT,
    ADD COLUMN IF NOT EXISTS resolution_action TEXT,
    ADD COLUMN IF NOT EXISTS buyer_refund_amount NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS vendor_payout_amount NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS relyvora_fee NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS resolved_by TEXT,
    ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
    ADD COLUMN IF NOT EXISTS override_reason TEXT,
    ADD COLUMN IF NOT EXISTS override_confirmed BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS anchor_refund_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS anchor_payout_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS refund_destination_account TEXT,
    ADD COLUMN IF NOT EXISTS refund_destination_bank TEXT;

-- Ensure legacy columns from v1 migration are nullable to prevent runtime crashes
ALTER TABLE public.dispute_resolutions ALTER COLUMN scenario_id DROP NOT NULL;
ALTER TABLE public.dispute_resolutions ALTER COLUMN action DROP NOT NULL;
ALTER TABLE public.dispute_resolutions ALTER COLUMN notes DROP NOT NULL;
ALTER TABLE public.dispute_resolutions ALTER COLUMN admin_email DROP NOT NULL;

-- 1.4 Deposits Schema Alignment: Capture Inbound Sender Account for Verified Refunds (Owner Rule 2)
ALTER TABLE public.deposits
    ADD COLUMN IF NOT EXISTS sender_account_number TEXT,
    ADD COLUMN IF NOT EXISTS sender_bank_code TEXT,
    ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- 1.5 WhatsApp Opt-Out / Do-Not-Contact Registry (HMAC-hashed phone, never plaintext phone)
CREATE TABLE IF NOT EXISTS public.whatsapp_do_not_contact (
    phone_hash TEXT PRIMARY KEY,
    masked_phone TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('NOT_ME', 'STOP_REPLY', 'MANUAL')),
    source_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.6 WhatsApp Outbound Message Audit Log (NO release codes, NO full phone numbers)
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
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_vendor_created ON public.whatsapp_message_log (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_phone_created ON public.whatsapp_message_log (recipient_phone_hash, created_at DESC);

-- 1.7 Inbound WhatsApp Webhook Replay Protection
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
    event_key TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.7b Dedicated Buyer WhatsApp Phone Verifications Audit Record
CREATE TABLE IF NOT EXISTS public.buyer_phone_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
    phone_hash TEXT NOT NULL,
    masked_phone TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT TRUE,
    verification_method TEXT NOT NULL DEFAULT 'WHATSAPP_QUICK_REPLY'
        CHECK (verification_method IN ('WHATSAPP_QUICK_REPLY', 'WHATSAPP_INBOUND')),
    whatsapp_message_id TEXT,
    verified_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_buyer_phone_verifications_tx ON public.buyer_phone_verifications (transaction_id);
CREATE INDEX IF NOT EXISTS idx_buyer_phone_verifications_hash ON public.buyer_phone_verifications (phone_hash);

-- 1.7c International Expansion Waitlist
CREATE TABLE IF NOT EXISTS public.market_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    market TEXT NOT NULL CHECK (market IN ('GH', 'KE', 'ZA')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Hardened modified timestamp trigger function
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

DROP TRIGGER IF EXISTS update_buyer_phone_verifications_modtime ON public.buyer_phone_verifications;
CREATE TRIGGER update_buyer_phone_verifications_modtime
    BEFORE UPDATE ON public.buyer_phone_verifications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_modified_column();

-- Strict RLS & Zero Public Privilege Lockdown on all WhatsApp & verification tables
ALTER TABLE public.whatsapp_do_not_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_do_not_contact FORCE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_phone_verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.market_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_waitlist FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_do_not_contact FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_message_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.buyer_phone_verifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.market_waitlist FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Strict Restrictive Deny All on whatsapp_do_not_contact" ON public.whatsapp_do_not_contact;
CREATE POLICY "Strict Restrictive Deny All on whatsapp_do_not_contact"
    ON public.whatsapp_do_not_contact
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS "Strict Restrictive Deny All on whatsapp_message_log" ON public.whatsapp_message_log;
CREATE POLICY "Strict Restrictive Deny All on whatsapp_message_log"
    ON public.whatsapp_message_log
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS "Strict Restrictive Deny All on whatsapp_webhook_events" ON public.whatsapp_webhook_events;
CREATE POLICY "Strict Restrictive Deny All on whatsapp_webhook_events"
    ON public.whatsapp_webhook_events
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS "Strict Restrictive Deny All on buyer_phone_verifications" ON public.buyer_phone_verifications;
CREATE POLICY "Strict Restrictive Deny All on buyer_phone_verifications"
    ON public.buyer_phone_verifications
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS "Strict Restrictive Deny All on market_waitlist" ON public.market_waitlist;
CREATE POLICY "Strict Restrictive Deny All on market_waitlist"
    ON public.market_waitlist
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

GRANT ALL ON TABLE public.whatsapp_do_not_contact TO service_role, postgres;
GRANT ALL ON TABLE public.whatsapp_message_log TO service_role, postgres;
GRANT ALL ON TABLE public.whatsapp_webhook_events TO service_role, postgres;
GRANT ALL ON TABLE public.buyer_phone_verifications TO service_role, postgres;
GRANT ALL ON TABLE public.market_waitlist TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.update_modified_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_modified_column() TO service_role, postgres;

-- 1.8 Seed WhatsApp Daily Abuse Limits in system_settings (non-destructive if already overridden)
INSERT INTO public.system_settings (key, value, description, updated_by)
VALUES
    ('max_daily_vendor_whatsapp_messages', '50'::jsonb, 'Maximum outbound WhatsApp messages a single vendor can trigger per UTC day.', 'system'),
    ('max_daily_buyer_whatsapp_messages', '5'::jsonb, 'Maximum outbound WhatsApp messages sent to a single buyer phone number per UTC day.', 'system')
ON CONFLICT (key) DO NOTHING;


-- -------------------------------------------------------------------------
-- SECTION 2: PHASE 1 - PREPARE DISPUTE RESOLUTION (rpc_admin_prepare_dispute_resolution)
-- -------------------------------------------------------------------------
-- 1. Locks transaction via SELECT ... FOR UPDATE.
-- 2. Verifies status is strictly 'DISPUTED' or 'RESOLVING' (for leg retry).
-- 3. Computes exact split amounts on the server based on stored item_price,
--    delivery_fee, and protection_fee:
--    - Owner Rule 1: In Scenario 1 (Full Refund), protection_fee is NON-REFUNDABLE.
--      Buyer gets item_price + delivery_fee back; Relyvora retains protection_fee.
--    - Scenario 2 & 7: Buyer gets item_price; vendor gets delivery_fee; Relyvora retains fee.
--    - Scenario 3: Vendor gets item_price + delivery_fee; Relyvora retains fee.
--    - Scenario 4, 6, 8: Buyer gets item_price + delivery_fee; Relyvora retains fee.
--    - Scenario 5 (or Custom): Requires documented override (min 10 char reason + confirmed=true).
-- 4. Strictly validates: buyer_amt + vendor_amt + fee_amt = amount_paid - excess_amount.
-- 5. Owner Rule 2: Requires verified sender account for buyer refund (anti-money laundering).
-- 6. Moves transaction status to 'RESOLVING' and records resolving_at.
-- -------------------------------------------------------------------------

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
    -- 1. ACQUIRE EXCLUSIVE ROW LOCK
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

    -- 2. VERIFY STATUS: Must be 'DISPUTED' or 'RESOLVING' (for retrying failed transfer leg)
    IF v_tx.status NOT IN ('DISPUTED', 'RESOLVING') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TRANSACTION_STATUS',
            'message', 'Cannot prepare dispute resolution: status is ' || v_tx.status || ', expected DISPUTED or RESOLVING',
            'current_status', v_tx.status
        );
    END IF;

    -- 3. DERIVE BASE TRANSACTION AMOUNTS
    v_net_escrow := COALESCE(v_tx.amount_paid, 0) - COALESCE(v_tx.excess_amount, 0);
    IF v_net_escrow <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ZERO_ESCROW_BALANCE',
            'message', 'Net escrow balance is zero or negative'
        );
    END IF;

    -- Standardize stored item_price, delivery_fee, protection_fee
    v_fee_amt := COALESCE(v_tx.protection_fee, GREATEST(ROUND(v_tx.total_amount * 0.03), 500));
    v_delivery_fee := COALESCE(v_tx.delivery_fee, 0);
    v_item_price := COALESCE(v_tx.item_price, v_net_escrow - v_fee_amt - v_delivery_fee);

    -- 4. SERVER-SIDE SPLIT CALCULATION (Governed by Owner Rules & Dispute Scenarios)
    IF p_override_buyer_refund IS NOT NULL OR p_override_vendor_payout IS NOT NULL THEN
        -- Documented Override Path
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
        -- Standard Policy Scenario Path
        CASE p_scenario_number
            WHEN 1 THEN
                -- Scenario 1: Quality Mismatch ("What I Ordered vs What I Got")
                -- Owner Rule 1: 3% fee is NON-REFUNDABLE. Buyer receives item_price + delivery_fee.
                v_scenario_name := 'Quality Mismatch ("What I Ordered vs. What I Got")';
                v_action := 'FULL_REFUND_BUYER';
                v_buyer_amt := v_net_escrow - v_fee_amt;
                v_vendor_amt := 0;

            WHEN 2 THEN
                -- Scenario 2: Buyer Refuses Delivery / Unreachable ("Buyer Ghosts")
                -- Buyer gets item_price, vendor gets delivery_fee to cover logistics, Relyvora keeps fee.
                v_scenario_name := 'Buyer Refuses Delivery / Unreachable ("Buyer Ghosts")';
                v_action := 'SPLIT_MINUS_DELIVERY';
                v_vendor_amt := v_delivery_fee;
                v_buyer_amt := v_net_escrow - v_fee_amt - v_delivery_fee;

            WHEN 3 THEN
                -- Scenario 3: The "Hostage" Situation (Item Taken, Code Withheld)
                -- Full Payout to Vendor.
                v_scenario_name := 'The "Hostage" Situation (Item Taken, Code Withheld)';
                v_action := 'FULL_PAYOUT_VENDOR';
                v_buyer_amt := 0;
                v_vendor_amt := v_net_escrow - v_fee_amt;

            WHEN 4 THEN
                -- Scenario 4: Item Damaged in Transit
                -- Full refund of goods to buyer. Fee non-refundable.
                v_scenario_name := 'Item Damaged in Transit';
                v_action := 'FULL_REFUND_BUYER';
                v_buyer_amt := v_net_escrow - v_fee_amt;
                v_vendor_amt := 0;

            WHEN 5 THEN
                -- Scenario 5: Partial Acceptance (Requires explicit override or 50/50 split)
                v_scenario_name := 'Partial Acceptance (Multi-Item Orders)';
                v_action := 'CUSTOM_SPLIT';
                v_vendor_amt := ROUND((v_item_price / 2.0), 2) + v_delivery_fee;
                v_buyer_amt := v_net_escrow - v_fee_amt - v_vendor_amt;

            WHEN 6 THEN
                -- Scenario 6: Vendor Failure to Deliver ("Vendor MIA")
                v_scenario_name := 'Vendor Failure to Deliver ("Vendor MIA")';
                v_action := 'FULL_REFUND_BUYER';
                v_buyer_amt := v_net_escrow - v_fee_amt;
                v_vendor_amt := 0;

            WHEN 7 THEN
                -- Scenario 7: Buyer\'s Remorse at the Door
                -- Vendor keeps delivery fee; buyer gets item refund.
                v_scenario_name := 'Buyer''s Remorse at the Door';
                v_action := 'SPLIT_MINUS_DELIVERY';
                v_vendor_amt := v_delivery_fee;
                v_buyer_amt := v_net_escrow - v_fee_amt - v_delivery_fee;

            WHEN 8 THEN
                -- Scenario 8: Lost or Stolen in Transit (Rider Absconds)
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

    -- 5. ENFORCE EXACT SOLVENCY CONSTRAINT: buyer + vendor + fee = amount_paid - excess_amount
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

    -- 6. OWNER RULE 2: VERIFIED REFUND DESTINATION CHECK (AML Safeguard)
    -- A buyer refund must be sent strictly to the verified sender account reported by Anchor on inbound webhook
    v_refund_dest_acc := v_tx.refund_destination_account;
    v_refund_dest_bank := v_tx.refund_destination_bank;

    IF v_buyer_amt > 0 THEN
        IF v_refund_dest_acc IS NULL OR v_refund_dest_bank IS NULL THEN
            -- Check if recorded in deposits table
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

    -- 7. ATOMICALLY TRANSITION TO 'RESOLVING' STATE
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


-- -------------------------------------------------------------------------
-- SECTION 3: PHASE 2 - FINALIZE DISPUTE RESOLUTION (rpc_admin_finalize_dispute_resolution)
-- -------------------------------------------------------------------------
-- 1. Locks transaction via SELECT ... FOR UPDATE.
-- 2. Verifies status is strictly 'RESOLVING'.
-- 3. Verifies real Anchor transfer IDs are recorded for all non-zero legs.
-- 4. Transitions transaction to 'REFUNDED' (if vendor=0) or 'RELEASED' (if vendor>0).
-- 5. Inserts immutable record into public.dispute_resolutions.
-- 6. Writes immutable double-entry records to public.transaction_ledger ONLY with real Anchor transfer IDs.
-- 7. Writes immutable audit record to public.admin_audit_log.
-- -------------------------------------------------------------------------

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
    -- 1. ACQUIRE EXCLUSIVE ROW LOCK
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

    -- 2. VERIFY STATUS: Must be 'RESOLVING'
    IF v_tx.status != 'RESOLVING' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TRANSACTION_STATUS',
            'message', 'Cannot finalize dispute: status is ' || v_tx.status || ', expected RESOLVING',
            'current_status', v_tx.status
        );
    END IF;

    -- 3. DETERMINE FINAL STATUS
    IF v_vendor_amt = 0 AND v_buyer_amt > 0 THEN
        v_final_status := 'REFUNDED';
    ELSE
        v_final_status := 'RELEASED';
    END IF;

    -- 4. UPDATE TRANSACTION RECORD
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

    -- 5. INSERT RECORD INTO dispute_resolutions
    INSERT INTO public.dispute_resolutions (
        transaction_id,
        scenario_id,
        scenario_number,
        scenario_name,
        action,
        resolution_action,
        buyer_refund_amount,
        vendor_payout_amount,
        relyvora_fee,
        admin_email,
        resolved_by,
        notes,
        resolution_notes,
        override_reason,
        override_confirmed,
        anchor_refund_transfer_id,
        anchor_payout_transfer_id,
        refund_destination_account,
        refund_destination_bank,
        created_at
    ) VALUES (
        p_transaction_id,
        p_scenario_number,
        p_scenario_number,
        p_scenario_name,
        p_resolution_action,
        p_resolution_action,
        v_buyer_amt,
        v_vendor_amt,
        v_fee_amt,
        p_admin_email,
        p_admin_email,
        p_resolution_notes,
        p_resolution_notes,
        p_override_reason,
        p_override_confirmed,
        p_anchor_refund_transfer_id,
        p_anchor_payout_transfer_id,
        v_tx.refund_destination_account,
        v_tx.refund_destination_bank,
        v_now
    ) RETURNING id INTO v_resolution_id;

    -- 6. WRITE IMMUTABLE TRANSACTION LEDGER ROWS (With REAL Anchor Transfer IDs)
    -- 6a. Buyer Leg
    IF v_buyer_amt > 0 THEN
        INSERT INTO public.transaction_ledger (
            transaction_id,
            entry_type,
            amount,
            currency,
            from_account,
            to_account,
            anchor_transfer_id,
            idempotency_key,
            metadata,
            created_at
        ) VALUES (
            p_transaction_id,
            CASE WHEN p_resolution_action = 'FULL_REFUND_BUYER' THEN 'REFUND_BUYER' ELSE 'SPLIT_BUYER' END,
            v_buyer_amt,
            'NGN',
            'Relyvora Escrow Vault',
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

    -- 6b. Vendor Leg
    IF v_vendor_amt > 0 THEN
        INSERT INTO public.transaction_ledger (
            transaction_id,
            entry_type,
            amount,
            currency,
            from_account,
            to_account,
            anchor_transfer_id,
            idempotency_key,
            metadata,
            created_at
        ) VALUES (
            p_transaction_id,
            CASE WHEN p_resolution_action = 'FULL_PAYOUT_VENDOR' THEN 'PAYOUT_VENDOR' ELSE 'SPLIT_VENDOR' END,
            v_vendor_amt,
            'NGN',
            'Relyvora Escrow Vault',
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

    -- 6c. Relyvora Platform Fee Revenue Leg
    IF v_fee_amt > 0 THEN
        INSERT INTO public.transaction_ledger (
            transaction_id,
            entry_type,
            amount,
            currency,
            from_account,
            to_account,
            idempotency_key,
            metadata,
            created_at
        ) VALUES (
            p_transaction_id,
            'FEE_REVENUE',
            v_fee_amt,
            'NGN',
            'Relyvora Escrow Vault',
            'Relyvora Revenue Account',
            'ledger_dispute_fee_' || p_transaction_id::text || '_' || v_resolution_id::text,
            jsonb_build_object(
                'scenario_number', p_scenario_number,
                'resolution_id', v_resolution_id,
                'fee_protection', true
            ),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- 7. WRITE IMMUTABLE RECORD TO ADMIN AUDIT LOG
    INSERT INTO public.admin_audit_log (
        admin_email,
        action,
        target_type,
        target_id,
        ip_address,
        metadata,
        created_at
    ) VALUES (
        p_admin_email,
        'DISPUTE_FINALIZE_' || p_resolution_action,
        'transaction',
        p_transaction_id::text,
        p_ip_address,
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
-- SECTION 4: INBOUND DEPOSIT WEBHOOK UPDATE (Capture Verified Sender Account)
-- -------------------------------------------------------------------------
-- Updates rpc_process_webhook_deposit to extract sender bank account details
-- from the Anchor deposit payload and store them on both deposits and transactions.
-- -------------------------------------------------------------------------

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
    -- 1. Extract verified sender details from Anchor payload (Owner Rule 2)
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

    -- 2. Concurrency-Safe Idempotency Check on webhook_events
    INSERT INTO public.webhook_events (event_id, event_type, payload, status, created_at)
    VALUES (p_event_id, p_event_type, p_payload, 'RECEIVED', v_now)
    ON CONFLICT (event_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'replayed', true, 'message', 'Webhook event already processed');
    END IF;

    -- 3. Match Transaction with Strict Cross-Validation
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

    -- 4. Restricted State Machine: Only AWAITING_PAYMENT or PARTIALLY_FUNDED can advance to FUNDS_LOCKED.
    -- Deposits after RELEASED/REFUNDED/DISPUTED/FUNDS_LOCKED etc. MUST preserve transaction status.
    IF v_tx.status NOT IN ('AWAITING_PAYMENT', 'PARTIALLY_FUNDED') THEN
        v_deposit_status := CASE
            WHEN v_tx.status IN ('RELEASED', 'REFUNDED') THEN 'LATE_DEPOSIT'
            ELSE 'EXCESS_DEPOSIT'
        END;

        -- Record deposit with verified sender details
        INSERT INTO public.deposits (
            transaction_id, anchor_event_id, account_number, amount, status, metadata,
            sender_account_number, sender_bank_code, sender_name
        ) VALUES (
            v_tx.id, p_event_id, p_account_number, p_amount_naira, v_deposit_status, p_payload,
            v_sender_account, v_sender_bank, v_sender_name
        );

        -- Update cumulative amount_paid and excess_amount WITHOUT altering transaction status
        UPDATE public.transactions
        SET
            amount_paid = COALESCE(amount_paid, 0) + p_amount_naira,
            excess_amount = COALESCE(excess_amount, 0) + p_amount_naira,
            updated_at = v_now
        WHERE id = v_tx.id;

        -- Record in ledger
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

    -- 5. Normal Funding Path
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

        -- Record ledger entry
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


-- -------------------------------------------------------------------------
-- SECTION 5: STRICT PERMISSION LOCKDOWN (ZERO PUBLIC ACCESS)
-- -------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.rpc_admin_prepare_dispute_resolution FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_prepare_dispute_resolution TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.rpc_admin_finalize_dispute_resolution FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_finalize_dispute_resolution TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.rpc_process_webhook_deposit FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_webhook_deposit TO service_role, postgres;


-- -------------------------------------------------------------------------
-- SECTION 6: VERIFICATION QUERIES (EXPECTED: ONLY service_role AND postgres)
-- -------------------------------------------------------------------------

SELECT 
    routine_name, 
    grantee, 
    privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'rpc_admin_prepare_dispute_resolution', 
    'rpc_admin_finalize_dispute_resolution',
    'rpc_process_webhook_deposit'
  );

COMMIT;
