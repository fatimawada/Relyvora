# Relyvora Owner Input & Policy Confirmation Register

> **Date Created:** November 7, 2026  
> **Status:** Pending Decisions from Project Owner / Legal Counsel  
> **Rule:** Do not invent answers. In the marketing UI, each item below displays a visible `[TODO: Pending confirmation from Relyvora team]` placeholder until formally approved.

---

## 1. Escrow Policy & Transaction Mechanics

### Policy 1: Buyer Refuses Delivery at Doorstep
- **Question:** What is the exact protocol when a buyer inspects goods upon arrival and legitimately rejects the item due to defects or wrong specification, versus arbitrary refusal?
- **Current UI Placeholder:** `[TODO: Policy pending confirmation from Relyvora team — Doorstep rejection protocol & return shipping allocation]`
- **Required Decisions:**
  - Who bears the delivery courier fee in legitimate rejection vs buyer change-of-mind?
  - Does the buyer receive a 100% refund of item price, and is the 3% protection fee refunded?

### Policy 2: Lost or Unreceived 6-Digit Release Code
- **Question:** If a buyer loses their SMS/WhatsApp code receipt or accidentally deletes it, how can the code be re-issued safely at the doorstep without compromising security?
- **Current UI Placeholder:** `[TODO: Policy pending confirmation from Relyvora team — Code reissuance and authentication protocol]`
- **Required Decisions:**
  - Automated re-send via registered WhatsApp/SMS?
  - Manual in-app vendor/buyer dashboard verification?

### Policy 3: Dispute Resolution Timelines & Binding Arbitration
- **Question:** What are the strict operational Service Level Agreements (SLAs) for escalating and resolving disputes where buyer and seller cannot agree?
- **Current UI Placeholder:** `[TODO: Policy pending confirmation from Relyvora team — Official dispute resolution timeline and investigation SLA]`
- **Required Decisions:**
  - Evidence submission window (e.g., 2 hours, 6 hours, 24 hours)?
  - Merchant response window?
  - Final binding decision timeframe (24–48 hours)?

### Policy 4: Supported Payment Methods
- **Question:** Which exact payment methods are officially supported in Nigeria at launch through Anchor?
- **Current UI Placeholder:** `[TODO: Policy pending confirmation from Relyvora team — Confirmed payment methods (Bank Transfer, NIP Virtual Accounts, Cards, USSD)]`
- **Required Decisions:**
  - Dedicated virtual bank accounts (Providus, Access, etc.)?
  - Debit cards (Mastercard, Visa, Verve)?
  - Bank USSD?

### Policy 5: Payout Settlement Speed
- **Question:** Once the 6-digit release code is entered, what is the exact timeline for funds to arrive in the merchant's external commercial bank account?
- **Current UI Placeholder:** `[TODO: Policy pending confirmation from Relyvora team — Exact payout settlement turnaround time]`
- **Required Decisions:**
  - Instant NIP transfer (seconds to minutes)?
  - Same-day settlement windows?

---

## 2. Fee Calculation Base & Minimums

### Item 1: Protection Fee Base Calculation
- **Question:** Does the flat 3% fee apply strictly to the `item_price`, or to `item_price + delivery_fee`?
- **Current Config:** Set to `FEE_BASE = 'item'` in `lib/feeConfig.ts`.
- **Status:** Awaiting owner confirmation.

### Item 2: Minimum Protection Fee Floor
- **Question:** Is there a minimum fee floor (e.g. ₦100, ₦500), or strictly 3% down to ₦0?
- **Current Config:** Set to `FEE_MIN = null` in `lib/feeConfig.ts`.
- **Status:** Awaiting owner confirmation.

---

## 3. Brand & Partner Logo Permissions

### Item 1: Anchor Technologies Logo Usage
- **Question:** Does Relyvora have formal marketing permission to display the graphical Anchor corporate logo on the public website, or text-only attribution?
- **Current Implementation:** Text-only attribution (`"Payments powered by Anchor"`) as instructed in Section 7.
- **Status:** Awaiting written confirmation from Anchor Technologies Limited.
