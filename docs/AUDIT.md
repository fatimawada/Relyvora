# Relyvora System & Route Audit (Phase 0)

> **Date:** November 6, 2026  
> **Branch:** `redesign-v2`  
> **Auditor:** Antigravity  
> **Status:** Phase 0 Complete — Audit Log & Teardown Inventory

---

## 1. Route Registry & Safety Classification

Every existing route in the project has been audited. Routes classified as **PRESERVED** will remain functional, intact, and untouched during this rebuild.

| Route Path | Type | Current Purpose | Safety Classification | Action Required |
|---|---|---|---|---|
| `/` | Page (`app/(corporate)/page.tsx`) | Global Marketing Homepage | **MARKETING REBUILD** | Replace obsolete WebGL scroll with clean Stripe/Paystack 2-column layout & extruded 3D logo symbol. |
| `/problem` | New Page | Editorial deep dive into social commerce risks | **NEW MARKETING ROUTE** | Build 600+ word substantive editorial page with 3 real scenarios & internal links. |
| `/how-it-works` | New Page | Detailed 4-step escrow breakdown | **NEW MARKETING ROUTE** | Build interactive Buyer/Seller tabs & CSS-only 6-digit code phone mockup. |
| `/pricing` | New Page | Transparent 3% fee structure | **NEW MARKETING ROUTE** | Build interactive fee calculator reading from `FEE_CONFIG` single source of truth. |
| `/markets` | New Page | Regional expansion roadmap | **NEW MARKETING ROUTE** | Build Nigeria launching & Ghana, Kenya, South Africa waitlists with SVG flags. |
| `/faq` | New Page | Full searchable FAQ accordion | **NEW MARKETING ROUTE** | Build accordion with confirmed facts and visible TODO placeholders. |
| `/trust-and-safety` | New Page | Safety guidelines & banking custody | **NEW MARKETING ROUTE** | Build trust framework with Anchor custody text, dispute link, and buyer/seller tips. |
| `/about` | New Page | Founder & mission statement | **NEW MARKETING ROUTE** | Build Fatima Binta Wada profile, eliminating the "mortality rate" sentence. |
| `/terms` | Page (`app/terms/page.tsx`) | Terms of Service | **PRESERVED (STRICT)** | **Do not touch.** Preserve layout, text, and direct physical routing. |
| `/privacy` | Page (`app/privacy/page.tsx`) | NDPA 2023 Privacy Policy | **PRESERVED (STRICT)** | **Do not touch.** Preserve layout, text, and direct physical routing. |
| `/disputes` | Page (`app/disputes/page.tsx`) | 8 Binding Arbitration Scenarios | **PRESERVED (STRICT)** | **Do not touch.** Preserve layout, text, and direct physical routing. |
| `/foundation` | Page (`app/foundation/page.tsx`) | Relyvora Foundation DFI Portal | **PRESERVED (STRICT)** | Accessible via `foundation.relyvora.com` & path `/foundation`. Untouched. |
| `/ng` | Page (`app/(app)/ng/page.tsx`) | Nigeria Operational Portal | **PRESERVED (STRICT)** | Accessible via `ng.relyvora.com` & path `/ng`. Untouched. |
| `/vendor` | Page (`app/(app)/vendor/page.tsx`) | Vendor Escrow Dashboard | **PRESERVED (STRICT)** | Core simulated escrow vendor dashboard. Untouched. |
| `/vendor/onboarding` | Page (`app/(app)/vendor/onboarding/page.tsx`) | 2-Step KYC & Payout Flow | **PRESERVED (STRICT)** | React Hook Form + Zod KYC flow connected to Anchor. Untouched. |
| `/pay/[id]` | Page (`app/(app)/pay/[id]/page.tsx`) | Buyer Escrow Payment Page | **PRESERVED (STRICT)** | Dynamic checkout flow for buyers. Untouched. |
| `/order/[id]` | Page (`app/(app)/order/[id]/page.tsx`) | Escrow Tracking & Code Status | **PRESERVED (STRICT)** | 6-digit delivery inspection confirmation. Untouched. |
| `/api/anchor/accounts` | API (`route.ts`) | Anchor Deposit Account Creation | **PRESERVED (STRICT)** | BaaS virtual account provisioning. Untouched. |
| `/api/anchor/customers` | API (`route.ts`) | Anchor Customer Creation | **PRESERVED (STRICT)** | BaaS Tier 0 customer setup. Untouched. |
| `/api/anchor/test` | API (`route.ts`) | Diagnostic Sandbox Test | **PRESERVED (STRICT)** | Sandbox ping test. Untouched. |
| `/api/anchor/test-lifecycle`| API (`route.ts`) | Full Escrow Lifecycle Simulation| **PRESERVED (STRICT)** | 5-step escrow release and payout test. Untouched. |
| `/api/vendor/onboarding` | API (`route.ts`) | Vendor KYC API Bridge | **PRESERVED (STRICT)** | BVN/NIN verification & counterparty linking. Untouched. |

---

## 2. Component Inventory & Teardown Plan

### A. Obsolete 3D / WebGL Code (Marked for Deletion)
The following files represent the old GSAP scrubbed camera, rolling rings, hologram keypad, and dark terminal aesthetic, and will be deleted in Phase 0:
- `components/webgl/Scene.tsx` — *Deleted*
- `components/webgl/Overlay.tsx` — *Deleted*
- `components/webgl/FallbackView.tsx` — *Deleted*
- `components/webgl/CanvasWrapper.tsx` — *Deleted*
- `lib/webglDetection.ts` — *Deleted*

### B. Legacy Corporate Components (To Be Replaced with Token-Driven Components)
- `components/corporate/CorporateHeader.tsx` → Replaced by modular, accessible `Header.tsx` with light/dark theme toggle and mobile drawer.
- `components/corporate/CorporateFooter.tsx` → Replaced by modular `Footer.tsx` with RC number, removed TIN, and Anchor regulatory text.
- `components/corporate/CorporateFAQ.tsx` → Replaced by dedicated `/faq` page accordion.
- `components/corporate/HeroCrossfade.tsx` → Deleted (obsolete prototype).
- `components/corporate/TrustMarquee.tsx` → Deleted (contained unverified partner claims).
- `components/corporate/TrustNetworkDiagram.tsx` → Deleted (contained unverified partner claims).

### C. Product & Escrow Engine Components (Strictly Preserved)
- `components/vendor/VendorOnboardingFlow.tsx` (KYC wizard)
- `components/Navbar.tsx` (App header)
- `components/ProductFooter.tsx` (App footer)
- `components/DemoBanner.tsx` (Sandbox banner)
- `components/EscrowStepper.tsx` (Transaction progress indicator)
- `components/SimulatedPaymentModal.tsx` (Payment simulation)
- `components/StatusBadge.tsx` (Escrow status pills)

---

## 3. Inventory of Prohibited Claims on Current Site

The current codebase contains several legacy, speculative, or unconfirmed claims that will be purged in Phase 0 and strictly barred from all new pages:

1. **Banned Aesthetic Labels & Copy:**
   - `"Elite 3D Protocol"`
   - `"The Ingress"` / `"Zero-Trust Custody"` / `"state machine"`
   - `"Vault Door"` / `"Hologram Keypad"` / `"Rolling Rings"`
   - `"dark terminal"` look
2. **Banned Regulatory & Banking Claims:**
   - Standalone `"CBN-REGULATED"` badges (Replaced strictly with approved Anchor disclosure).
   - Claims of direct CBN banking license for Relyvora.
3. **Banned Metrics & Absolute Claims:**
   - `"100% protection"`
   - `"₦0 PoD scams"` / `"zero chargeback scams"`
   - `"instant payouts"` (Replaced with neutral automated settlement).
   - `"all 36 states operational"` (Replaced with "Launching in Nigeria").
   - Speculative market statistics (e.g. `"$20B market"`, `"35% margin lost"`).
4. **Banned Bio Sentences:**
   - Remove the phrase regarding `"the high mortality rate of informal African micro-merchants"` from Fatima Binta Wada's biography.
5. **Tax Identification Number:**
   - Current footer: `"Relyvora Technologies Limited (RC 9982218 | TIN 2623717709692)"`.
   - Action: **Permanently remove TIN**. The footer will read:  
     `"Relyvora Technologies Limited (RC 9982218). Abuja, Nigeria."`

---

## 4. Confirmed Facts Checklist

The following facts are verified and permitted on the marketing site:
- **Core Product:** Transaction protection and neutral escrow for WhatsApp and Instagram commerce.
- **Mechanism:** Buyer pays, funds held in custody, released when order arrives and buyer confirms with 6-digit code.
- **Banking Partner:** Payments powered by Anchor (`"Anchor Technologies Limited"` in partnership with CBN-licensed institutions).
- **Fee:** Flat 3% paid by the buyer, shown transparently before checkout.
- **Geographic Markets:**
  - Nigeria: Launching.
  - Ghana, Kenya, South Africa: Coming soon.
- **Corporate Entity:** Relyvora Technologies Limited (RC 9982218), Abuja, Nigeria.
- **Founder:** Fatima Binta Wada, Founder & CEO.
