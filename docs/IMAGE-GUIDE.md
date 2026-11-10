# Relyvora Foundation: Hero & Visual Asset Guide

This guide establishes specifications, formats, and licensing protocols for photography and visual assets across `foundation.relyvora.com`.

---

## 1. Technical Specifications

| Parameter | Desktop Specification | Mobile Specification |
| :--- | :--- | :--- |
| **Aspect Ratio** | **4 : 5** (e.g. 800 × 1000 px) | **16 : 10** (e.g. 800 × 500 px) |
| **Max File Size** | **Under 200 KB** (strictly enforced) | **Under 120 KB** |
| **Permitted Formats** | **WebP** or **AVIF** (modern compressed) | **WebP** or **AVIF** |
| **Resolution** | 1x: 800 × 1000 px, 2x Retina: 1600 × 2000 px | 1x: 800 × 500 px |
| **Rendering** | `next/image` with `priority` for above-the-fold hero | `next/image` |
| **Styling Frame** | `rounded-2xl` or `rounded-3xl` border with brand overlay | Soft emerald/teal brand tint |

---

## 2. Alt-Text & Editorial Guidance

- **Descriptive, not promotional:** Describe the actual content of the image accurately.
- **Never imply fictional participants:** Do not write "Relyvora cohort participant Amina selling on WhatsApp". Write "An entrepreneur reviewing product inventory on a smartphone in a retail workshop."
- **Accessibility:** Keep alt text concise (under 125 characters), omitting "image of" or "photo of".
  - *Good example:* `A young female merchant arranging handcrafted leather goods while using a mobile phone.`
  - *Bad example:* `Relyvora Foundation graduate who achieved 3.8x revenue growth.`

---

## 3. Stock Photography & Licensing Protocol

> [!IMPORTANT]
> **Zero Web Hotlinking or Unlicensed Downloads:**
> All stock photography or commissioned assets must be acquired through proper licensing channels. Never hotlink or download copyrighted images directly from the web.

Every photograph added to the repository must be documented in [`docs/IMAGE-LICENCES.md`](./IMAGE-LICENCES.md) with:
1. File path in `/public/`
2. Source agency or photographer
3. License type (e.g., Unsplash Commercial, Getty Creative, Commissioned Work-For-Hire)
4. Proof of purchase / acquisition order reference
5. Permitted usage rights and expiration (if any)
