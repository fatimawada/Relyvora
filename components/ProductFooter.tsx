import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AnchorBrandText } from '@/components/common/AnchorBrandText';

export function ProductFooter() {
  return (
    <footer className="w-full border-t border-border bg-surface py-6 mt-12 text-center text-xs text-muted">
      <div className="max-w-5xl mx-auto px-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-main">Relyvora Nigeria</span>
            <span>•</span>
            <span className="text-muted">Safe payments for WhatsApp and Instagram orders</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted">
            <Link href="/about" className="hover:text-main transition-colors font-medium text-main">
              About Relyvora
            </Link>
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-main transition-colors">
              Terms
            </Link>
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-main transition-colors">
              Privacy
            </Link>
            <Link href="/prohibited-items" target="_blank" rel="noopener noreferrer" className="hover:text-main transition-colors">
              Prohibited Items
            </Link>
            <Link href="/disputes" target="_blank" rel="noopener noreferrer" className="hover:text-main transition-colors">
              Disputes
            </Link>
            <a href="mailto:support@relyvora.com" className="hover:text-main transition-colors">
              support@relyvora.com
            </a>
          </div>
        </div>
        <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted">
          <span>Relyvora Technologies Limited (RC 9982218). Abuja, Nigeria.</span>
          <span className="inline-flex items-center gap-2 font-medium text-main/80">
            <AnchorBrandText>Payments powered by Anchor</AnchorBrandText>
            <Link href="/vendor/onboarding" className="inline-flex items-center gap-1 text-accent hover:underline">
              <span>Vendor sign-up</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
