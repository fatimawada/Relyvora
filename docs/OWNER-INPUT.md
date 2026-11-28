# Owner Input & Open Product Decisions (`relyvora.com`)

This document tracks non-blocking product and creative decisions for the `relyvora.com` corporate marketing site (`release-candidate` branch). None of these decisions block the build or staging verification.

---

## 1. Final Sample Seller & Item Naming
- **Current Implementation:** All corporate marketing phone screens and example walkthroughs use the generic placeholders required by the sample data rules:
  - Seller name: `"Sample Store"`
  - Item name: `"Sample item"`
  - Order badge: `"Example order"`
  - Message badge: `"Example message"`
- **Open Decision:** Confirm whether `"Sample Store"` and `"Sample item"` should remain the permanent neutral labels on `relyvora.com`, or whether you want a fictional brand-owned sample store name (e.g., `"Amina Studio (Example)"`) once creative review is complete.

---

## 2. Handover Doorway Illustration (In-House vs. Commissioned Illustrator)
- **Current Implementation:** Built in-house as a flat editorial vector illustration (`public/illustrations/handover-doorway.svg`, `6.6 KB`, plus `public/illustrations/handover-doorway.webp`, `12.1 KB`) using strictly the five brand palette tokens:
  - Deep Emerald (`#0B6E55`)
  - Emerald (`#0FA36B`)
  - Mint (`#5BE3AB`)
  - Midnight (`#0A1B3D`)
  - Cloud (`#F4F6F9`)
- **Style Consistency Note:**
  - The Hero Loop (`components/hero/HeroPaymentLoop.tsx`) uses ultra-minimal, iconic flat silhouettes (`#0A1B3D`, `#0B6E55`, `#0FA36B`, `#5BE3AB`) with bold status pills and zero architectural background details so the 14-second CSS motion reads clearly at a glance.
  - The Handover Illustration (`components/common/HandoverIllustration.tsx`) uses the same flat silhouette construction and identical 5-color brand palette, but adds a doorway frame, doorstep mat, and background delivery bike silhouette for editorial depth on static sections (`/`, `/how-it-works`, and `/trust-and-safety`).
- **Open Decision:** Decide whether to keep this in-house geometric silhouette style across all pages or commission a custom editorial illustration pass from an illustrator (if commissioned, both the static doorway scene and the 3-scene hero loop silhouettes should be drawn by the same hand to keep stroke weights and figure proportions 100% uniform).

---

## 3. Optional "Notify Me" Line Below the How It Works Switcher
- **Current Implementation:** The shared `HowItWorksSwitcher` component (`components/how-it-works/HowItWorksSwitcher.tsx`) renders the 4 interactive step tabs, the step summary card with dynamic `FEE_CONFIG` breakdown (`₦45,000` item + `₦1,350` fee = `₦46,350` total), and the synchronized phone screen without a waitlist or "Notify me" capture line underneath.
- **Open Decision:** Confirm whether you would like a subtle `"Notify me when buyer payments open"` link or inline early-access prompt directly below the switcher on `/how-it-works` and the home page while `LAUNCH_STATUS` is `"launching"`.
