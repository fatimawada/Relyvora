import React from 'react';
import Link from 'next/link';

export function ProductFooter() {
  return (
    <footer className="w-full border-t border-border bg-surface py-6 mt-12 text-center text-xs text-muted transition-colors">
      <div className="max-w-5xl mx-auto px-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-main">Relyvora Nigeria</span>
            <span>•</span>
            <span className="text-muted">Social Commerce Escrow Infrastructure</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted">
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-main transition-colors">Terms</Link>
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-main transition-colors">Privacy</Link>
            <Link href="/disputes" target="_blank" rel="noopener noreferrer" className="hover:text-main transition-colors">Disputes</Link>
          </div>
        </div>
        <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted">
          <span>Relyvora Technologies Limited (RC 9982218). Abuja, Nigeria.</span>
          <span className="font-medium text-main/80">Payments powered by Anchor</span>
        </div>
      </div>
    </footer>
  );
}
