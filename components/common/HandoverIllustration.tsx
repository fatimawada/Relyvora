import React from 'react';

export const HANDOVER_ALT_TEXT =
  'A buyer checks a parcel at the door before confirming delivery.';

export interface HandoverIllustrationProps {
  className?: string;
}

/**
 * Reused flat editorial illustration of a dispatch rider handing a sealed parcel
 * to a buyer at a doorway, the buyer holding a phone.
 * Brand palette only: deep emerald (#0B6E55), emerald (#0FA36B), mint (#5BE3AB),
 * midnight (#0A1B3D), cloud (#F4F6F9).
 * Exported as SVG (/illustrations/handover-doorway.svg) with a WebP fallback
 * (/illustrations/handover-doorway.webp, <15 KB, well under the 80 KB limit).
 */
export function HandoverIllustration({ className = '' }: HandoverIllustrationProps) {
  return (
    <div
      data-testid="handover-illustration"
      className={`overflow-hidden rounded-2xl border border-border bg-[#F4F6F9] ${className}`}
    >
      <picture>
        <source srcSet="/illustrations/handover-doorway.svg" type="image/svg+xml" />
        <source srcSet="/illustrations/handover-doorway.webp" type="image/webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/handover-doorway.webp"
          alt={HANDOVER_ALT_TEXT}
          width={640}
          height={420}
          loading="lazy"
          decoding="async"
          className="w-full h-auto block object-cover"
        />
      </picture>
    </div>
  );
}
