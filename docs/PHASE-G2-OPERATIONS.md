# PHASE G2: SAFETY, SETTLEMENT & OPERATIONS MANUAL

## 1. Executive Summary
Phase G2 implements operational safety controls, hot database-governed kill switches, append-only double-entry transaction ledgers, critical alerting via Resend with strict PII sanitization, and the central **Admin Dispute Mediation & Arbitration Console** (`/admin/disputes`) enforcing Relyvora's 8 binding dispute scenarios with real-time 2h, 6h, and 12h SLA countdown timers.

---

## 2. Kill Switches, Order Caps & Vendor Allowlist

### 2.1 Configuration Hierarchy
Safety limits support instant hot overrides from the `public.system_settings` database table (cached in-memory with a 30-second TTL), falling back to server environment variables:

| Setting Key | Default Launch Value | Environment Variable | Database Override (`system_settings`) |
| :--- | :--- | :--- | :--- |
| **Checkout Kill Switch** | `true` (Enabled) | `CHECKOUT_ENABLED` (`true`/`false`) | `key: 'checkout_enabled', value: 'false'` |
| **Maximum Order Cap** | `null` (No cap) | `MAX_ORDER_NGN` (Integer NGN or `null`) | `key: 'max_order_ngn', value: 'null'` |
| **Daily Volume Cap** | `null` (No cap) | `MAX_DAILY_VENDOR_VOLUME_NGN` (Integer NGN or `null`) | `key: 'max_daily_vendor_volume_ngn', value: 'null'` |
| **Vendor Allowlist Mode**| `true` (Invite-Only) | `VENDOR_ALLOWLIST` (Comma list) | `key: 'vendor_allowlist_mode', value: 'true'` |

### 2.2 Order Creation Safety Pipeline
Before any escrow payment link or Providus Virtual NUBAN is provisioned:
1. `validateOrderCreationServer` verifies `isCheckoutEnabledServer()`. If disabled, immediately returns HTTP 503 (`CHECKOUT_DISABLED`).
2. Order total is compared against `getMaxOrderNgnServer()`. If `null` (default), no cap is enforced; if set to a numeric override, orders exceeding that limit return HTTP 403 (`AMOUNT_EXCEEDED`).
3. Vendor KYC and allowlist status are validated. Unallowlisted vendors are rejected with HTTP 403 (`VENDOR_NOT_ALLOWLISTED`).
4. If `max_daily_vendor_volume_ngn` is set to a numeric override (non-`null`), 24-hour cumulative order volume is enforced against it.

---

## 3. Append-Only Transaction Ledger Engine

All fund state transitions are recorded in `public.transaction_ledger` with deterministic idempotency keys and protected by database triggers against updates, deletions, and truncations:

| Ledger Entry Type | Trigger Point | From Account | To Account |
| :--- | :--- | :--- | :--- |
| `DEPOSIT_LOCKED` | Inbound Providus webhook confirmed deposit | `Buyer Virtual NUBAN` | `Relyvora Escrow FBO` |
| `PAYOUT_VENDOR` | Release code verified (Leg 1 BookTransfer) | `Relyvora Escrow FBO` | `Vendor Anchor Deposit ID` |
| `FEE_REVENUE` | 3% platform fee split (Leg 2 BookTransfer) | `Relyvora Escrow FBO` | `Relyvora Revenue Account` |
| `DISPUTE_FREEZE` | Buyer lodges dispute claim | `Relyvora Escrow FBO` | `Dispute Arbitration Vault` |
| `REFUND_BUYER` | Admin binding arbitration (100% refund) | `Relyvora Escrow FBO` | `Buyer Bank Account / Phone` |
| `SPLIT_VENDOR` | Binding partial split (logistics fee) | `Relyvora Escrow FBO` | `Vendor Anchor Deposit ID` |
| `SPLIT_BUYER` | Binding partial split (refund minus fee) | `Relyvora Escrow FBO` | `Buyer Bank Account / Phone` |

---

## 4. Operational Alerting via Resend

Integrated via `lib/alerts.ts` using `process.env.RESEND_API_KEY` (recipient: `process.env.ALERT_EMAIL || support@relyvora.com`).

### 4.1 Strict PII & Secret Redaction
Before generating any alert email payload, the sanitization engine recursively strips:
- Plaintext release codes, HMAC hashes, salts, and pepper keys.
- Masks bank account numbers: `******1234`.
- Masks customer phone numbers: `***-***-1234`.

### 4.2 Monitored Alert Events
- `WEBHOOK_FAILURE`: Invalid HMAC signature or unmatched deposit received.
- `STUCK_FUNDS`: Partial underpayments, overpayments, or late deposits received on closed/disputed orders.
- `SECURITY_LOCKOUT`: 5 consecutive failed 6-digit release code attempts.
- `PAYOUT_FAILURE`: Anchor BookTransfer API failure on Leg 1 or Leg 2.
- `NEW_DISPUTE`: Escrow dispute triggered by buyer or resolved by arbitrator.

---

## 5. Admin Dispute Mediation & Arbitration Console (`/admin/disputes`)

Located at `app/(app)/admin/disputes/page.tsx` and backed by authenticated Route Handlers `/api/admin/disputes/list` and `/api/admin/disputes/resolve`.

### 5.1 The 8 Binding Dispute Scenarios

| Scenario # | Title & Description | SLA Window | Policy Mandate | Settlement Action |
| :---: | :--- | :---: | :--- | :--- |
| **1** | **Quality Mismatch ("What I Ordered vs. What I Got")**<br/>Delivered item materially differs from listing/chat. | **2 Hours** | Buyer uploads unboxing photo/video within 2h. Rider returns item. | `FULL_REFUND_BUYER`<br/>100% refund to buyer. |
| **2** | **Buyer Refuses Delivery / Ghosts**<br/>Vendor dispatches; buyer is unreachable or cancels. | **6 Hours** | Vendor submits rider call logs & arrival timestamp. | `SPLIT_MINUS_DELIVERY`<br/>Item price to buyer; delivery fee to vendor. |
| **3** | **Hostage Situation (Item Taken, Code Withheld)**<br/>Buyer retains goods but refuses to release code. | **12 Hours** | 12h ultimatum for defect evidence. If silent, Relyvora overrides code. | `FULL_PAYOUT_VENDOR`<br/>100% item payout to vendor. |
| **4** | **Item Damaged in Transit**<br/>Item arrives cracked, broken, or spilled at doorstep. | **2 Hours** | Immediate unboxing photo taken at doorstep in front of rider. | `FULL_REFUND_BUYER`<br/>100% refund to buyer. |
| **5** | **Partial Acceptance (Multi-Item Order)**<br/>Buyer keeps some items, rejects others. | **6 Hours** | Both parties sign off on accepted items and returned items. | `CUSTOM_SPLIT`<br/>Vendor paid for accepted; buyer refunded for rest. |
| **6** | **Vendor Failure to Deliver ("Vendor MIA")**<br/>Agreed timeframe elapsed; vendor unresponsive. | **6 Hours** | 6h window for valid dispatch receipt. If missing, compliance strike. | `FULL_REFUND_BUYER`<br/>100% refund to buyer. |
| **7** | **Buyer Remorse at the Door**<br/>Delivered item matches description; buyer changes mind. | **2 Hours** | Item returned immediately with rider in pristine condition. | `SPLIT_MINUS_DELIVERY`<br/>Buyer refunded minus delivery fee to vendor. |
| **8** | **Lost or Stolen in Transit (Rider Absconds)**<br/>Package never arrives at buyer doorstep. | **12 Hours** | Logistics waybill verified. Buyer never received goods. | `FULL_REFUND_BUYER`<br/>100% refund to buyer; vendor claims carrier. |

### 5.2 Real-Time SLA Timers
- Every dispute card displays live counting timers for the **2-Hour Doorstep Window**, **6-Hour Vendor Proof Window**, and **12-Hour Final Ultimatum Window**.
- Dynamically highlights `EXPIRED` status with 100% progress indicators when SLA response deadlines elapse.

### 5.3 Irreversible Arbitration Authorization
- When an arbitrator commits a binding decision, the UI enforces an explicit verification checkbox:
  > *"Binding Arbitration Authorization: I verify that all evidence for Scenario X has been evaluated under the Relyvora Dispute SLA policy, and I authorize this irreversible financial settlement."*
- Logs decisions atomically into `public.dispute_resolutions` and `public.admin_audit_log`.

---

## 6. Verification & Test Evidence
- **Test Suite 1:** `npx tsx tests/phase-g2.test.ts` (28/28 tests passed)
- **Test Suite 2:** `npx tsx tests/phase-g1.5-v3.test.ts` (15/15 tests passed)
- **Next.js Production Build:** `npm run build` compiled 39 routes with exit code 0.
