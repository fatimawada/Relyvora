# Relyvora — Production & Staging Database Deploy Runbook (Frozen Schema)

> **STOP — READ TARGET URL FIRST**
> - **Production Supabase:** Empty project dedicated strictly to Production (`main` branch deploy).
> - **Staging Supabase:** `https://bepvqjqjybhhpsfbblqk.supabase.co` (`release-candidate` branch).
> - Never run `scripts/seed-staging-vendor.ts` or any `tests/*.test.ts` script against Production (both scripts enforce `assertStagingTarget` / `NODE_ENV` guards, and Production secrets must never be placed in local `.env.local`).
> - Do not merge or deploy until all verification queries below match **100%**.

---

## Frozen Schema Summary

| Category | Exact Expected Count | Details |
| :--- | :---: | :--- |
| **Enums** | **2** | `public.vendor_kyc_status`, `public.kyc_status` — both with labels `('pending', 'submitted', 'verified', 'rejected')` |
| **Tables** | **16** | `vendors`, `transactions`, `buyer_phone_verifications`, `deposits`, `webhook_events`, `transaction_ledger`, `dispute_resolutions`, `system_settings`, `admin_audit_log`, `whatsapp_do_not_contact`, `whatsapp_message_log`, `whatsapp_webhook_events`, `market_waitlist`, `risk_flags`, `order_evidence_files`, `rate_limit_buckets` |
| **Functions** | **12** | **3 trigger functions** (`update_modified_column`, `handle_updated_at`, `prevent_ledger_modification`) + **9 RPC functions** (`rpc_verify_and_prepare_release` [4 args], `rpc_finalize_release_step` [4 args], `rpc_process_webhook_deposit` [6 args], `rpc_admin_clear_risk_hold` [5 args], `rpc_admin_unlock_transaction` [4 args], `rpc_admin_prepare_dispute_resolution` [8 args], `rpc_admin_finalize_dispute_resolution` [14 args], `rpc_raise_dispute_with_lock` [5 args], `rpc_check_rate_limit` [3 args]) |
| **Triggers** | **9 DDL / 8 DML** | `update_vendors_modtime`, `update_transactions_modtime`, `update_system_settings_modtime`, `update_whatsapp_message_log_modtime`, `update_buyer_phone_verifications_modtime`, `update_risk_flags_modtime`, `update_rate_limit_buckets_modtime`, `trg_prevent_ledger_mutation`, plus statement-level `trg_prevent_ledger_truncate` (excluded from `information_schema.triggers`, present in `pg_trigger`) |
| **Indexes** | **59 total** | All primary-key / unique constraints plus explicit query indexes across orders, disputes, risk flags, evidence retention & distributed rate limits |
| **RLS Policies** | **16** | One `AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)` policy (`Strict Restrictive Deny All on <table>`) per table, with `ENABLE` + `FORCE ROW LEVEL SECURITY` |
| **`system_settings`** | **19** | `checkout_enabled`, `payouts_enabled`, `max_order_ngn`, `max_daily_vendor_volume_ngn`, `vendor_allowlist_mode`, `max_daily_vendor_whatsapp_messages`, `max_daily_buyer_whatsapp_messages`, `tier1_order_limit_ngn`, `tier_upgrade_threshold`, `tier_config`, `payout_safety_config`, `risk_engine_config`, `cooling_window_config`, `admin_safety_config`, `delivery_window_config`, `dispute_policy_config`, `dispatch_proof_config`, `order_lifecycle_config`, `retention_and_storage_config` |
| **`anon` / `authenticated` / `PUBLIC` Grants** | **0** | Zero table/sequence/function privileges; `service_role` only via Next.js server routes |

---

## Step 1 — Pre-Execution Backups, Storage & Freeze Checks

1. Confirm target Supabase Project Reference in the dashboard URL before opening SQL Editor.
2. **Existing Staging DB only:** Take a manual backup / snapshot in **Supabase Dashboard -> Database -> Backups** before pasting `docs/STAGING-ADDITIONS.sql`.
3. **Private Evidence Storage Bucket (`relyvora-evidence`):**
   - In **Supabase Dashboard -> Storage**, create private bucket `relyvora-evidence` (**Public = OFF**).
   - Never add public read policies to `relyvora-evidence`; files are accessed exclusively server-side via `service_role` short-lived signed URLs (`GET /api/escrow/evidence/signed-url`).
4. **Fresh Production DB:** Confirm **Table Editor -> `public` schema** is completely empty (`0` tables, `0` custom types, `0` functions).
5. Verify local schema parity passes before touching any remote database:
   ```bash
   node --v8-pool-size=1 --liftoff-only --expose-gc scripts/compare-schema.ts
   ```
   Expected output: `DIFF: <empty> (0 differences across all categories — 100% parity)`.

---

## Step 2 — Numbered SQL Paste Order

### Path A: Brand-New Empty Production Database

Run each step in **Production Supabase Dashboard -> SQL Editor** strictly in order:

1. **Paste and run `docs/FULL-SCHEMA-FROM-SCRATCH.sql` verbatim (Sections 1–8 in one `BEGIN ... COMMIT` transaction, followed by Section 9 verification queries):**
   - **Expected Output:** Transaction commits cleanly with zero partial state on error, followed by Section 9 verification rows matching Step 3 below.

2. **Configure Production Supabase Authentication:**
   - **Authentication -> Providers -> Email:** Enable Email/Password; **Disable** Google/OAuth providers; enable email confirmations.
   - **Authentication -> SMTP Settings:** Configure custom SMTP using a `@relyvora.com` sender (never a personal Gmail address).
   - **Authentication -> Multi-Factor Authentication (TOTP):** Enable TOTP MFA so admins can satisfy `aal2`.
   - **Authentication -> Bot and Abuse Protection:** Configure Turnstile/hCaptcha matching `NEXT_PUBLIC_CAPTCHA_SITE_KEY` & `CAPTCHA_SECRET_KEY`.

3. **Create the Admin User & Promote `app_metadata.role = 'admin'` (`docs/ADMIN-SETUP-PROD.sql`):**
   - First sign up or invite the admin email in **Authentication -> Users**.
   - Paste `docs/ADMIN-SETUP-PROD.sql`, replacing `<YOUR_ADMIN_EMAIL>`, then copy `add_this_uuid_to_ADMIN_USER_IDS` into Vercel Production `ADMIN_USER_IDS`.
   - Log into `/admin/security` in Production to enroll TOTP MFA (`aal2`) and confirm `/admin` unlocks.

4. **Configure Vercel Production Environment Variables (`docs/PRODUCTION-ENV-CHECKLIST.md`):**
   - Start with `PAYMENTS_MODE=sandbox` and `LAUNCH_STATUS=launching` for initial smoke validation; flip `PAYMENTS_MODE=live` and `LAUNCH_STATUS=live` only after verifying `/api/health`, `/api/cron/reconcile` (`CRON_SECRET`), and all verification queries below.

---

### Path B: Existing Staging Database Delta (`release-candidate`)

Run in **Staging Supabase SQL Editor (`bepvqjqjybhhpsfbblqk`)**:

1. **Paste and run `docs/STAGING-ADDITIONS.sql` verbatim (Sections 1–7 wrapped in `BEGIN ... COMMIT`, followed by Section 8 verification queries).**
2. **Re-seed test vendor (Staging ONLY):**
   ```bash
   node --v8-pool-size=1 --liftoff-only --expose-gc --import "<ts-resolve.mjs>" scripts/seed-staging-vendor.ts
   ```

---

## Step 3 — Verification Queries & Expected Output

Run these 6 read-only verification queries in the target **Supabase SQL Editor** and confirm **every single assertion** matches:

### 3.1 Tables & Forced RLS (Expected: **16 rows**, all `true`)

```sql
SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
```

**Expected Output (16 rows):**
`admin_audit_log`, `buyer_phone_verifications`, `deposits`, `dispute_resolutions`, `market_waitlist`, `order_evidence_files`, `rate_limit_buckets`, `risk_flags`, `system_settings`, `transaction_ledger`, `transactions`, `vendors`, `webhook_events`, `whatsapp_do_not_contact`, `whatsapp_message_log`, `whatsapp_webhook_events` — every row has `rls_enabled = true` and `rls_forced = true`.

### 3.2 Functions & Exact Signatures (Expected: **12 rows**)

```sql
SELECT
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef AS security_definer,
    p.proconfig AS search_path_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, identity_args;
```

**Expected Output (12 rows):**
1. `handle_updated_at()` (`security_definer = false`)
2. `prevent_ledger_modification()` (`security_definer = false`)
3. `rpc_admin_clear_risk_hold(p_transaction_id uuid, p_admin_email text, p_reason text, p_unblock boolean, p_ip_address text)` (`security_definer = true`)
4. `rpc_admin_finalize_dispute_resolution(...)` (14 args, `security_definer = true`)
5. `rpc_admin_prepare_dispute_resolution(...)` (8 args, `security_definer = true`)
6. `rpc_admin_unlock_transaction(p_transaction_id uuid, p_admin_email text, p_reason text, p_ip_address text)` (`security_definer = true`)
7. `rpc_check_rate_limit(p_key text, p_limit integer, p_window_ms bigint)` (`security_definer = true`)
8. `rpc_finalize_release_step(p_transaction_id uuid, p_step text, p_transfer_id text, p_idempotency_key text)` (`security_definer = true`)
9. `rpc_process_webhook_deposit(p_event_id text, p_event_type text, p_account_number text, p_amount_naira numeric, p_metadata_tx_id uuid, p_payload jsonb)` (`security_definer = true`)
10. `rpc_raise_dispute_with_lock(p_transaction_id uuid, p_raised_by text, p_scenario_id integer, p_reason text, p_response_deadline_at timestamp with time zone)` (`security_definer = true`)
11. `rpc_verify_and_prepare_release(p_transaction_id uuid, p_hmac_hash text, p_max_attempts integer, p_cooling_hours integer)` (`security_definer = true`)
12. `update_modified_column()` (`security_definer = false`)

### 3.3 Plaintext & Legacy KYC PII Column Absence Check (Expected: **0 rows**)

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN (
      'release_code',
      'buyer_email',
      'date_of_birth',
      'gender',
      'business_address',
      'id_type',
      'id_number',
      'bvn',
      'nin'
  )
ORDER BY table_name, column_name;
```

**Expected Output:** `0 rows`.

### 3.4 RLS Policies Check (Expected: **16 rows**)

```sql
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Expected Output (16 rows):** Each of the 16 tables has 1 policy `Strict Restrictive Deny All on <table_name>`, `permissive = 'RESTRICTIVE'`, `roles = '{anon,authenticated}'`, `cmd = 'ALL'`, `qual = 'false'`, `with_check = 'false'`.

### 3.5 Grants Verification for `anon`, `authenticated`, and `PUBLIC` (Expected: **0 rows** & all **`false`**)

```sql
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY routine_name, grantee, privilege_type;

SELECT
    c.relname AS table_name,
    has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
    has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
    has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
    has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
    has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
    has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
    has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
    has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
    has_table_privilege('PUBLIC', c.oid, 'SELECT') AS public_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

SELECT
    p.proname AS function_name,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
    has_function_privilege('PUBLIC', p.oid, 'EXECUTE') AS public_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;
```

### 3.6 Runtime `system_settings` Seeds Check (Expected: **19 rows**)

```sql
SELECT key, value, updated_by
FROM public.system_settings
ORDER BY key;
```

---

## Step 4 — Rollback Procedures

1. **Failed SQL Editor Run:** Both `FULL-SCHEMA-FROM-SCRATCH.sql` and `STAGING-ADDITIONS.sql` wrap all DDL/DML inside `BEGIN ... COMMIT` (automatic `ROLLBACK` on error).
2. **Emergency Runtime Kill-Switches (Zero Downtime):**
   ```sql
   BEGIN;
   UPDATE public.system_settings
   SET value = 'false'::jsonb, updated_at = timezone('utc'::text, now()), updated_by = 'incident_rollback'
   WHERE key IN ('checkout_enabled', 'payouts_enabled');

   UPDATE public.system_settings
   SET value = 'true'::jsonb, updated_at = timezone('utc'::text, now()), updated_by = 'incident_rollback'
   WHERE key = 'vendor_allowlist_mode';
   COMMIT;
   ```
3. **Full Pre-Traffic Fresh Schema Teardown (ONLY on Empty/Throwaway DB Before Live Traffic):**
   ```sql
   BEGIN;
   DROP FUNCTION IF EXISTS public.rpc_check_rate_limit CASCADE;
   DROP FUNCTION IF EXISTS public.rpc_raise_dispute_with_lock CASCADE;
   DROP FUNCTION IF EXISTS public.rpc_admin_finalize_dispute_resolution CASCADE;
   DROP FUNCTION IF EXISTS public.rpc_admin_prepare_dispute_resolution CASCADE;
   DROP FUNCTION IF EXISTS public.rpc_admin_unlock_transaction CASCADE;
   DROP FUNCTION IF EXISTS public.rpc_admin_clear_risk_hold CASCADE;
   DROP FUNCTION IF EXISTS public.rpc_process_webhook_deposit CASCADE;
   DROP FUNCTION IF EXISTS public.rpc_finalize_release_step CASCADE;
   DROP FUNCTION IF EXISTS public.rpc_verify_and_prepare_release CASCADE;
   DROP FUNCTION IF EXISTS public.prevent_ledger_modification CASCADE;
   DROP FUNCTION IF EXISTS public.handle_updated_at CASCADE;
   DROP FUNCTION IF EXISTS public.update_modified_column CASCADE;

   DROP TABLE IF EXISTS public.rate_limit_buckets CASCADE;
   DROP TABLE IF EXISTS public.order_evidence_files CASCADE;
   DROP TABLE IF EXISTS public.risk_flags CASCADE;
   DROP TABLE IF EXISTS public.market_waitlist CASCADE;
   DROP TABLE IF EXISTS public.whatsapp_webhook_events CASCADE;
   DROP TABLE IF EXISTS public.whatsapp_message_log CASCADE;
   DROP TABLE IF EXISTS public.whatsapp_do_not_contact CASCADE;
   DROP TABLE IF EXISTS public.admin_audit_log CASCADE;
   DROP TABLE IF EXISTS public.system_settings CASCADE;
   DROP TABLE IF EXISTS public.dispute_resolutions CASCADE;
   DROP TABLE IF EXISTS public.transaction_ledger CASCADE;
   DROP TABLE IF EXISTS public.webhook_events CASCADE;
   DROP TABLE IF EXISTS public.deposits CASCADE;
   DROP TABLE IF EXISTS public.buyer_phone_verifications CASCADE;
   DROP TABLE IF EXISTS public.transactions CASCADE;
   DROP TABLE IF EXISTS public.vendors CASCADE;

   DROP TYPE IF EXISTS public.kyc_status CASCADE;
   DROP TYPE IF EXISTS public.vendor_kyc_status CASCADE;
   COMMIT;
   ```
