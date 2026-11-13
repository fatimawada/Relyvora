# Relyvora Environment Variable Reference

This document lists every environment variable used across **Preview / Local**, **Staging (`staging.relyvora.com`)**, and **Production (`ng.relyvora.com`)**, along with visibility scopes, Meta WhatsApp Cloud API setup, Supabase Custom SMTP setup, and strict secret-hygiene rules.

---

## 1. Secret Hygiene Policy (`NEXT_PUBLIC_*` Audit)

- **ZERO secrets may ever use a `NEXT_PUBLIC_` prefix.** Variables prefixed with `NEXT_PUBLIC_` are inlined into client-side browser bundles at build time.
- Every API key, signing secret, webhook HMAC secret, cryptographic pepper, cron secret, service-role credential, and admin allowlist is strictly server-only.
- Below is the complete audit of every `NEXT_PUBLIC_*` key accepted by the codebase:

| Variable | Classification | Allowed in Client Bundle? | Justification |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public identifier | Yes | Public Supabase project REST endpoint; all tables & RPCs deny `anon`/`authenticated` access via RLS and `REVOKE`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client JWT | Yes | Public `anon` key intentionally restricted to zero table/RPC permissions on Relyvora tables and auth session cookies via `@supabase/ssr`. |
| `NEXT_PUBLIC_APP_URL` | Public origin URL | Yes | Canonical base URL (`https://staging.relyvora.com` on Staging, `https://ng.relyvora.com` on Production) used to generate WhatsApp `payment_link_v1` dynamic URL buttons. |
| `NEXT_PUBLIC_PAYMENTS_MODE` | Non-secret UI mode flag | Yes | `'sandbox'` or `'live'` UI display gate (e.g., hiding sandbox demo modal/pills in live mode). Server routes enforce `process.env.PAYMENTS_MODE` independently. |
| `NEXT_PUBLIC_ANCHOR_BRAND_APPROVED` | Non-secret fallback flag | Optional (`ANCHOR_BRAND_APPROVED` preferred) | Controls visibility/blurring of co-branding copy; boolean `'false'`/`'true'`. |
| `NEXT_PUBLIC_LAUNCH_STATUS` | Non-secret fallback flag | Optional (`LAUNCH_STATUS` preferred) | Controls `'launching'` vs `'live'` badge on corporate marketing pages. |
| `NEXT_PUBLIC_CHECKOUT_ENABLED` | Non-secret client fallback | Optional (`CHECKOUT_ENABLED` + DB `system_settings` authoritative) | Optional UI flag fallback; server routes always query `isCheckoutEnabledServer()`. |
| `NEXT_PUBLIC_MAX_ORDER_NGN` | Non-secret client fallback | Optional (`MAX_ORDER_NGN` + DB `system_settings` authoritative) | Optional UI helper; defaults to `null` (no cap). |

> **Audit Conclusion:** All `NEXT_PUBLIC_*` identifiers are non-secret configuration values or intentionally restricted public Supabase endpoints. No secret key exists in any `NEXT_PUBLIC_*` variable.

---

## 2. Hosting Aliases & Webhook Stability

- **Staging Alias (`staging.relyvora.com`):** Bind the permanent custom domain `staging.relyvora.com` in Vercel to the staging environment/branch (`go-live-prod` / `release-candidate`). Meta WhatsApp Cloud API webhooks require a stable HTTPS URL (`https://staging.relyvora.com/api/webhooks/whatsapp`) that does not rotate across preview deployments.
- **Production Domain (`ng.relyvora.com`):** Meta production webhook points to `https://ng.relyvora.com/api/webhooks/whatsapp`.

---

## 3. Complete Environment Matrix

### 3.1 Supabase & Database Access

| Variable | Scope | Preview / Local (`.env.local`) | Staging (`staging.relyvora.com` / `bepvqjqjybhhpsfbblqk`) | Production (`ng.relyvora.com`) |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client & Server | `https://bepvqjqjybhhpsfbblqk.supabase.co` | `https://bepvqjqjybhhpsfbblqk.supabase.co` | Production Supabase URL (`https://<prod-ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client & Server | Staging anon JWT | Staging anon JWT | Production anon JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only SECRET** | Staging `service_role` JWT | Staging `service_role` JWT | Production `service_role` JWT |
| `NEXT_PUBLIC_APP_URL` | Client & Server | `http://localhost:3000` (or preview URL) | `https://staging.relyvora.com` | `https://ng.relyvora.com` |

### 3.2 Payments Mode, Feature Flags & Safety Overrides

| Variable | Scope | Preview / Local | Staging (`staging.relyvora.com`) | Production (`ng.relyvora.com`) |
| :--- | :--- | :--- | :--- | :--- |
| `PAYMENTS_MODE` | Server-only config | `sandbox` | `sandbox` (or `live` when testing Anchor webhook flow) | `live` |
| `NEXT_PUBLIC_PAYMENTS_MODE` | Client & Server UI | `sandbox` | `sandbox` (match `PAYMENTS_MODE`) | `live` |
| `ANCHOR_BRAND_APPROVED` | Build / Server (`next.config.mjs`) | `false` | `false` | `false` (flip to `true` only after written co-branding approval from Anchor) |
| `LAUNCH_STATUS` | Build / Server (`next.config.mjs`) | `launching` | `launching` | `launching` (flip to `live` on public GA launch) |
| `CHECKOUT_ENABLED` | Server config | `true` | `true` | `true` (overridden instantly by `public.system_settings.checkout_enabled`) |
| `MAX_ORDER_NGN` | Server config | Unset (`null` = no cap) | Unset (`null` = no cap) | Unset (`null` = no cap; override via `system_settings` if needed) |
| `MAX_DAILY_VENDOR_VOLUME_NGN` | Server config | Unset (`null` = no cap) | Unset (`null` = no cap) | Unset (`null` = no cap; override via `system_settings` if needed) |
| `VENDOR_ALLOWLIST` | Server config | Optional CSV of test handles | Optional CSV (DB `vendors.is_allowlisted` preferred) | Empty or CSV supplement to `vendors.is_allowlisted` |

### 3.3 Anchor BaaS (Banking & Webhook Verification)

| Variable | Scope | Preview / Local | Staging (`staging.relyvora.com`) | Production (`ng.relyvora.com`) |
| :--- | :--- | :--- | :--- | :--- |
| `ANCHOR_SECRET_KEY` | **Server-only SECRET** | Anchor sandbox secret key | Anchor sandbox secret key | Anchor production secret key |
| `ANCHOR_BASE_URL` | Server config | `https://api.sandbox.getanchor.co/api/v1` | `https://api.sandbox.getanchor.co/api/v1` | `https://api.getanchor.co/api/v1` |
| `ANCHOR_WEBHOOK_SECRET` | **Server-only SECRET** | Anchor sandbox webhook HMAC secret | Anchor sandbox webhook HMAC secret (**required**) | Anchor production webhook HMAC secret (**strictly required**) |

### 3.4 Cryptography, Admin Auth & Scheduled Jobs

| Variable | Scope | Preview / Local | Staging (`staging.relyvora.com`) | Production (`ng.relyvora.com`) |
| :--- | :--- | :--- | :--- | :--- |
| `RELEASE_CODE_PEPPER` | **Server-only SECRET** | 32+ byte random hex string | 32+ byte random hex string (**distinct from prod**) | 64+ char CSPRNG hex secret (**strictly required**) |
| `WHATSAPP_PHONE_PEPPER` | **Server-only SECRET** | Optional (falls back to `RELEASE_CODE_PEPPER`) | Distinct HMAC key for DNC/log phone hashes | Distinct high-entropy HMAC key for DNC/log phone hashes |
| `ADMIN_USER_IDS` | **Server-only SECRET** | Comma-separated Staging Admin UUIDs | Staging Admin Supabase User UUIDs | Production Admin Supabase User UUIDs (verified email, MFA AAL2, `app_metadata.role='admin'`) |
| `ADMIN_SECRET_KEY` | **Server-only SECRET** | Optional CLI/automation secret | Distinct random staging secret | High-entropy random secret for admin server automation |
| `ADMIN_API_KEY` | **Server-only SECRET** | Optional reissue Bearer secret | Distinct random staging secret | High-entropy random secret for admin code reissue (`POST /api/escrow/reissue-code`) |
| `CRON_SECRET` | **Server-only SECRET** | Random dev secret | Distinct random staging secret | Vercel Cron `Authorization: Bearer <CRON_SECRET>` secret protecting `/api/cron/reconcile` |

### 3.5 Meta WhatsApp Cloud API (Buyer Payment Links, Verification, Release Codes & OTPs)

- **Buyers use WhatsApp only.** Buyer email fields and email receipts are permanently removed.
- **Staging** uses Meta's sandbox/test WhatsApp number and an explicit list of up to 5 allowed recipient numbers in `WHATSAPP_ALLOWED_RECIPIENTS`.
- **Production** uses the registered Relyvora WhatsApp Business number with `WHATSAPP_ALLOWED_RECIPIENTS` unset.

| Variable | Scope | Preview / Local | Staging (`staging.relyvora.com`) | Production (`ng.relyvora.com`) |
| :--- | :--- | :--- | :--- | :--- |
| `WHATSAPP_ACCESS_TOKEN` | **Server-only SECRET** | Unset (simulates cleanly) or Meta System User token | Meta Test App permanent System User access token | Production Meta System User permanent access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Server config | Unset or Meta Test Phone Number ID | Meta Test Phone Number ID | Registered Relyvora WhatsApp Business Phone Number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Server config | Optional | Staging WABA ID | Registered Relyvora WABA ID |
| `WHATSAPP_APP_SECRET` | **Server-only SECRET** | Test secret for webhook tests | Meta App Secret (`X-Hub-Signature-256` verification) | Production Meta App Secret (`X-Hub-Signature-256` verification) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | **Server-only SECRET** | Local test token | Random token configured in Meta Dashboard for `https://staging.relyvora.com/api/webhooks/whatsapp` | Distinct high-entropy token configured for `https://ng.relyvora.com/api/webhooks/whatsapp` |
| `WHATSAPP_ALLOWED_RECIPIENTS` | Server config | Optional CSV | Up to 5 E.164 test numbers (`+23480...,+23481...`) | Unset / empty (all opted-in buyers permitted) |
| `WHATSAPP_API_VERSION` | Server config | `v21.0` | `v21.0` | `v21.0` |
| `MAX_DAILY_VENDOR_WHATSAPP_MESSAGES` | Server config | `50` (fallback; DB `system_settings` authoritative) | `50` (`public.system_settings`) | `50` (`public.system_settings`, adjustable at runtime) |
| `MAX_DAILY_BUYER_WHATSAPP_MESSAGES` | Server config | `5` (fallback; DB `system_settings` authoritative) | `5` (`public.system_settings`) | `5` (`public.system_settings`, adjustable at runtime) |

### 3.6 Email Policy, Ops Alerts & Supabase Custom SMTP (Zero Google / Gmail)

Email is used strictly for:
1. **Vendor and Admin sign-in** (standard email/password + TOTP MFA for admins; **no Google OAuth / Gmail sign-in**).
2. **Supabase Auth transactional emails** (account confirmation, password reset, MFA notices via Custom SMTP).
3. **Operations alerts** sent via Resend to `ALERT_EMAIL`.
4. **Customer support & partner inquiries** via `support@relyvora.com` / `foundation@relyvora.com`.

Personal Gmail addresses (`@gmail.com`) are strictly prohibited as senders or recipients in application code, copy, and environment configuration.

| Variable | Scope | Preview / Local | Staging (`staging.relyvora.com`) | Production (`ng.relyvora.com`) |
| :--- | :--- | :--- | :--- | :--- |
| `RESEND_API_KEY` | **Server-only SECRET** | Optional dev key (unset simulates logs cleanly) | Staging Resend API key | Production Resend API key (`re_...`) |
| `RESEND_FROM_EMAIL` | Server config | `Relyvora Alerts <alerts@relyvora.com>` | Verified sender under `@relyvora.com` | `Relyvora Alerts <alerts@relyvora.com>` (verified domain with SPF, DKIM, DMARC) |
| `ALERT_EMAIL` | Server config | Staging engineering inbox (`ops@relyvora.com`) | Staging engineering inbox (`ops@relyvora.com`) | Operations alerts inbox (`ops@relyvora.com` or fallback `support@relyvora.com`) |

#### Supabase Custom SMTP Configuration (`Authentication -> SMTP Settings`)
Configure custom SMTP in both Staging and Production Supabase projects (never use Supabase's shared default rate-limited mailer in Production):

| Supabase Setting | Value |
| :--- | :--- |
| **Enable Custom SMTP** | `ON` |
| **Sender email address** | `no-reply@relyvora.com` |
| **Sender name** | `Relyvora` |
| **Host** | `smtp.resend.com` |
| **Port number** | `465` (SSL) or `587` (STARTTLS) |
| **Username** | `resend` |
| **Password** | Resend SMTP API key (`re_...`) |
| **Minimum interval per user** | `60` seconds |

---

## 4. Environment Setup Checklist

- **Preview / Local:** Point `.env.local` at Staging Supabase (`bepvqjqjybhhpsfbblqk.supabase.co`). Never load Production credentials locally.
- **Staging:** Attach `staging.relyvora.com` to the staging Vercel deployment, register `https://staging.relyvora.com/api/webhooks/whatsapp` in the Meta Developer Dashboard with `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, restrict `WHATSAPP_ALLOWED_RECIPIENTS` to the 5 Meta test numbers, and verify `ANCHOR_WEBHOOK_SECRET`, `RELEASE_CODE_PEPPER`, `CRON_SECRET`, and `ADMIN_USER_IDS` are set.
- **Production:** Verify `PAYMENTS_MODE=live`, `NEXT_PUBLIC_PAYMENTS_MODE=live`, `NEXT_PUBLIC_APP_URL=https://ng.relyvora.com`, `ANCHOR_BASE_URL=https://api.getanchor.co/api/v1`, `ANCHOR_BRAND_APPROVED=false` (unless approved), `WHATSAPP_ALLOWED_RECIPIENTS` unset, Supabase Custom SMTP configured with `no-reply@relyvora.com`, and confirm no secret key carries a `NEXT_PUBLIC_` prefix.
