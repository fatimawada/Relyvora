import React from 'react';

export function ProductFooter() {
  return (
    <footer className="w-full border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
      <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">Relyvora Nigeria</span>
          <span>•</span>
          <span>Social Commerce Escrow Application</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Simulated Sandbox Mode • Powered by Supabase
        </div>
      </div>
    </footer>
  );
}
