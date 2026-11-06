import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Globe, ShieldCheck } from 'lucide-react';
import { FlagIcon } from '@/components/flags/FlagIcon';
import { MarketWaitlistForm } from '@/components/markets/MarketWaitlistForm';
import { LAUNCH_STATUS } from '@/lib/feeConfig';

export const metadata: Metadata = {
  title: 'Markets & Regional Coverage | Relyvora',
  description:
    'Relyvora is launching in Nigeria, with Ghana, Kenya, and South Africa coming soon. Explore our expansion roadmap and join the waitlist.',
};

export default function MarketsPage() {
  return (
    <div className="max-w-container mx-auto px-6 py-16 sm:py-20 space-y-16">
      {/* Header */}
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-xs font-semibold text-accent">
          <span>Pan-African Roadmap</span>
        </div>
        <h1 className="text-main leading-tight">
          Where Relyvora is expanding.
        </h1>
        <p className="text-muted text-lg sm:text-xl leading-relaxed">
          We are launching in Nigeria, solving the trust deficit in West Africa&apos;s largest social commerce hub, followed by expansion into Ghana, Kenya, and South Africa.
        </p>
      </div>

      {/* Markets Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 card-perspective">
        {/* Market 1: Nigeria */}
        <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface card-lift space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FlagIcon country="NG" size={36} />
              <div>
                <h3 className="text-xl font-bold text-main">Nigeria</h3>
                <span className="text-xs text-muted">Currency: NGN (₦)</span>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-accent/10 text-accent">
              {LAUNCH_STATUS === 'launching' ? 'Launching' : 'Live'}
            </span>
          </div>

          <p className="text-muted text-sm leading-relaxed">
            Our operational launch market. Built for merchants and buyers trading across Instagram, WhatsApp, TikTok, and Facebook.
          </p>

          <div className="space-y-2 pt-2 border-t border-border text-xs text-muted">
            <div className="flex justify-between">
              <span>Status</span>
              <span className="font-semibold text-accent">Operational Launch</span>
            </div>
            <div className="flex justify-between">
              <span>Banking rails</span>
              <span className="font-semibold text-main">Anchor BaaS • CBN-Licensed Partners</span>
            </div>
            <div className="flex justify-between">
              <span>Protection fee</span>
              <span className="font-semibold text-main">Flat 3% (paid by buyer)</span>
            </div>
          </div>

          <div className="pt-2">
            <a
              href="https://ng.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-12 rounded-btn font-semibold text-sm bg-main text-site dark:bg-accent dark:text-[#071229] hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <span>Go to Relyvora NG</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Market 2: Ghana */}
        <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface card-lift space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FlagIcon country="GH" size={36} />
              <div>
                <h3 className="text-xl font-bold text-main">Ghana</h3>
                <span className="text-xs text-muted">Currency: GHS (GH₵)</span>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-border text-muted">
              Coming soon
            </span>
          </div>

          <p className="text-muted text-sm leading-relaxed">
            Expanding transaction protection to social merchants across Accra, Kumasi, and surrounding commercial corridors.
          </p>

          <div className="space-y-2 pt-2 border-t border-border text-xs text-muted">
            <div className="flex justify-between">
              <span>Status</span>
              <span className="font-semibold text-main">Waitlist Open</span>
            </div>
            <div className="flex justify-between">
              <span>Payment rails</span>
              <span className="font-semibold text-main">Mobile Money &amp; Bank rails</span>
            </div>
          </div>

          <div className="pt-2">
            <MarketWaitlistForm countryCode="GH" countryName="Ghana" />
          </div>
        </div>

        {/* Market 3: Kenya */}
        <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface card-lift space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FlagIcon country="KE" size={36} />
              <div>
                <h3 className="text-xl font-bold text-main">Kenya</h3>
                <span className="text-xs text-muted">Currency: KES (KSh)</span>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-border text-muted">
              Coming soon
            </span>
          </div>

          <p className="text-muted text-sm leading-relaxed">
            Bringing neutral doorstep escrow to Nairobi and East Africa&apos;s dynamic mobile commerce ecosystem.
          </p>

          <div className="space-y-2 pt-2 border-t border-border text-xs text-muted">
            <div className="flex justify-between">
              <span>Status</span>
              <span className="font-semibold text-main">Waitlist Open</span>
            </div>
            <div className="flex justify-between">
              <span>Payment rails</span>
              <span className="font-semibold text-main">M-Pesa &amp; Banking rails</span>
            </div>
          </div>

          <div className="pt-2">
            <MarketWaitlistForm countryCode="KE" countryName="Kenya" />
          </div>
        </div>

        {/* Market 4: South Africa */}
        <div className="p-8 sm:p-10 rounded-3xl border border-border bg-surface card-lift space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FlagIcon country="ZA" size={36} />
              <div>
                <h3 className="text-xl font-bold text-main">South Africa</h3>
                <span className="text-xs text-muted">Currency: ZAR (R)</span>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-border text-muted">
              Coming soon
            </span>
          </div>

          <p className="text-muted text-sm leading-relaxed">
            Neutral transaction protection for informal commerce and peer-to-peer marketplaces across Johannesburg, Cape Town, and Durban.
          </p>

          <div className="space-y-2 pt-2 border-t border-border text-xs text-muted">
            <div className="flex justify-between">
              <span>Status</span>
              <span className="font-semibold text-main">Waitlist Open</span>
            </div>
            <div className="flex justify-between">
              <span>Payment rails</span>
              <span className="font-semibold text-main">EFT &amp; Card rails</span>
            </div>
          </div>

          <div className="pt-2">
            <MarketWaitlistForm countryCode="ZA" countryName="South Africa" />
          </div>
        </div>
      </div>
    </div>
  );
}
