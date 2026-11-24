import React from 'react';
import { isExplicitSandboxUiMode } from '@/lib/appUrls';

export function DemoBanner() {
  // Render only when explicitly running on staging.relyvora.com or when sandbox/demo flag is enabled on a non-production host
  if (!isExplicitSandboxUiMode()) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid="sandbox-ribbon"
      className="w-full h-7 bg-amber-50 text-amber-950 border-b border-amber-200 text-[11px] sm:text-xs px-3 flex items-center justify-center font-medium sticky top-0 z-50"
    >
      Test mode: no real money moves
    </div>
  );
}
