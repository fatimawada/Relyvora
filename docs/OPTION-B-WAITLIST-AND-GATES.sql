-- =========================================================================
-- RELYVORA — OPTION B: WAITLIST, KYC GATING & LIVE LAUNCH FLAGS
-- Run in Supabase SQL Editor after reviewing policies & table definition.
-- Safe & idempotent (wrapped in BEGIN; ... COMMIT;).
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. VENDOR WAITLIST TABLE (Service Role Only, Strict RLS Deny for Anon/Auth)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vendor_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    store_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    whatsapp_number TEXT NOT NULL,
    whatsapp_phone_hash TEXT,
    status TEXT NOT NULL DEFAULT 'waitlisted'
        CONSTRAINT vendor_waitlist_status_check CHECK (
            status IN ('waitlisted', 'invited', 'kyc_opened', 'active')
        ),
    source TEXT NOT NULL DEFAULT 'open_signup',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_vendor_waitlist_email ON public.vendor_waitlist(email);
CREATE INDEX IF NOT EXISTS idx_vendor_waitlist_user_id ON public.vendor_waitlist(user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_waitlist_status_created ON public.vendor_waitlist(status, created_at DESC);

DROP TRIGGER IF EXISTS update_vendor_waitlist_modtime ON public.vendor_waitlist;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'update_modified_column'
    ) THEN
        CREATE TRIGGER update_vendor_waitlist_modtime
            BEFORE UPDATE ON public.vendor_waitlist
            FOR EACH ROW
            EXECUTE FUNCTION public.update_modified_column();
    END IF;
END $$;

-- Strict RLS & Zero Public/Authenticated Access
ALTER TABLE public.vendor_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_waitlist FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vendor_waitlist FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Strict Restrictive Deny All on vendor_waitlist" ON public.vendor_waitlist;
CREATE POLICY "Strict Restrictive Deny All on vendor_waitlist"
    ON public.vendor_waitlist
    AS RESTRICTIVE
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE public.vendor_waitlist TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        GRANT ALL ON TABLE public.vendor_waitlist TO postgres;
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- 2. OPTION B FEATURE & LAUNCH GATES IN system_settings (DEFAULT LOCKED)
-- -------------------------------------------------------------------------

INSERT INTO public.system_settings (key, value, description, updated_by)
VALUES
    (
        'kyc_enabled',
        'false'::jsonb,
        'Option B gate: when false, Step 2 KYC renders a locked state with no identity fields and zero Anchor calls.',
        'system'
    ),
    (
        'release_code_template_approved',
        'false'::jsonb,
        'Option B gate: must be true after Meta release_code_v1 template approval before payment link creation or payments open.',
        'system'
    ),
    (
        'launch_status',
        '"launching"'::jsonb,
        'Public launch status (launching | live) synced with LAUNCH_STATUS runtime check.',
        'system'
    )
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------------------
-- 3. VERIFICATION QUERIES (Expected: all anon/auth = false, service_role = true)
-- -------------------------------------------------------------------------

SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
    has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
    has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
    has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'vendor_waitlist';

SELECT key, value, description
FROM public.system_settings
WHERE key IN ('kyc_enabled', 'release_code_template_approved', 'launch_status')
ORDER BY key;

COMMIT;
