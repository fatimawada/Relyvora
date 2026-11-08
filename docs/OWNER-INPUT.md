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
