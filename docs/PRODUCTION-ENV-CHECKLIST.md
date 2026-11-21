# Vercel Production Environment Checklist (`ng.relyvora.com`)

**Variable names only — never commit secret values.**  
Production deploys initially in **safe launch mode** (`PAYMENTS_MODE=sandbox`, `NEXT_PUBLIC_PAYMENTS_MODE=sandbox`, `LAUNCH_STATUS=launching`, `NEXT_PUBLIC_LAUNCH_STATUS=launching`, `ANCHOR_BRAND_APPROVED=false`, `NEXT_PUBLIC_ANCHOR_BRAND_APPROVED=false`) using a **brand-new Production Supabase project** (never the Staging database).

---

## 1. Initial Launch Mode Flags (Set Before First Production Deploy)

| Variable Name | Initial Prod Value | Description | Where to Find / Set Value |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://ng.relyvora.com` | Public canonical origin used for payment links and redirects. | Vercel Production domain configuration. |
| `PAYMENTS_MODE` | `sandbox` | Server payment gateway mode (`sandbox` at launch; flip to `live` only after go-live sign-off). | Vercel Project Settings -> Environment Variables (Production). |
| `NEXT_PUBLIC_PAYMENTS_MODE` | `sandbox` | Client/server UI mode matching `PAYMENTS_MODE` so sandbox vs live transfer UI stays aligned. | Vercel Project Settings -> Environment Variables (Production). |
| `LAUNCH_STATUS` | `launching` | Server/build flag (`next.config.mjs`) gating live public access prior to general availability. | Vercel Project Settings -> Environment Variables (Production). |
| `NEXT_PUBLIC_LAUNCH_STATUS` | `launching` | Client UI launch gate matching `LAUNCH_STATUS`. | Vercel Project Settings -> Environment Variables (Production). |
| `ANCHOR_BRAND_APPROVED` | `false` | Build/server flag (`next.config.mjs`) blurring Anchor co-branding until written partner sign-off. | Anchor partner written approval; keep `false` at launch. |
| `NEXT_PUBLIC_ANCHOR_BRAND_APPROVED` | `false` | Client-side branding gate matching `ANCHOR_BRAND_APPROVED`. | Same as `ANCHOR_BRAND_APPROVED`. |

---

## 2. Production Supabase & Cryptography (Brand-New Empty Project)

| Variable Name | Description | Where to Find / Set Value |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production Supabase project REST/Auth URL. | Production Supabase Dashboard -> Project Settings -> API -> Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production Supabase anonymous public key. | Production Supabase Dashboard -> Project Settings -> API -> `anon` `public`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase `service_role` key bypassing RLS for API routes. | Production Supabase Dashboard -> Project Settings -> API -> `service_role` `secret`. |
| `RELEASE_CODE_PEPPER` | Server-only secret pepper for HMAC-SHA256 hashing of 6-digit release codes and dispute OTPs. | Generate unique 32+ byte hex secret locally (`openssl rand -hex 32`); store only in Vercel Production. |
| `WHATSAPP_PHONE_PEPPER` | Server-only secret pepper for HMAC-SHA256 hashing buyer phone numbers in DNC and verification tables. | Generate unique 32+ byte hex secret locally (`openssl rand -hex 32`); distinct from Staging. |
| `RISK_HASH_SALT` | Server-only secret salt for HMAC-SHA256 privacy-preserving hashing of IP, User-Agent, and device signals in risk evaluation. | Generate unique 32+ byte hex secret locally (`openssl rand -hex 32`); distinct from Staging. |
| `BUYER_SESSION_SECRET` | Server-only secret key used to sign short-lived, order-bound `httpOnly` Buyer Session cookies (`__relyvora_buyer_session`) after WhatsApp verification. | Generate unique 32+ byte hex secret locally (`openssl rand -hex 32`); distinct from Staging. |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile server verification secret checked on public vendor signup (`verifyPublicSignupCaptcha`). | Cloudflare Dashboard -> Turnstile -> relyvora.com site -> Secret Key. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Cloudflare Turnstile widget site key rendered on `/vendor/onboarding`. | Cloudflare Dashboard -> Turnstile -> relyvora.com site -> Site Key. |

---

## 3. Admin Authentication, MFA & Scheduled Jobs

| Variable Name | Description | Where to Find / Set Value |
| :--- | :--- | :--- |
| `ADMIN_USER_IDS` | Comma-separated Supabase Auth UUIDs permitted to access `/admin/*` (with `app_metadata.role = 'admin'` and TOTP `aal2`). | Production Supabase Dashboard -> Authentication -> Users -> copy admin `User UID`. |
| `CRON_SECRET` | Bearer secret checked by `/api/cron/reconcile` (`GET`/`POST`) on daily scheduled runs (`0 2 * * *`). | Generate high-entropy secret and configure in Vercel Production Environment Variables (Vercel sends automatically when set). |

---

## 4. Anchor BaaS Credentials

*(Start with Anchor Sandbox credentials while `PAYMENTS_MODE=sandbox`; replace with Anchor Live credentials only when promoting `PAYMENTS_MODE` to `live`.)*

| Variable Name | Description | Where to Find / Set Value |
| :--- | :--- | :--- |
| `ANCHOR_BASE_URL` | Anchor BaaS API base URL matching the active mode. | Anchor Developer Dashboard -> Environment Settings (Sandbox URL initially; Live URL at go-live). |
| `ANCHOR_SECRET_KEY` | Anchor API secret key used for server calls and customer/transfer creation. | Anchor Developer Dashboard -> Settings -> API Keys. |
| `ANCHOR_WEBHOOK_SECRET` | HMAC webhook secret verified on `/api/webhooks/anchor`. | Anchor Developer Dashboard -> Webhooks -> endpoint signing secret for `https://ng.relyvora.com/api/webhooks/anchor`. |

---

## 5. WhatsApp Cloud API (Meta)

| Variable Name | Description | Where to Find / Set Value |
| :--- | :--- | :--- |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API permanent System User token for outbound WhatsApp templates. | Meta Business Suite -> Business Settings -> System Users -> Generate Token (`whatsapp_business_messaging`). |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Business sender phone number ID. | Meta App Dashboard -> WhatsApp -> API Setup -> Phone number ID. |
| `WHATSAPP_API_VERSION` | Meta Graph API version string (defaults to `v21.0` if omitted). | Meta App Dashboard -> App Settings / WhatsApp API Setup (use `v21.0`). |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Verification token echoed during Meta webhook URL handshake on `/api/webhooks/whatsapp`. | Generate random secret string and paste the identical value into Meta Webhooks Callback configuration. |
| `WHATSAPP_APP_SECRET` | Meta App Secret used to validate `X-Hub-Signature-256` on inbound WhatsApp webhooks. | Meta App Dashboard -> App Settings -> Basic -> App Secret. |
| `WHATSAPP_ALLOWED_RECIPIENTS` | Optional comma-separated E.164 recipient allowlist for controlled pilot testing; leave unset for open buyers. | Optional pilot phone list (omit/unset once live Meta templates are open to all buyers). |

---

## 6. Operational Alert Email (Resend + Custom Auth SMTP)

| Variable Name | Description | Where to Find / Set Value |
| :--- | :--- | :--- |
| `RESEND_API_KEY` | Resend API key used by `sendSystemAlert` for ops alerts. | Resend Dashboard -> API Keys (and configure the same SMTP in Supabase Auth -> SMTP Settings with a `@relyvora.com` sender). |
| `RESEND_FROM_EMAIL` | Verified Relyvora domain sender address for ops alerts (e.g. `alerts@relyvora.com`). | Resend Dashboard -> Verified Domains -> `relyvora.com`. |
| `ALERT_EMAIL` | Internal Relyvora operations inbox receiving high-severity alerts (never a personal Gmail). | Internal Relyvora ops mailbox (e.g. `ops@relyvora.com`). |

---

## 7. Optional Kill-Switch & Limit Fallbacks (`system_settings` DB Table Takes Precedence)

| Variable Name | Recommended Prod Default | Description | Where to Find / Set Value |
| :--- | :--- | :--- | :--- |
| `CHECKOUT_ENABLED` | `true` | Server fallback kill switch when DB `system_settings` cannot be read. | Vercel Production Env Vars (prefer DB `system_settings.checkout_enabled` for live toggles). |
| `NEXT_PUBLIC_CHECKOUT_ENABLED` | `true` | Client fallback kill switch flag matching `CHECKOUT_ENABLED`. | Vercel Production Env Vars. |
| `MAX_ORDER_NGN` | Unset (uncapped) | Optional hard ceiling fallback in NGN (`null` in DB means uncapped). | Leave unset unless enforcing an emergency order ceiling. |
| `NEXT_PUBLIC_MAX_ORDER_NGN` | Unset (uncapped) | Optional client UI fallback matching `MAX_ORDER_NGN`. | Leave unset unless enforcing an emergency order ceiling. |
| `MAX_DAILY_VENDOR_VOLUME_NGN` | Unset (uncapped) | Optional per-vendor daily volume ceiling fallback (`null` in DB means uncapped). | Leave unset unless enforcing an emergency vendor volume cap. |
| `VENDOR_ALLOWLIST` | Unset (use DB flag) | Optional comma-separated backup vendor handles merged into allowlist checks. | Leave unset; manage allowlisted vendors via `public.vendors.is_allowlisted` in DB. |
| `MAX_DAILY_VENDOR_WHATSAPP_MESSAGES` | `50` | Daily per-vendor WhatsApp outbound fallback ceiling. | Matches seeded `system_settings` default `50`. |
| `MAX_DAILY_BUYER_WHATSAPP_MESSAGES` | `5` | Daily per-buyer WhatsApp outbound fallback ceiling. | Matches seeded `system_settings` default `5`. |
