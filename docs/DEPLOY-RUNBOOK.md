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

## 2. Stage 1 — Staging Deployment (`bepvqjqjybhhpsfbblqk.supabase.co`)

> **CRITICAL:** Never run staging seeds or test scripts against the Production Supabase project.

### Step 2.1 Apply SQL Migrations on Staging (Exact Order)
Open the **Staging Supabase SQL Editor** and execute each script completely. Both scripts are wrapped in `BEGIN; ... COMMIT;` and are idempotent:

1. **Migration 1:** [docs/PHASE-G1.5-RLS-v3.sql](PHASE-G1.5-RLS-v3.sql)
   - Creates `transaction_ledger`, `dispute_resolutions`, `deposits`, `system_settings`, `admin_audit_log`.
   - Seeds `system_settings` with `checkout_enabled = true`, `vendor_allowlist_mode = true`, `max_order_ngn = null`, and `max_daily_vendor_volume_ngn = null`.
   - Drops legacy plaintext `release_code` and `release_code_salt` columns.
   - Enables RLS + restrictive deny-all policies (`TO anon, authenticated`) across all 8 public tables and revokes all table/function privileges from `anon`, `authenticated`, and `PUBLIC`.
   - Creates `rpc_verify_and_prepare_release`, `rpc_finalize_release_step`, `rpc_process_webhook_deposit`, and `rpc_admin_unlock_transaction`.
2. **Migration 2:** [docs/PHASE-G2.5-ADMIN-RPC-v2.sql](PHASE-G2.5-ADMIN-RPC-v2.sql)
   - Aligns columns on `transactions`, `dispute_resolutions`, and `deposits` (`sender_account_number`, `sender_bank_code`, `sender_name`), drops `buyer_email`, and adds WhatsApp verification/delivery columns (`buyer_whatsapp_consent`, `buyer_phone_verified`, `buyer_phone_verified_at`, `whatsapp_message_id`, `whatsapp_delivery_status`, `whatsapp_blocked`).
   - Creates locked-down WhatsApp tables: `whatsapp_do_not_contact`, `whatsapp_message_log`, `whatsapp_webhook_events` (RLS + restrictive deny-all policies + `REVOKE ALL FROM PUBLIC, anon, authenticated`).
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

### Step 2.2 Run Verification Queries on Staging
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
    'whatsapp_do_not_contact', 'whatsapp_message_log', 'whatsapp_webhook_events'
  )
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');

-- 3. Restrictive deny-all RLS policies active (Expected: 11 rows, permissive = 'RESTRICTIVE')
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- 4. Runtime safety settings check (Expected: max_order_ngn = null, max_daily_vendor_volume_ngn = null)
SELECT key, value, updated_by, updated_at
FROM public.system_settings
ORDER BY key;
```

### Step 2.3 Seed Staging & Run Automated Verification Suite
Run from your local workspace pointing `.env.local` at the staging Supabase project:

```bash
# 1. Seed verified staging vendor & null cap defaults (refuses production URLs)
npx tsx scripts/seed-staging-vendor.ts

# 2. Run all automated verification suites against staging
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

## 3. Stage 2 — Production Deployment

> **STOP GATE:** Proceed to Production ONLY after `release-candidate` has been reviewed, merged into `go-live-prod` -> `main`, and all Staging checks in Section 2 have passed.

### Step 3.1 Pre-Deploy App Code First (Zero-Downtime Column Removal Ordering)
1. Deploy the release application bundle (which never references legacy plaintext `release_code` or `release_code_salt` columns) to Vercel **with `PAYMENTS_MODE=live` and `CHECKOUT_ENABLED=false` initially** if migrating from an older schema.
2. Verify all required Production server-only environment variables are set (see [ENVIRONMENTS.md](ENVIRONMENTS.md)).

### Step 3.2 Apply SQL Migrations on Production
Execute in the **Production Supabase SQL Editor** in exact order:
1. [docs/PHASE-G1.5-RLS-v3.sql](PHASE-G1.5-RLS-v3.sql)
2. [docs/PHASE-G2.5-ADMIN-RPC-v2.sql](PHASE-G2.5-ADMIN-RPC-v2.sql)

Re-run all 4 verification queries from **Step 2.2** in Production and verify:
- Query 1 returns **0 rows**
- Query 2 returns **0 rows**
- Query 3 confirms restrictive deny-all policies on all **11 tables**
- Query 4 confirms `max_order_ngn = null`, `max_daily_vendor_volume_ngn = null`, `vendor_allowlist_mode = true`, `max_daily_vendor_whatsapp_messages = 50`, `max_daily_buyer_whatsapp_messages = 5`

### Step 3.3 Enable Production Checkout & Verify Allowlist
1. Add only KYC-verified, Anchor-provisioned pilot vendors with `is_allowlisted = true` in `public.vendors`.
2. Flip `checkout_enabled = 'true'::jsonb` in `public.system_settings` (or ensure `CHECKOUT_ENABLED=true` in Vercel).
3. Verify `/api/escrow/confirm-payment` and `/api/vendors/onboard` return HTTP `403`.
4. Execute one end-to-end ₦1,000 live pilot transfer: WhatsApp link confirmation (`"Confirm this is me"`) -> Anchor virtual NUBAN transfer -> webhook WhatsApp release code delivery -> delivery release verification.

---

## 4. Emergency Rollback Procedure

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

## 5. Meta WhatsApp Cloud API Setup & Approved Templates

### 5.1 Webhook Registration Checklist
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
