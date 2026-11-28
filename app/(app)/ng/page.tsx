'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  MessageCircle,
  KeyRound,
  CheckCircle2,
  CornerDownRight,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { NG_LANDING_COPY } from '@/lib/ngLandingCopy';

export default function NigerianMarketPage() {
  const { hero, whatsappPreview, trustStrip, howItWorks, comparison, closingCta } =
    NG_LANDING_COPY;

  const trustIcons = [Lock, KeyRound, MessageCircle] as const;

  return (
    <div className="w-full overflow-x-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-10 sm:pt-8 sm:pb-16 lg:pt-10 lg:pb-20 space-y-14 sm:space-y-20">
        {/* 1. HERO SECTION (Two-Column Layout) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Headline, Subline, Actions */}
          <div className="lg:col-span-7 min-w-0 space-y-5 text-left">
            <h1 className="!text-[30px] sm:!text-[42px] lg:!text-[48px] font-heading font-bold text-main tracking-tight !leading-[1.12]">
              {hero.headline}{' '}
              <span className="text-accent">{hero.headlineAccent}</span>
            </h1>

            <p className="text-base sm:text-lg text-muted max-w-xl leading-relaxed font-sans">
              {hero.subline}
            </p>

            <div className="pt-1">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Link
                  href={hero.primaryCtaHref}
                  className="w-full sm:w-auto px-6 py-4 rounded-xl bg-[#0FA36B] hover:bg-[#0B6E55] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-card transition-colors"
                >
                  <span>Create your seller account</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Link>

                <a
                  href={hero.secondaryCtaHref}
                  className="w-full sm:w-auto px-6 py-4 rounded-xl bg-surface hover:bg-site border border-border text-main font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-colors"
                >
                  <span>{hero.secondaryCtaLabel}</span>
                </a>
              </div>
            </div>
          </div>

          {/* Right Column: Clean Mobile Phone Frame with WhatsApp Preview */}
          <div className="lg:col-span-5 min-w-0 w-full max-w-[340px] sm:max-w-[370px] mx-auto">
            <div
              aria-label="WhatsApp order payment message preview"
              className="rounded-[34px] bg-[#0A1B3D] p-2.5 shadow-card border border-[#0A1B3D]/15"
            >
              {/* Inner Phone Viewport */}
              <div className="rounded-[26px] bg-[#EEF3F0] overflow-hidden border border-white/10">
                {/* Phone Top Speaker Bar */}
                <div className="bg-[#075E49] px-4 pt-2 pb-1 flex items-center justify-center">
                  <div className="w-14 h-1 rounded-full bg-white/25" />
                </div>

                {/* WhatsApp Chat Header */}
                <div className="bg-[#0B6E55] text-white px-4 py-3 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Logo variant="symbol" height={20} withLink={false} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-heading font-semibold text-sm text-white truncate">
                          {whatsappPreview.senderName}
                        </span>
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-[#5BE3AB] shrink-0"
                          aria-label="Verified business account"
                        />
                      </div>
                      <p className="text-[11px] text-white/80 truncate font-sans">
                        {whatsappPreview.senderSubtitle}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-white shrink-0">
                    WhatsApp
                  </span>
                </div>

                {/* Chat Body */}
                <div className="p-3.5 sm:p-4 space-y-2">
                  {/* Message Bubble */}
                  <div className="bg-white rounded-2xl rounded-tl-xs p-3.5 shadow-2xs border border-[#DCE4DF] space-y-2.5 text-left">
                    <p className="text-[13px] leading-[1.55] text-[#0A1B3D] font-sans">
                      {whatsappPreview.messageText}
                    </p>
                    <div className="pt-2 border-t border-[#E6ECE8] flex items-center justify-between gap-2 text-[11px] text-[#5A6880]">
                      <span>{whatsappPreview.footerText}</span>
                      <span className="text-[10px] text-[#5A6880] shrink-0">
                        {whatsappPreview.timestamp}
                      </span>
                    </div>
                  </div>

                  {/* Quick Reply Buttons */}
                  <div className="space-y-1.5">
                    <div className="w-full bg-white border border-[#DCE4DF] rounded-xl py-2.5 px-3 text-center text-xs font-semibold text-[#0B6E55] flex items-center justify-center gap-1.5 shadow-2xs">
                      <CornerDownRight className="w-3.5 h-3.5 text-[#0FA36B] shrink-0" />
                      <span>{whatsappPreview.quickReplies[0]}</span>
                    </div>
                    <div className="w-full bg-white border border-[#DCE4DF] rounded-xl py-2.5 px-3 text-center text-xs font-semibold text-[#5A6880] flex items-center justify-center gap-1.5 shadow-2xs">
                      <CornerDownRight className="w-3.5 h-3.5 text-[#5A6880] shrink-0" />
                      <span>{whatsappPreview.quickReplies[1]}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted text-center font-medium mt-2.5">
              {whatsappPreview.caption}
            </p>
          </div>
        </section>

        {/* 2. TRUST STRIP (3 Clean Items) */}
        <section
          aria-label="Core payment protections"
          className="bg-surface border border-border rounded-card p-6 sm:p-8 shadow-xs"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 divide-y md:divide-y-0 md:divide-x divide-border">
            {trustStrip.map((item, idx) => {
              const IconComponent = trustIcons[idx] || ShieldCheck;
              return (
                <div
                  key={item.title}
                  className={`${
                    idx > 0 ? 'pt-6 md:pt-0 md:pl-8' : ''
                  } flex items-start gap-3.5 text-left`}
                >
                  <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent border border-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                    <IconComponent className="w-5 h-5 text-[#0FA36B]" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-base font-heading font-semibold text-main">
                      {item.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-muted leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. HOW IT WORKS (#how-it-works, 4 Clear Steps) */}
        <section id="how-it-works" className="space-y-8 scroll-mt-24">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="!text-[24px] sm:!text-[32px] font-heading font-bold text-main tracking-tight">
              {howItWorks.heading}
            </h2>
            <p className="text-sm sm:text-base text-muted">{howItWorks.subline}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {howItWorks.steps.map((step) => (
              <div
                key={step.stepNumber}
                className="bg-surface p-6 rounded-card border border-border shadow-xs flex flex-col justify-between space-y-4 text-left"
              >
                <div className="space-y-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#0FA36B] text-white flex items-center justify-center font-heading font-bold text-base shadow-2xs">
                    {step.stepNumber}
                  </div>
                  <h3 className="text-base sm:text-lg font-heading font-semibold text-main leading-snug">
                    {step.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. TWO-COLUMN "FOR BUYERS" AND "FOR SELLERS" COMPARISON */}
        <section className="space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="!text-[24px] sm:!text-[32px] font-heading font-bold text-main tracking-tight">
              {comparison.heading}
            </h2>
            <p className="text-sm sm:text-base text-muted">{comparison.subline}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {/* For Buyers Card */}
            <div className="bg-surface border border-border rounded-card p-6 sm:p-8 shadow-xs space-y-5 text-left flex flex-col justify-between">
              <div className="space-y-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
                  {comparison.buyers.badge}
                </span>
                <h3 className="text-xl sm:text-2xl font-heading font-bold text-main leading-snug">
                  {comparison.buyers.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted leading-relaxed">
                  {comparison.buyers.description}
                </p>
                <ul className="space-y-3 pt-2">
                  {comparison.buyers.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2.5 text-xs sm:text-sm text-main leading-relaxed"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#0FA36B] shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* For Sellers Card */}
            <div className="bg-surface border border-border rounded-card p-6 sm:p-8 shadow-xs space-y-5 text-left flex flex-col justify-between">
              <div className="space-y-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
                  {comparison.sellers.badge}
                </span>
                <h3 className="text-xl sm:text-2xl font-heading font-bold text-main leading-snug">
                  {comparison.sellers.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted leading-relaxed">
                  {comparison.sellers.description}
                </p>
                <ul className="space-y-3 pt-2">
                  {comparison.sellers.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2.5 text-xs sm:text-sm text-main leading-relaxed"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#0FA36B] shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 5. CLOSING CTA BAND */}
        <section className="bg-surface border border-border rounded-card p-8 sm:p-12 text-center space-y-6 shadow-card">
          <div className="max-w-xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
              <ShieldCheck className="w-4 h-4 text-[#0FA36B]" />
              <span>{closingCta.badge}</span>
            </div>

            <h2 className="!text-[24px] sm:!text-[32px] font-heading font-bold text-main tracking-tight">
              {closingCta.heading}
            </h2>

            <p className="text-xs sm:text-sm text-muted leading-relaxed">
              {closingCta.subline}
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <Link
                href={closingCta.primaryCtaHref}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-[#0FA36B] hover:bg-[#0B6E55] text-white font-bold text-sm sm:text-base shadow-card transition-colors"
              >
                <span>{closingCta.primaryCtaLabel}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
