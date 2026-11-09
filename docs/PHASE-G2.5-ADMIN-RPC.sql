-- =========================================================================
-- RELYVORA PHASE G2.5: ATOMIC DISPUTE RESOLUTION RPC & PERMISSION HARDENING
-- Target Environment: Supabase (Production & Staging)
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. CREATE ATOMIC DISPUTE RESOLUTION FUNCTION
-- -------------------------------------------------------------------------
-- Uses SELECT ... FOR UPDATE to acquire an exclusive row lock on public.transactions,
-- verifies status = 'DISPUTED' to prevent race conditions with release/payout,
-- validates that total distributed <= amount_paid,
-- updates transaction status to REFUNDED or RELEASED,
-- inserts into public.dispute_resolutions,
-- records double-entry records in public.transaction_ledger,
-- and writes an immutable entry into public.admin_audit_log within one atomic transaction.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_resolve_dispute(
    p_transaction_id UUID,
    p_scenario_number INT,
    p_scenario_name TEXT,
    p_resolution_action TEXT,
    p_buyer_refund_amount NUMERIC,
    p_vendor_payout_amount NUMERIC,
    p_platform_fee NUMERIC,
    p_admin_email TEXT,
    p_resolution_notes TEXT,
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
    v_new_status TEXT;
    v_total_distributed NUMERIC;
    v_buyer_amt NUMERIC := COALESCE(p_buyer_refund_amount, 0);
    v_vendor_amt NUMERIC := COALESCE(p_vendor_payout_amount, 0);
    v_fee_amt NUMERIC := COALESCE(p_platform_fee, 0);
BEGIN
    -- 1. ACQUIRE EXCLUSIVE ROW LOCK (SELECT ... FOR UPDATE)
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

    -- 2. VERIFY STATUS IS STRICTLY 'DISPUTED'
    -- Prevents race conditions with rpc_verify_and_prepare_release or payout
    IF v_tx.status != 'DISPUTED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TRANSACTION_STATUS',
            'message', 'Cannot resolve dispute: transaction status is ' || v_tx.status || ', expected DISPUTED',
            'current_status', v_tx.status
        );
    END IF;

    -- 3. VALIDATE TOTAL SETTLEMENT DOES NOT EXCEED AMOUNT PAID
    v_total_distributed := v_buyer_amt + v_vendor_amt + v_fee_amt;
    IF v_total_distributed > v_tx.amount_paid THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'SETTLEMENT_EXCEEDS_PAID_AMOUNT',
            'message', 'Total settlement distribution (₦' || v_total_distributed || ') exceeds total amount paid into escrow (₦' || v_tx.amount_paid || ')',
            'amount_paid', v_tx.amount_paid,
            'total_distributed', v_total_distributed
        );
    END IF;

    -- 4. DETERMINE TARGET STATE
    IF p_resolution_action = 'FULL_REFUND_BUYER' THEN
        v_new_status := 'REFUNDED';
    ELSE
        -- FULL_PAYOUT_VENDOR, SPLIT_MINUS_DELIVERY, CUSTOM_SPLIT mark escrow concluded
        v_new_status := 'RELEASED';
    END IF;

    -- 5. ATOMICALLY UPDATE TRANSACTION RECORD
    UPDATE public.transactions
    SET 
        status = v_new_status,
        dispute_scenario = p_scenario_number,
        resolved_at = v_now,
        resolution_action = p_resolution_action,
        resolution_notes = p_resolution_notes,
        updated_at = v_now
    WHERE id = p_transaction_id;

    -- 6. INSERT DISPUTE RESOLUTION RECORD
    INSERT INTO public.dispute_resolutions (
        transaction_id,
        scenario_number,
        scenario_name,
        resolution_action,
        buyer_refund_amount,
        vendor_payout_amount,
        relyvora_fee,
        resolved_by,
        resolution_notes,
        created_at
    ) VALUES (
        p_transaction_id,
        p_scenario_number,
        p_scenario_name,
        p_resolution_action,
        v_buyer_amt,
        v_vendor_amt,
        v_fee_amt,
        p_admin_email,
        p_resolution_notes,
        v_now
    ) RETURNING id INTO v_resolution_id;

    -- 7. ATOMICALLY RECORD TRANSACTION LEDGER ENTRIES
    -- 7a. Buyer Refund / Split Entry
    IF v_buyer_amt > 0 THEN
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
            CASE WHEN p_resolution_action = 'FULL_REFUND_BUYER' THEN 'REFUND_BUYER' ELSE 'SPLIT_BUYER' END,
            v_buyer_amt,
            'NGN',
            'Relyvora Escrow Vault',
            'Buyer (' || COALESCE(v_tx.buyer_phone, 'Direct Customer') || ')',
            'ledger_dispute_buyer_' || p_transaction_id::text || '_' || v_resolution_id::text,
            jsonb_build_object(
                'scenario_number', p_scenario_number,
                'resolution_action', p_resolution_action,
                'resolution_id', v_resolution_id
            ),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- 7b. Vendor Payout / Split Entry
    IF v_vendor_amt > 0 THEN
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
            CASE WHEN p_resolution_action = 'FULL_PAYOUT_VENDOR' THEN 'PAYOUT_VENDOR' ELSE 'SPLIT_VENDOR' END,
            v_vendor_amt,
            'NGN',
            'Relyvora Escrow Vault',
            'Vendor (' || v_tx.vendor_handle || ')',
            'ledger_dispute_vendor_' || p_transaction_id::text || '_' || v_resolution_id::text,
            jsonb_build_object(
                'scenario_number', p_scenario_number,
                'resolution_action', p_resolution_action,
                'resolution_id', v_resolution_id
            ),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- 7c. Platform Fee Revenue Entry
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
                'resolution_id', v_resolution_id
            ),
            v_now
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- 8. WRITE IMMUTABLE RECORD TO ADMIN AUDIT LOG
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
        'DISPUTE_RESOLVE_' || p_resolution_action,
        'transaction',
        p_transaction_id::text,
        p_ip_address,
        jsonb_build_object(
            'scenario_number', p_scenario_number,
            'scenario_name', p_scenario_name,
            'resolution_action', p_resolution_action,
            'buyer_refund_amount', v_buyer_amt,
            'vendor_payout_amount', v_vendor_amt,
            'platform_fee', v_fee_amt,
            'notes', p_resolution_notes,
            'resolution_id', v_resolution_id
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', p_transaction_id,
        'resolution_id', v_resolution_id,
        'new_status', v_new_status,
        'buyer_refund_amount', v_buyer_amt,
        'vendor_payout_amount', v_vendor_amt,
        'platform_fee', v_fee_amt,
        'resolved_by', p_admin_email
    );
END;
$$;

-- -------------------------------------------------------------------------
-- 2. STRICT PERMISSION LOCKDOWN (ZERO PUBLIC ACCESS)
-- -------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_admin_resolve_dispute FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_resolve_dispute TO service_role, postgres;

-- -------------------------------------------------------------------------
-- 3. VERIFICATION QUERY (EXPECTED: ONLY service_role AND postgres)
-- -------------------------------------------------------------------------
SELECT 
    routine_name, 
    grantee, 
    privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public' 
  AND routine_name = 'rpc_admin_resolve_dispute';

COMMIT;
