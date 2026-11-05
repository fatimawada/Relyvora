import React from 'react';
import Link from 'next/link';

export function ProductFooter() {
  return (
    <footer className="w-full border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
      <div className="max-w-5xl mx-auto px-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">Relyvora Nigeria</span>
            <span>•</span>
            <span>Social Commerce Escrow Infrastructure</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors">Terms</Link>
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors">Privacy</Link>
            <Link href="/disputes" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors">Disputes</Link>
          </div>
        </div>
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>Relyvora Technologies Limited (RC 9982218 | TIN 2623717709692). Abuja, Nigeria.</span>
          <span className="font-medium text-slate-600">Payments powered by Anchor</span>
        </div>
      </div>
    </footer>
  );
}
