# Anchor Brand Approval Locations (`ANCHOR_BRAND_APPROVED`)

**Config Flag:** `ANCHOR_BRAND_APPROVED` (also readable via `NEXT_PUBLIC_ANCHOR_BRAND_APPROVED`)
**Default Value:** `false` (`lib/anchorBrand.ts` -> `ANCHOR_BRAND_APPROVED_DEFAULT = false`)

When `ANCHOR_BRAND_APPROVED` is `false`:
- All gated Anchor mentions remain in their exact layout position, styled greyed and blurred with `aria-hidden="true"` and `data-anchor-brand-approved="false"` via `<AnchorBrandText>`.
- Page metadata descriptions and JSON-LD omit Anchor branding when `false`.

When `ANCHOR_BRAND_APPROVED` is `true`:
- `<AnchorBrandText>` renders normally without greying, blur, or `aria-hidden="true"`.

---

## 1. Gated Locations (Marketing Site & NG App)

| # | Route / File | Element / Copy | Exempt? |
|---|---|---|---|
| 1 | `app/(corporate)/page.tsx` (Hero trust line + FAQ teaser + metadata description) | `Payments powered by Anchor` / `Anchor Technologies Limited` | No — Gated |
| 2 | `app/(corporate)/about/page.tsx` (What is live today list) | `Payments powered by Anchor` | No — Gated |
| 3 | `app/(corporate)/markets/page.tsx` (Nigeria market card) | `Payments powered by Anchor.` | No — Gated |
| 4 | `app/(corporate)/trust-and-safety/page.tsx` (Banking partner summary card + metadata) | `Anchor Technologies Limited` / `powered by Anchor` | No — Gated |
| 5 | `app/(corporate)/faq/page.tsx` & `components/faq/FAQAccordion.tsx` (FAQ Q5, Q8 & JSON-LD) | `Anchor Technologies Limited` / `powered by Anchor` | No — Gated |
| 6 | `components/layout/Footer.tsx` (Brand column tagline) | `Payments powered by Anchor` | No — Gated |
| 7 | `components/ProductFooter.tsx` (NG app footer tagline) | `Payments powered by Anchor` | No — Gated |
| 8 | `app/(app)/pay/[id]/page.tsx` (Checkout bank-transfer footer badge) | `Payments powered by Anchor` | No — Gated |
| 9 | `app/(app)/vendor/page.tsx` (Dashboard subtitle & regulated rail banner) | `Live Anchor BaaS Settlement`, `Live Anchor BaaS Payout Rails Activated`, `Anchor virtual NUBAN accounts` | No — Gated |
| 10 | `app/(app)/vendor/onboarding/page.tsx` & `components/vendor/VendorOnboardingFlow.tsx` | `Anchor BaaS Regulated Onboarding`, `Anchor Technologies`, `Anchor-powered`, `Verifying with Anchor BaaS...` | No — Gated |
| 11 | `components/corporate/CorporateFAQ.tsx` (Dispute/code FAQs) | `Anchor` / `Anchor-powered` | No — Gated |
| 12 | `app/opengraph-image.tsx` (OG card footer text) | `Payments powered by Anchor` | No — Gated |

---

## 2. Exempt Locations (Untouched Required Legal & Banking Partner Disclosures)

| # | Route / File | Reason for Exemption |
|---|---|---|
| 1 | `app/terms/page.tsx` | Legal Terms of Service (exact legal wording preserved) |
| 2 | `app/privacy/page.tsx` | Legal Privacy Policy (exact legal wording preserved) |
| 3 | `app/disputes/page.tsx` | Legal Dispute Policy (exact legal wording preserved) |
| 4 | `components/layout/Footer.tsx` (Regulatory disclosure box) | Required banking partner disclosure (`Anchor Technologies Limited, in partnership with CBN-licensed financial institutions`) |
| 5 | `app/(corporate)/trust-and-safety/page.tsx` (`Banking partner disclosure` box) | Required banking partner disclosure (replaces footer disclosure on `/trust-and-safety`) |
