# Relyvora Owner Input & Policy Confirmation Register

> **Date Updated:** November 8, 2026  
> **Status:** Active Owner Decision Register  
> **Rule:** No unconfirmed decisions are rendered in production. The `OwnerTodo` guard ensures any unconfirmed placeholder automatically halts the production build.

---

## 1. Final Register of Owner Decisions

### Decision 1: Fee Calculation Base (`FEE_BASE`)
- **Status:** **CONFIRMED (Default: Total)**
- **Rule:** The 3% fee (minimum ₦500) applies to the total payment into escrow (`item_price + delivery_fee`).
- **Implementation:** Configured in `lib/feeConfig.ts` (`FEE_BASE = 'total'`). Calculator and fee engine reflect this rule.

### Decision 2: Fee Refund Rule
- **Status:** **OPEN (Pending Legal / Operations Review)**
- **Question:** When an order is cancelled or legitimately rejected/refunded at the doorstep, is the 3% Relyvora protection fee refunded to the buyer, or retained to cover non-refundable banking rail fees?
- **Current Production Handling:** UI states that escrow funds are refunded in accordance with the dispute policy without making premature commitments on platform fee refundability.

### Decision 3: Dispute Scenario 5 Wording (Partial Acceptance)
- **Status:** **OPEN (Pending Legal Review)**
- **Question:** Scenario 5 in the Dispute Policy (`/disputes`) states:
  > *"The vendor is paid for the accepted items (minus the 3% platform fee), and the buyer receives a proportionate refund for the returned item(s)."*
  Confirm whether the 3% platform fee is deducted from the vendor's payout or the buyer's refund, and how the ₦500 minimum fee floor applies to partial splits.
- **Current Production Handling:** Legal text in `/disputes` is preserved 100% intact until formal legal counsel sign-off.

### Decision 4: Order & Daily Volume Caps (`max_order_ngn`, `max_daily_vendor_volume_ngn`)
- **Status:** **CONFIRMED (Default: `null` — No Cap)**
- **Rule:** Both `max_order_ngn` and `max_daily_vendor_volume_ngn` default to `null` in code (`lib/safetyLimits.ts`) and in the `system_settings` seed (`docs/PHASE-G1.5-RLS-v3.sql`). When `null`, the cap check is skipped. Both settings remain instant runtime overrides via `system_settings` or server environment variables without code changes or redeployment. No cap is hard-coded in UI components or copy.

### Decision 5: Protection Fee Refundability on Vendor Post-Payment Cancellation (`refund_fee_on_vendor_cancel`)
- **Status:** **OPEN (OwnerTodo — Pending Business / Legal Confirmation)**
- **Question:** When a vendor cancels an order **after payment is received (`FUNDS_LOCKED`) but before dispatch**, should Relyvora refund 100% of `total_amount` including the 3% protection fee, or retain the protection fee to cover Anchor collection/transfer charges?
- **Current Runtime Default:** `order_lifecycle_config.refund_fee_on_vendor_cancel = true` (100% refund of `total_amount` to verified buyer destination) configurable in `system_settings` without code change.

### Decision 6: Legal Review of Draft Prohibited & Restricted Items Policy (`/prohibited-items`)
- **Status:** **OPEN (OwnerTodo — Draft Live at `/prohibited-items` Marked Draft)**
- **Question:** Legal counsel to review and sign off on categories, KYC restrictions, and enforcement remedies listed on `app/prohibited-items/page.tsx`.
- **Current Launch Handling:** Marked clearly as a `[DRAFT — PENDING LEGAL COUNSEL REVIEW]` policy linked from footer and vendor onboarding, recording `prohibited_items_accepted_at` and version `'2026-11-draft-v1'`.

### Decision 7: Dispute SLA Business Hours (`dispute_policy_config`) & Delivery Windows (`delivery_window_config`)
- **Status:** **OPEN (Configurable Defaults — Owner Confirmation)**
- **Question:** Confirm business-hour window (`08:00–20:00` Africa/Lagos, Monday–Saturday) for dispute response SLA timers and default same-city (3 days) / interstate (7 days) delivery windows plus 3-day grace period (max 14 days).
- **Current Runtime Default:** Stored dynamically in `system_settings` (`dispute_policy_config`, `delivery_window_config`).

---

## 2. Completed Owner Decisions Log

1. **Tax Identification Number (TIN):**
   - **Decision:** Permanently removed from public website and legal documents.
   - **Resolution:** Removed from `/terms`, `/privacy`, and `ProductFooter`. Footer displays CAC registration `(RC 9982218)` only. Zero instances of TIN remain in repository.
2. **Fee Rate & Floor:**
   - **Decision:** Flat 3% with a strict ₦500 minimum floor (`FEE_RATE = 0.03`, `FEE_MIN = 500`).
   - **Resolution:** Implemented across `lib/feeConfig.ts`, pricing calculator, phone mock, and FAQ.
3. **Escrow Custody & Banking Partner:**
   - **Decision:** Attribute banking partner custody to Anchor Technologies Limited with single regulatory disclosure per page.
   - **Resolution:** Implemented across all marketing pages and footers.
4. **Default Order & Volume Caps:**
   - **Decision:** Set `max_order_ngn` and `max_daily_vendor_volume_ngn` defaults to `null` (no cap) while keeping them as instant overrides in `system_settings`.
   - **Resolution:** Implemented in `lib/safetyLimits.ts` and `docs/PHASE-G1.5-RLS-v3.sql`. No limits are hard-coded in components or marketing copy.
