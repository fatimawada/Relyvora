/**
 * Brand approval gate for displaying Anchor's name outside legally required
 * partner disclosures and legal terms pages.
 *
 * Defaults to `false`. Set ANCHOR_BRAND_APPROVED=true (or NEXT_PUBLIC_ANCHOR_BRAND_APPROVED=true)
 * once written co-branding sign-off is granted.
 */

export const ANCHOR_BRAND_APPROVED_DEFAULT = false;

export function isAnchorBrandApproved(): boolean {
  const val =
    process.env.ANCHOR_BRAND_APPROVED ??
    process.env.NEXT_PUBLIC_ANCHOR_BRAND_APPROVED;

  if (val === undefined || val === '') {
    return ANCHOR_BRAND_APPROVED_DEFAULT;
  }

  return val.toLowerCase().trim() === 'true';
}
