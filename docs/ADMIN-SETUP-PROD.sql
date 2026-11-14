-- =========================================================================
-- RELYVORA — PRODUCTION ADMIN SETUP SQL (app_metadata.role = 'admin')
-- Run in Production Supabase SQL Editor AFTER creating the admin account in
-- Authentication -> Users (or signing up once before disabling public signups)
-- and enrolling TOTP MFA (AAL2 required by lib/adminAuth.ts).
--
-- IMPORTANT:
-- 1. Replace '<YOUR_ADMIN_EMAIL>' below with your exact admin login email.
-- 2. Copy the returned `id` (UUID) into the Vercel server-only environment
--    variable `ADMIN_USER_IDS` (never `NEXT_PUBLIC_`).
-- 3. user_metadata.role is ignored by lib/adminAuth.ts; ONLY raw_app_meta_data
--    (surfaced as user.app_metadata) is trusted.
-- =========================================================================

BEGIN;

UPDATE auth.users
SET
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb,
    email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc'::text, now())),
    updated_at = timezone('utc'::text, now())
WHERE LOWER(email) = LOWER('<YOUR_ADMIN_EMAIL>');

-- Verify row updated (0 rows means the user does not exist in auth.users yet)
SELECT
    id AS add_this_uuid_to_ADMIN_USER_IDS,
    email,
    email_confirmed_at,
    raw_app_meta_data->>'role' AS app_metadata_role,
    last_sign_in_at
FROM auth.users
WHERE LOWER(email) = LOWER('<YOUR_ADMIN_EMAIL>');

COMMIT;
