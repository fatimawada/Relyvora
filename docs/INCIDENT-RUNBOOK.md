# Relyvora Production & Staging Incident Response Runbook

> **Priority Escalation Email:** `ALERT_EMAIL` / `support@relyvora.com`  
> **Company:** Relyvora Technologies Limited (RC 9982218), Abuja, Nigeria

---

## 1. Immediate Emergency Kill Switches (Zero Redeploy)

If an active exploit, Anchor transfer anomaly, webhook storm, or KYC bypass is suspected:

1. **Admin Console (`/admin` -> Emergency Kill Switches, requires AAL2 MFA):**
   - **Pause New Checkouts (`checkout_enabled = false`):** Immediately stops `POST /api/escrow/create-link` with HTTP `503`. Existing paid orders remain accessible on `/order/[id]`.
   - **Pause Automated Payouts (`payouts_enabled = false`):** Immediately halts release transfers (`POST /api/escrow/release`) and automated dispute splits while keeping release codes valid and funds safely held in Anchor FBO.
   - **Restrict Vendor Onboarding (`vendor_allowlist_mode = true`):** Immediately blocks new open-signup onboarding unless email/handle is explicitly allowlisted.

2. **Direct SQL Fallback (Supabase Dashboard -> SQL Editor):**
   ```sql
   BEGIN;
   UPDATE public.system_settings
   SET value = 'false'::jsonb, updated_at = timezone('utc'::text, now()), updated_by = 'incident_runbook'
   WHERE key IN ('checkout_enabled', 'payouts_enabled');

   UPDATE public.system_settings
   SET value = 'true'::jsonb, updated_at = timezone('utc'::text, now()), updated_by = 'incident_runbook'
   WHERE key = 'vendor_allowlist_mode';
   COMMIT;
   ```

---

## 2. Severity Playbooks

### A. Stuck Settlement (`RELEASING`, `RESOLVING`, or `VENDOR_PAID` > 15 min)
1. Do **not** manually re-trigger a fresh transfer with a new reference.
2. Inspect `/admin` -> **Stuck Settlements Queue** for `leg1_idempotency_key`, `leg2_idempotency_key`, `anchor_vendor_transfer_id`, `anchor_fee_transfer_id`, `refund_transfer_id`, `payout_transfer_id`.
3. Trigger idempotent leg retry from `/admin` (`POST /api/admin/actions` -> `retry_transfer_leg`) or let `/api/cron/reconcile` (`retryStuckSettlementLegs`) resume only the uncompleted leg using the deterministic idempotency reference.
4. Confirm in Anchor Dashboard that the reference was settled once before finalizing ledger state.

### B. Anchor API Outage / Balance Mismatch (`FAILED_TO_VERIFY` or `FBO_BALANCE_MISMATCH`)
1. Toggle `payouts_enabled = false` immediately if FBO variance > ₦1.
2. Check Anchor status & `GET /api/health`.
3. Escalate to **Anchor Technologies Limited Support / Merchant Success Desk** (`support@getanchor.co` / Anchor Merchant Dashboard ticket / assigned Slack channel) with:
   - Anchor Organization Account ID (`RELYVORA_FBO_ACCOUNT_ID`)
   - Transfer / Event ID (`anchor_event_id`, `anchor_deposit_id`, `reference`)
   - UTC Timestamp & HTTP status from structured server logs (`correlationId`).

### C. WhatsApp Outage or High Failed Deliveries
1. System automatically retries failed `release_code_v1` webhooks once and emails `ALERT_EMAIL`.
2. Buyers see `"Didn't receive your code? Send it again"` on `/order/[id]` or can verify via OTP (`POST /api/escrow/reissue-code`).
3. Admins (AAL2) can use `/admin` -> **Failed WhatsApp Queue** to reissue a code or update a mistyped buyer WhatsApp number with documented reason & support alert.

---

## 3. What to Tell Affected Users

- **Checkout paused (`checkout_enabled = false`):**
  > *"Relyvora payment link creation is temporarily undergoing scheduled maintenance. Already-funded escrow orders are unaffected and funds remain safely held in our regulated banking partner's escrow ledger."*
- **Payout hold / banking partner outage (`payouts_enabled = false`):**
  > *"Your order is confirmed and funds are safely protected in escrow. Bank payout processing with our banking partner is temporarily delayed and will resume automatically as soon as connectivity stabilizes."*
- **Security / Suspicious Order Freeze (`review_hold = true`):**
  > *"For buyer and seller protection, this transaction has been placed under routine compliance verification by Relyvora Trust & Safety. Our team will update both parties once verification completes via support@relyvora.com."*

---

## 4. Recovery & Post-Incident Checklist
1. Confirm `GET /api/cron/reconcile` passes cleanly (`isClean: true`, `fboStatus: 'BALANCED'`).
2. Review `public.admin_audit_log` for all emergency interventions.
3. Re-enable `payouts_enabled = true`, then `checkout_enabled = true`, verifying one end-to-end Staging/smoke transaction before closing the incident.
