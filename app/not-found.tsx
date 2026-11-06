import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-5">
        <div className="text-xs font-mono font-semibold text-accent uppercase tracking-wider">
          404 • Page Not Found
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-main">
          This page does not exist.
        </h1>
        <p className="text-muted text-sm leading-relaxed">
          The link you followed may have changed, or the page may have moved.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn bg-main text-site dark:bg-accent dark:text-[#071229] font-semibold text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Relyvora home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
