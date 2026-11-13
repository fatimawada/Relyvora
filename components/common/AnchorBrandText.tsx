import React from 'react';
import { isAnchorBrandApproved } from '@/lib/anchorBrand';

export interface AnchorBrandTextProps {
  children: React.ReactNode;
  className?: string;
  approved?: boolean;
}

/**
 * Renders Anchor co-branding text inline in place.
 * When ANCHOR_BRAND_APPROVED is false (default), the text stays in layout
 * but is shown greyed, blurred, and hidden from assistive technology (aria-hidden="true").
 */
export function AnchorBrandText({
  children,
  className = '',
  approved,
}: AnchorBrandTextProps) {
  const isApproved = approved !== undefined ? approved : isAnchorBrandApproved();

  if (isApproved) {
    return (
      <span className={className} data-anchor-brand-approved="true">
        {children}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      data-anchor-brand-approved="false"
      className={`inline-block text-muted opacity-40 blur-[3px] select-none pointer-events-none ${className}`.trim()}
    >
      {children}
    </span>
  );
}
