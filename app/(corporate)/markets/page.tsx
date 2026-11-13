import React from 'react';
import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { FlagIcon } from '@/components/flags/FlagIcon';
import { MarketWaitlistForm } from '@/components/markets/MarketWaitlistForm';
import { AnchorBrandText } from '@/components/common/AnchorBrandText';
import { LAUNCH_STATUS } from '@/lib/feeConfig';

export const metadata: Metadata = {
  title: 'Markets | Relyvora',
  description:
    'Relyvora is launching in Nigeria, with Ghana, Kenya, and South Africa coming soon.',
  alternates: { canonical: '/markets' },
};

const UPCOMING = [
  { code: 'GH' as const, name: 'Ghana', currency: 'Cedi (GHS)' },
  { code: 'KE' as const, name: 'Kenya', currency: 'Shilling (KES)' },
  { code: 'ZA' as const, name: 'South Africa', currency: 'Rand (ZAR)' },
];

export default function MarketsPage() {
  const nigeriaBadge = LAUNCH_STATUS === 'launching' ? 'Starting here' : 'Live';

  return (
    <div className="max-w-container mx-auto px-6 pt-16 pb-16 sm:pt-20 sm:pb-20 space-y-12 text-left">
      <div className="max-w-3xl space-y-4">
        <p className="section-label">Markets</p>
        <h1 className="page-h1 text-main">Built for African commerce.</h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          Relyvora is starting in Nigeria, with Ghana, Kenya, and South Africa coming soon.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 card-perspective">
        {/* Nigeria */}
        <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface card-lift space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FlagIcon country="NG" size={36} />
                <div>
                  <h2 className="text-xl font-bold text-main">Nigeria</h2>
                  <span className="text-xs text-muted">Naira (NGN)</span>
                </div>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-accent/10 text-accent whitespace-nowrap">
                {nigeriaBadge}
              </span>
            </div>

            <p className="text-muted text-sm leading-relaxed">
              Payment protection for buyers and sellers on WhatsApp and Instagram in Nigeria.{' '}
              <AnchorBrandText>Payments powered by Anchor.</AnchorBrandText>
            </p>
          </div>

          <div className="pt-2">
            <a
              href="https://ng.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-12 rounded-btn font-semibold text-sm bg-main text-site dark:bg-accent dark:text-[#071229] hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <span>Go to Relyvora NG</span>
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>

        {/* Ghana, Kenya, South Africa */}
        {UPCOMING.map((m) => (
          <div
            key={m.code}
            className="p-8 sm:p-10 rounded-3xl border border-border bg-surface card-lift space-y-6 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FlagIcon country={m.code} size={36} />
                <div>
                  <h2 className="text-xl font-bold text-main">{m.name}</h2>
                  <span className="text-xs text-muted">{m.currency}</span>
                </div>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-border text-muted whitespace-nowrap">
                Coming soon
              </span>
            </div>

            <div className="pt-2">
              <MarketWaitlistForm countryCode={m.code} countryName={m.name} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
