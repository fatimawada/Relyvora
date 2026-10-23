import React from 'react';
import { AlertCircle, ShieldAlert } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="w-full bg-slate-900 text-slate-100 border-b border-slate-800 text-xs sm:text-sm py-2 px-3 sm:px-4 text-center font-medium sticky top-0 z-50 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-slate-900/95">
      <div className="max-w-6xl mx-auto flex items-center justify-center gap-2">
        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-amber-400 text-slate-950 uppercase tracking-wide">
          DEMO MODE
        </span>
        <span className="text-slate-200">
          <strong className="text-white font-semibold">RELYVORA DEMO</strong> — Simulated transaction protection. No real money is collected, held, or transferred.
        </span>
      </div>
    </div>
  );
}
