# Relyvora Data Protection, Retention & Erasure Requests SOP (`NDPA` Compliance)

> **Controller:** Relyvora Technologies Limited (RC 9982218), Abuja, Nigeria  
> **Privacy & Data Requests Contact:** `support@relyvora.com`  
> **Scope:** Governance for retention schedules, automated cleanup, and handling Data Subject Access & Deletion Requests under the Nigeria Data Protection Act (NDPA).

---

## 1. Automated Data Retention Schedule (`system_settings.retention_and_storage_config`)

All operational retention periods are configurable at runtime in `public.system_settings` (`key = 'retention_and_storage_config'`) and executed automatically by `runRetentionCleanup()` via `/api/cron/reconcile`:

| Data Category | Storage Location | Default Retention Period | Automated Cleanup Action |
| :--- | :--- | :---: | :--- |
| **Hashed IP / User-Agent / Device Fingerprints** | `vendors.signup_ip_hash`, `vendors.signup_ua_hash`, `vendors.signup_device_hash`, `transactions.creator_*_hash`, `transactions.buyer_*_hash` | **90 days** after creation / `*_ip_expires_at` | Nullifies expired hash fields once `*_ip_expires_at < now()` while retaining anonymous order amounts. |
| **Dispute & Proof-of-Delivery Evidence Files** | Private Storage bucket `relyvora-evidence` + `public.order_evidence_files` | **180 days** after final resolution (`resolved_at` / `released_at`) | Deletes binary objects from Storage bucket and stamps `deleted_at = now()` on `order_evidence_files`. |
| **WhatsApp Outbound Logs** | `public.whatsapp_message_log` | **180 days** (`created_at`) | Deletes expired notification log rows (numbers are already SHA-256 hashed + masked `******1234`). |
| **Immutable Financial Ledger & Tax/CBN Audit Trail** | `public.transaction_ledger`, `public.deposits`, `public.dispute_resolutions`, `public.admin_audit_log` | **Statutory minimum (7 years / permanent ledger)** | Append-only database trigger enforces immutability for CBN/BaaS financial audit compliance; contains zero plaintext BVN/NIN, zero release codes, and masked/hashed contact identifiers only. |
| **Encrypted Buyer Refund Bank Accounts** | `transactions.refund_account_ciphertext` (AES-256-GCM) | Purged once refund settles + dispute/retention window closes | Nullifies encrypted ciphertext (`refund_account_ciphertext`, `refund_account_iv`, `refund_account_auth_tag`) upon verified disposal/request where legally permissible. |

---

## 2. Handling Data Subject Deletion & Access Requests

### Step 1: Intake & Identity Verification (Within 24 Hours)
1. Requests received at `support@relyvora.com` must include the requester's registered vendor email OR masked/verified phone number and transaction ID.
2. Verify identity strictly before releasing or erasing data:
   - **Vendor:** Confirm ownership via authenticated email / Supabase user UID.
   - **Buyer:** Confirm ownership via WhatsApp OTP / verified phone hash match (`buyer_phone_hash`).

### Step 2: Legal Hold & Statutory Exception Screening (Days 1–3)
Verify whether an active exception applies under Nigerian financial regulations before deleting:
- Is there an active escrow (`AWAITING_PAYMENT`, `PARTIALLY_FUNDED`, `FUNDS_LOCKED`, `DISPATCHED`, `DISPUTED`, `RELEASING`, `RESOLVING`)? -> Deny erasure until final settlement; allow access export.
- Does the record form part of `public.transaction_ledger`, `public.deposits`, or `public.admin_audit_log`? -> Financial transaction ledgers are retained under CBN/BaaS anti-money-laundering statutory obligations; explain statutory exemption to requester and anonymize/scrub auxiliary contact fields instead.

### Step 3: Execute Erasure / Export (Within 7 Business Days, Max 30 Days)
1. Scrub optional contact fields (`buyer_phone`, `buyer_notes`, `courier_phone`, `courier_name`), expired IP/device hashes, and encrypted refund destination ciphertext on eligible finalized orders.
2. Delete evidence storage objects in `relyvora-evidence` for completed orders outside active dispute hold.
3. Log completion in `public.admin_audit_log` (`action = 'DATA_SUBJECT_REQUEST_COMPLETED'`, never storing raw deleted PII in metadata) and notify requester via `support@relyvora.com`.
