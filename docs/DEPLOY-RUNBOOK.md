# Relyvora Deployment & Database Migration Runbook

This runbook defines the exact execution sequence for deploying Relyvora to **Staging first** and **Production second**, applying the hardened Supabase SQL migrations, verifying zero public database privileges, running automated staging verification suites, and performing an emergency rollback.

---

## 1. Pre-Flight Requirements

1. Ensure the target environment variables in [ENVIRONMENTS.md](ENVIRONMENTS.md) are configured.
2. Confirm Supabase Auth settings in the target project (**Authentication -> Providers / Sign In / Security**):
   - Disable open email self-signups (`Allow new users to sign up = OFF` for admin portal or restrict admin invite-only).
   - Enable email confirmation (`Confirm email = ON`).
   - Enable TOTP MFA and require **AAL2** for admin accounts (`app_metadata.role = 'admin'` set solely via `service_role`, plus user UUID listed in `ADMIN_USER_IDS`).
3. Confirm Resend sender domain (`relyvora.com`) is verified with SPF, DKIM, and DMARC records (used for ops `ALERT_EMAIL`, `support@relyvora.com`, and Supabase Auth Custom SMTP `no-reply@relyvora.com`).
4. Confirm Meta WhatsApp Cloud API credentials (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`) and approved templates (`payment_link_v1`, `release_code_v1`, `verification_otp_v1`).
5. Confirm permanent alias `staging.relyvora.com` points to the staging deployment so Meta's staging webhook callback URL stays fixed.

---

## 2. Fresh-Database Setup From Scratch (Empty Supabase Project)

Use [docs/FULL-SCHEMA-FROM-SCRATCH.sql](FULL-SCHEMA-FROM-SCRATCH.sql) whenever initializing a brand-new empty Supabase project (for example a new Staging, Throwaway Verification, or clean Production project). Do **not** run incremental legacy patches first when starting from zero.

### Numbered Execution Sequence (Empty Project)
1. **Confirm Supabase Auth & Custom SMTP Settings:**
   - In **Authentication -> Providers**, keep Google OAuth disabled and enable Email login.
   - In **Authentication -> Settings**, set **Allow new users to sign up = OFF** once the initial admin/vendor accounts exist, enable **Confirm email = ON**, and enable TOTP MFA (AAL2 required by `lib/adminAuth.ts`).
   - Configure **Custom SMTP** under `relyvora.com` (`no-reply@relyvora.com`).
2. **Execute [docs/FULL-SCHEMA-FROM-SCRATCH.sql](FULL-SCHEMA-FROM-SCRATCH.sql) inside `BEGIN; ... COMMIT;`:**
   - Paste the entire file into the **Supabase SQL Editor** and run it once. It executes in strict topological dependency order:
     1. Extensions (`pgcrypto`, `uuid-ossp`) and ENUM types (`public.vendor_kyc_status`, `public.kyc_status` with labels `'pending'`, `'submitted'`, `'verified'`, `'rejected'`).
     2. Hardened trigger functions (`public.update_modified_column()`, `public.handle_updated_at()`, `public.prevent_ledger_modification()`).
     3. All **13 tables** (`vendors`, `transactions`, `buyer_phone_verifications`, `deposits`, `webhook_events`, `transaction_ledger`, `dispute_resolutions`, `system_settings`, `admin_audit_log`, `whatsapp_do_not_contact`, `whatsapp_message_log`, `whatsapp_webhook_events`, `market_waitlist`).
     4. All triggers (`update_*_modtime` using `update_modified_column()`, plus `trg_prevent_ledger_mutation` and `trg_prevent_ledger_truncate`).
     5. All indexes across transactions, vendor allowlist/KYC, WhatsApp logs, verifications, deposits, and ledger.
     6. Runtime `public.system_settings` seeds (`checkout_enabled = true`, `max_order_ngn = null`, `max_daily_vendor_volume_ngn = null`, `vendor_allowlist_mode = true`, `max_daily_vendor_whatsapp_messages = 50`, `max_daily_buyer_whatsapp_messages = 5`).
     7. All **6 RPC functions** (`rpc_verify_and_prepare_release`, `rpc_finalize_release_step`, `rpc_process_webhook_deposit`, `rpc_admin_unlock_transaction`, `rpc_admin_prepare_dispute_resolution`, `rpc_admin_finalize_dispute_resolution`).
     8. `ENABLE` + `FORCE ROW LEVEL SECURITY`, explicit `RESTRICTIVE` deny-all policies (`TO anon, authenticated`), `REVOKE ALL` from `PUBLIC, anon, authenticated`, `GRANT ALL` solely to `service_role, postgres`, and `ALTER DEFAULT PRIVILEGES` lockdown.
3. **Inspect the Built-In Grants & Security Verification Output (Section 9 of `FULL-SCHEMA-FROM-SCRATCH.sql`):**
   - `information_schema.table_privileges` for `anon`, `authenticated`, `PUBLIC`: **0 rows**.
   - `information_schema.routine_privileges` for `anon`, `authenticated`, `PUBLIC`: **0 rows**.
   - `has_table_privilege` matrix for `anon` and `authenticated`: **all `false`**, `rls_enabled = true`, `rls_forced = true` across all 13 tables.
   - `has_function_privilege` matrix for `anon` and `authenticated`: **all `false`** across all `rpc_*` and trigger functions (`service_role_execute = true`).
4. **Provision the Admin Account (`app_metadata.role = 'admin'`):**
   - Create the admin user in **Authentication -> Users**, enroll TOTP MFA, and execute [docs/ADMIN-SETUP-PROD.sql](ADMIN-SETUP-PROD.sql) in the SQL Editor (replacing `<YOUR_ADMIN_EMAIL>`).
   - Add the returned UUID `id` to the server-only `ADMIN_USER_IDS` environment variable (never `NEXT_PUBLIC_`).
5. **Seed Staging Test Data Safely (Staging Only — Never Production):**
   - Point `.env.local` exclusively at Staging (`bepvqjqjybhhpsfbblqk.supabase.co`), never Production, and run `npx tsx scripts/seed-staging-vendor.ts`. The script validates `assertStagingTarget(...)` and aborts if `NODE_ENV=production`, `PAYMENTS_MODE=live`, or any production URL is detected.

---

## 3. Stage 1 — Incremental Staging Migration (`bepvqjqjybhhpsfbblqk.supabase.co`)

> **CRITICAL:** Never run staging seeds or test scripts against the Production Supabase project.

### Step 3.2 Apply SQL Migrations on Staging (Exact Order)
Open the **Staging Supabase SQL Editor** and execute each script completely. Both scripts are wrapped in `BEGIN; ... COMMIT;` and are idempotent:

1. **Migration 1:** [docs/PHASE-G1.5-RLS-v3.sql](PHASE-G1.5-RLS-v3.sql)
   - Creates `transaction_ledger`, `dispute_resolutions`, `deposits`, `system_settings`, `admin_audit_log`, `buyer_phone_verifications`, `market_waitlist`.
   - Seeds `system_settings` with `checkout_enabled = true`, `vendor_allowlist_mode = true`, `max_order_ngn = null`, and `max_daily_vendor_volume_ngn = null`.
   - Drops legacy plaintext `release_code` and `release_code_salt` columns.
   - Enables RLS + restrictive deny-all policies (`TO anon, authenticated`) across core tables and revokes all table/function privileges from `anon`, `authenticated`, and `PUBLIC`.
   - Creates `rpc_verify_and_prepare_release`, `rpc_finalize_release_step`, `rpc_process_webhook_deposit`, and `rpc_admin_unlock_transaction`.
2. **Migration 2:** [docs/PHASE-G2.5-ADMIN-RPC-v2.sql](PHASE-G2.5-ADMIN-RPC-v2.sql)
   - Aligns columns on `transactions`, `dispute_resolutions`, and `deposits` (`sender_account_number`, `sender_bank_code`, `sender_name`), drops `buyer_email`, and adds WhatsApp verification/delivery columns (`buyer_whatsapp_consent`, `buyer_phone_verified`, `buyer_phone_verified_at`, `whatsapp_message_id`, `whatsapp_delivery_status`, `whatsapp_blocked`).
   - Creates locked-down tables: `whatsapp_do_not_contact`, `whatsapp_message_log`, `whatsapp_webhook_events`, `buyer_phone_verifications`, `market_waitlist` (RLS enabled + forced, restrictive deny-all policies, `REVOKE ALL FROM PUBLIC, anon, authenticated`) plus `update_modified_column()`.
   - Seeds WhatsApp daily rate limits (`max_daily_vendor_whatsapp_messages = 50`, `max_daily_buyer_whatsapp_messages = 5`).
   - Adds `'RESOLVING'` to `transactions_status_check`.
   - Creates two-phase dispute RPCs `rpc_admin_prepare_dispute_resolution` and `rpc_admin_finalize_dispute_resolution`.
   - Updates `rpc_process_webhook_deposit` to capture verified sender account details, enforce metadata/account cross-validation, and record `'LATE_DEPOSIT'` / `'EXCESS_DEPOSIT'` while preserving closed/disputed transaction statuses.

If staging previously ran an earlier seed with numeric caps (`50000` / `250000`), reset the cap rows to uncapped defaults (`null`) or run the staging seed script:

```sql
UPDATE public.system_settings
SET value = 'null'::jsonb, updated_by = 'release_candidate_reset', updated_at = timezone('utc'::text, now())
WHERE key IN ('max_order_ngn', 'max_daily_vendor_volume_ngn');
```

### Step 3.3 Run Verification Queries on Staging
Execute all 4 verification queries in the **Staging SQL Editor**:

```sql
-- 1. Routine privileges for anon / authenticated / PUBLIC (Expected: 0 rows)
SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');

-- 2. Table privileges for anon / authenticated / PUBLIC (Expected: 0 rows)
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN (
    'transactions', 'vendors', 'webhook_events', 'transaction_ledger',
    'dispute_resolutions', 'deposits', 'system_settings', 'admin_audit_log',
    'whatsapp_do_not_contact', 'whatsapp_message_log', 'whatsapp_webhook_events',
    'buyer_phone_verifications', 'market_waitlist'
  )
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');

-- 3. Restrictive deny-all RLS policies active (Expected: 13 rows, permissive = 'RESTRICTIVE')
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- 4. Runtime safety settings check (Expected: max_order_ngn = null, max_daily_vendor_volume_ngn = null)
SELECT key, value, updated_by, updated_at
FROM public.system_settings
ORDER BY key;
```

### Step 3.4 Seed Staging & Run Automated Verification Suite
Run from your local workspace pointing `.env.local` at the staging Supabase project:

```bash
# 1. Seed verified staging vendor & null cap defaults (refuses production URLs)
npx tsx scripts/seed-staging-vendor.ts

# 2. Run all automated verification suites against staging
npx tsx tests/fresh-schema-from-scratch.test.ts
npx tsx tests/phase-g1.5-v3.test.ts
npx tsx tests/staging-rpc-rls-denial.test.ts
npx tsx tests/phase-g2.test.ts
npx tsx tests/phase-g2.5.test.ts
npx tsx tests/reskin-ui-invariance.test.ts
npx tsx tests/release-candidate.test.ts

# 3. Verify legal pages wording invariance & production build
node scripts/verify-legal-diff.mjs
npm run build
```

---

## 4. Production Deployment

> **STOP GATE:** Proceed to Production ONLY after `release-candidate` has been reviewed, merged into `go-live-prod` -> `main`, and all Staging & Fresh-Schema checks have passed.

### Step 4.1 Apply Database Schema on Production
- **If Production is a brand-new empty Supabase project:** Execute [docs/FULL-SCHEMA-FROM-SCRATCH.sql](FULL-SCHEMA-FROM-SCRATCH.sql) once in the **Production Supabase SQL Editor** and verify Section 9 outputs zero `anon`/`authenticated`/`PUBLIC` privileges across all 13 tables and all functions.
- **If upgrading an existing populated Production database incrementally:**
  1. Deploy the release application bundle to Vercel first (it never queries legacy `release_code`, `release_code_salt`, or `buyer_email`) with `PAYMENTS_MODE=live` and `CHECKOUT_ENABLED=false`.
  2. Verify all required Production server-only environment variables are set (see [ENVIRONMENTS.md](ENVIRONMENTS.md)).
  3. Execute [docs/PHASE-G1.5-RLS-v3.sql](PHASE-G1.5-RLS-v3.sql) followed by [docs/PHASE-G2.5-ADMIN-RPC-v2.sql](PHASE-G2.5-ADMIN-RPC-v2.sql) in the **Production Supabase SQL Editor**.
- Re-run all 4 verification queries from **Section 3** in Production and verify:
  - Query 1 returns **0 rows**
  - Query 2 returns **0 rows**
  - Query 3 confirms restrictive deny-all policies on all **13 tables**
  - Query 4 confirms `max_order_ngn = null`, `max_daily_vendor_volume_ngn = null`, `vendor_allowlist_mode = true`, `max_daily_vendor_whatsapp_messages = 50`, `max_daily_buyer_whatsapp_messages = 5`

### Step 4.2 Mark Admin User (`app_metadata.role = 'admin'`)
Execute [docs/ADMIN-SETUP-PROD.sql](ADMIN-SETUP-PROD.sql) in the **Production Supabase SQL Editor** after enrolling TOTP MFA on your admin account, and add the returned `id` to `ADMIN_USER_IDS` in Vercel.

### Step 4.3 Enable Production Checkout & Verify Allowlist
1. Add only KYC-verified, Anchor-provisioned pilot vendors with `is_allowlisted = true` in `public.vendors`.
2. Flip `checkout_enabled = 'true'::jsonb` in `public.system_settings` (or ensure `CHECKOUT_ENABLED=true` in Vercel).
3. Verify `/api/escrow/confirm-payment` and `/api/vendors/onboard` return HTTP `403`.
4. Execute one end-to-end ₦1,000 live pilot transfer: WhatsApp link confirmation (`"Confirm this is me"`) -> Anchor virtual NUBAN transfer -> webhook WhatsApp release code delivery -> delivery release verification.

---

## 5. Emergency Rollback Procedure

### Instant Kill Switch (No Redeploy Required, < 5 Seconds)
To halt all new checkout link creation and payment confirmations immediately without touching code or migrations:

```sql
UPDATE public.system_settings
SET value = 'false'::jsonb, updated_by = 'emergency_rollback', updated_at = timezone('utc'::text, now())
WHERE key = 'checkout_enabled';
```

To restore temporary caps immediately without a deploy:

```sql
UPDATE public.system_settings
SET value = '50000'::jsonb, updated_by = 'emergency_cap', updated_at = timezone('utc'::text, now())
WHERE key = 'max_order_ngn';
```

### Application Deployment Rollback
1. In **Vercel Dashboard -> Deployments**, promote the immediately prior healthy Production deployment to **Production**.
2. Keep `checkout_enabled = false` until incident telemetry and `/api/admin/reconciliation` confirm zero stuck funds.

### Database Schema Compatibility Notes
- `PHASE-G1.5-RLS-v3.sql` drops legacy columns `release_code` and `release_code_salt`. Only if rolling back to legacy pre-G1.5 code (not recommended for production), re-add nullable columns manually per the rollback header in `PHASE-G1.5-RLS-v3.sql`.
- `PHASE-G2.5-ADMIN-RPC-v2.sql` only adds columns/constraints (`ADD COLUMN IF NOT EXISTS`), drops legacy `buyer_email`, adds `whatsapp_do_not_contact`, `whatsapp_message_log`, and `whatsapp_webhook_events`, and replaces `rpc_*` functions cleanly inside a single `BEGIN; ... COMMIT;` transaction.

---

## 6. Meta WhatsApp Cloud API Setup & Approved Templates

### 6.1 Webhook Registration Checklist
1. **Staging Webhook URL:** `https://staging.relyvora.com/api/webhooks/whatsapp` (requires permanent Vercel custom alias `staging.relyvora.com`).
2. **Production Webhook URL:** `https://ng.relyvora.com/api/webhooks/whatsapp`.
3. **Verify Token:** Set identical `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Meta App Dashboard and Vercel environment variables.
4. **App Secret:** Set `WHATSAPP_APP_SECRET` in Vercel (`X-Hub-Signature-256` verification rejects unauthenticated webhook requests with HTTP `401`).
5. **Subscribed Webhook Fields:** Subscribe exclusively to `messages` (`entry[].changes[].value.messages` and `statuses`).
6. **Staging Test Recipients:** Register up to 5 test phone numbers in Meta WhatsApp API Setup and mirror them in `WHATSAPP_ALLOWED_RECIPIENTS` on Staging.

### 5.2 Exact Template Submissions (`UTILITY`, Language `en`)

1. **`payment_link_v1`** (Category: `UTILITY`, Language: `en`)
   - **Body:**
     `Hello, {{1}} created a Relyvora escrow payment link for *{{2}}* (Total: *{{3}}*). Funds are held in escrow until you inspect the delivery and give the rider your 6-digit release code.\n\nPlease confirm below that you requested this link to view the bank transfer details, or tap 'Not me' if you did not request this order.`
   - **Variables:** `{{1}}` = Vendor display name, `{{2}}` = Item name, `{{3}}` = Formatted NGN amount (`₦43,260`).
   - **Buttons:**
     - Quick Reply 1: `Confirm this is me`
     - Quick Reply 2: `Not me`
     - Call-to-Action URL: `View Payment Link` (`https://ng.relyvora.com/pay/{{1}}` dynamic suffix `<transaction_id>`; Staging can register `https://staging.relyvora.com/pay/{{1}}`)

2. **`release_code_v1`** (Category: `UTILITY`, Language: `en`)
   - **Body:**
     `Your payment for *{{1}}* ({{2}}) is locked in Relyvora escrow.\n\nYour 6-digit delivery release code is: *{{3}}*\n\nGive this code to the dispatch rider ONLY after you inspect and accept the item. Never share this code with the vendor before delivery.`
   - **Variables:** `{{1}}` = Item name, `{{2}}` = Vendor display name, `{{3}}` = 6-digit release code.

3. **`verification_otp_v1`** (Category: `UTILITY`, Language: `en`)
   - **Body:**
     `{{1}} is your Relyvora verification code for {{2}}. This code expires in 10 minutes. Do not share it with anyone.`
   - **Variables:** `{{1}}` = 6-digit one-time OTP, `{{2}}` = Action description (`freezing your escrow order` or `reissuing your release code`).
