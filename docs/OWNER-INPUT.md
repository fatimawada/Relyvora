# Relyvora Owner Input & Policy Confirmation Register

> **Date Updated:** November 8, 2026  
> **Status:** Pending Decisions from Project Owner / Legal Counsel  
> **Rule:** Do not invent answers. In the marketing UI, each item below uses configured defaults with clear disclaimers until formally approved.

---

## 1. Open Owner Decision Items (OwnerTodos)

### Decision 1: Fee Calculation Base (`FEE_BASE`)
- **Question:** Does the 3% fee apply strictly to `item_price`, or to the total payment `item_price + delivery_fee`?
- **Current Production Default:** `FEE_BASE = 'total'` in `lib/feeConfig.ts`.
- **Note:** If delivery is paid outside of escrow, base should be reverted to `'item'`.
- **Status:** Pending owner confirmation.

### Decision 2: Protection Fee Refundability
- **Question:** If an order is cancelled before dispatch, or legitimately rejected/returned at the doorstep, is the 3% Relyvora fee refunded to the buyer, or is it non-refundable to cover banking rails costs?
- **Current UI Copy:** Notes that money remains frozen in escrow during disputes; does not promise fee refundability until confirmed.
- **Status:** Pending owner confirmation.

### Decision 3: Dispute Scenario 5 Fee Deduction in Legal Document
- **Question:** Scenario 5 in the Dispute Policy (`/disputes`) states: *"The buyer receives a full refund of the item amount, minus a 3% platform fee and courier costs."* Confirm whether the 3% platform fee is deducted from the buyer's refund or charged to the seller, and whether this matches the minimum ₦500 rule.
- **Status:** Pending legal review.

---

## 2. Observations on Legal Pages (`/terms`, `/privacy`, `/disputes`)

As instructed, the legal page text was left 100% intact while wrapping in the unified responsive Header and Footer. The following discrepancies with current brand guidelines were noted for future legal review:

1. **Tax Identification Number (TIN):**
   - `/terms` Section 1 displays `TIN 2623717709692`. The marketing site footer was instructed to show company name and RC number only (removing the TIN). Confirm if legal documents should also omit TIN.
2. **Terminology Consistency:**
   - `/disputes` uses terms like *"Anchor escrow vault"* and *"Arbitration Protocol"*. The marketing site has transitioned to calm, institutional language (*"frozen in escrow"*, *"dispute review"*). Consider modernizing legal copy in the next scheduled review.
3. **Contact Channels:**
   - Legal documents cite phone `+234 703 384 1860` and `compliance@relyvora.com` / `hello@relyvora.com`. The public marketing site directs inquiries to `support@relyvora.com` and `partnerships@relyvora.com`.

---

## 3. Escrow Policy & Transaction Mechanics Register

### Policy 1: Buyer Refuses Delivery at Doorstep
- **Question:** What is the exact protocol when a buyer inspects goods upon arrival and legitimately rejects the item due to defects or wrong specification, versus arbitrary refusal?
- **Status:** Handled via dispute scenarios in `/disputes`.

### Policy 2: Lost or Unreceived 6-Digit Release Code
- **Question:** If a buyer loses their SMS/WhatsApp code receipt or accidentally deletes it, how can the code be re-issued safely at the doorstep without compromising security?
- **Status:** Re-issued from active transaction screen on `ng.relyvora.com` or via support ticket.

### Policy 3: Dispute Resolution Timelines
- **Question:** What are the operational SLAs for investigating and resolving disputes?
- **Current Implementation:** Support reviews all disputes with money safely frozen; seller given response window as set out in dispute policy.

### Policy 4: Supported Payment Methods
- **Question:** Which exact payment methods are officially supported in Nigeria at launch through Anchor?
- **Current Implementation:** Bank transfer / dedicated virtual accounts powered by Anchor.

### Policy 5: Payout Settlement Speed
- **Question:** Once the 6-digit release code is entered, what is the exact timeline for funds to arrive in the merchant's commercial bank account?
- **Current Implementation:** Immediate automated settlement via Anchor BaaS rails into merchant commercial bank account.
