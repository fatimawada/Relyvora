'use client';

import React from 'react';

/**
 * Corporate Hero Loop ("Payment held" -> "Released to seller"):
 * - 14 seconds total loop:
 *   • Scene A (0 to 3.5 s / 0% to 25%): seller silhouette packing a parcel. Pill above seller reads "Payment held" in deep emerald.
 *   • Scene B (3.5 to 8 s / 25% to 57.14%): sealed parcel moves along a simple path under the "Payment held" pill, which stays visible throughout.
 *   • Scene C (8 to 12 s / 57.14% to 85.71%): buyer silhouette opens the parcel, then hands a small code card to a rider silhouette. The seller silhouette beside a phone receives the code. The pill turns emerald and reads "Released to seller".
 *   • Hold & Reset (12 to 14 s / 85.71% to 100%): hold on the last frame for 2 seconds, then reset.
 * - First frame is rendered immediately as static SVG markup so the hero is never blank while loading.
 * - Inline SVG + CSS animations using transform and opacity only.
 * - prefers-reduced-motion: shows the static first frame with caption "Your money waits until delivery is confirmed." and no animation.
 * - Decorative: aria-hidden="true" on the scene; total weight < 12 KB (well under 60 KB limit).
 */
export function HeroPaymentLoop() {
  return (
    <div
      className="hero-loop-wrapper w-full max-w-[440px] mx-auto flex flex-col items-center"
      data-testid="hero-payment-loop"
    >
      <div
        className="hero-loop-stage relative w-full aspect-[4/3] rounded-3xl border border-border bg-surface shadow-xs overflow-hidden p-4 sm:p-5 flex flex-col justify-between select-none"
        aria-hidden="true"
      >
        {/* Top Status Pill Track (Payment held -> Released to seller) */}
        <div className="relative h-10 w-full flex items-center justify-center z-10">
          {/* Pill 1: Payment held (0s to 8.9s / 0% to 64%) in deep emerald (#0B6E55) */}
          <div
            data-testid="hero-pill-held"
            className="hero-loop-pill-held absolute inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0B6E55] text-white text-xs sm:text-[13px] font-semibold tracking-wide shadow-2xs"
          >
            <span className="w-2 h-2 rounded-full bg-[#5BE3AB]" />
            <span>Payment held</span>
          </div>

          {/* Pill 2: Released to seller (8.9s to 14s / 64% to 100%) in emerald (#0FA36B) */}
          <div
            data-testid="hero-pill-released"
            className="hero-loop-pill-released absolute inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0FA36B] text-[#071229] text-xs sm:text-[13px] font-bold tracking-wide shadow-2xs"
          >
            <span className="w-2 h-2 rounded-full bg-[#071229]" />
            <span>Released to seller</span>
          </div>
        </div>

        {/* Inline SVG Scene Stage (Silhouettes + Parcel Path, no text inside SVG) */}
        <div className="relative flex-1 w-full flex items-center justify-center">
          <svg
            viewBox="0 0 400 220"
            className="w-full h-full overflow-visible"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            {/* Subtle base ground line */}
            <line
              x1="28"
              y1="194"
              x2="372"
              y2="194"
              stroke="#E2E7EF"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* ========================================================= */}
            {/* SCENE A (0 to 3.5 s): Seller silhouette packing a parcel   */}
            {/* (Default static first frame — visible immediately)         */}
            {/* ========================================================= */}
            <g className="hero-scene-a">
              {/* Packing table */}
              <rect x="116" y="148" width="168" height="10" rx="5" fill="#0B6E55" />
              <rect x="132" y="158" width="10" height="36" rx="3" fill="#0A1B3D" />
              <rect x="258" y="158" width="10" height="36" rx="3" fill="#0A1B3D" />

              {/* Seller silhouette behind packing table */}
              <circle cx="172" cy="64" r="18" fill="#0A1B3D" />
              <path
                d="M140 148C140 116 152 94 172 94C192 94 204 116 204 148H140Z"
                fill="#0A1B3D"
              />
              {/* Seller arms reaching over parcel */}
              <path
                d="M192 108L222 124"
                stroke="#0A1B3D"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M154 112L196 128"
                stroke="#0A1B3D"
                strokeWidth="12"
                strokeLinecap="round"
              />

              {/* Parcel being packed on table */}
              <g className="hero-scene-a-parcel">
                <rect x="206" y="106" width="52" height="42" rx="6" fill="#0FA36B" />
                {/* Tape seal strip */}
                <rect x="228" y="106" width="8" height="42" fill="#5BE3AB" />
                <line x1="206" y1="124" x2="258" y2="124" stroke="#0B6E55" strokeWidth="3" />
                {/* Top box flaps closing */}
                <path
                  className="hero-scene-a-flap"
                  d="M206 106L222 94H244L258 106H206Z"
                  fill="#0B6E55"
                />
              </g>
            </g>

            {/* ========================================================= */}
            {/* SCENE B (3.5 to 8 s): Sealed parcel moves along a path     */}
            {/* ========================================================= */}
            <g className="hero-scene-b">
              {/* Simple horizontal transit path with origin and destination nodes */}
              <line
                x1="56"
                y1="136"
                x2="344"
                y2="136"
                stroke="#0B6E55"
                strokeWidth="4"
                strokeDasharray="8 8"
                strokeLinecap="round"
              />
              <circle cx="56" cy="136" r="9" fill="#0B6E55" />
              <circle cx="344" cy="136" r="9" fill="#0FA36B" />

              {/* Moving sealed parcel travelling from left to right */}
              <g className="hero-scene-b-parcel">
                <rect x="40" y="88" width="58" height="46" rx="8" fill="#0A1B3D" />
                <rect x="65" y="88" width="8" height="46" fill="#0FA36B" />
                <rect x="40" y="107" width="58" height="6" fill="#0B6E55" />
                <circle cx="69" cy="110" r="6" fill="#5BE3AB" />
              </g>
            </g>

            {/* ========================================================= */}
            {/* SCENE C (8 to 12 s) & HOLD (12 to 14 s):                   */}
            {/* Buyer opens parcel -> hands code card to rider ->          */}
            {/* Seller beside phone receives code                          */}
            {/* ========================================================= */}
            <g className="hero-scene-c">
              {/* 1. Left group: Buyer silhouette with open parcel */}
              <g>
                {/* Buyer silhouette */}
                <circle cx="64" cy="78" r="15" fill="#0A1B3D" />
                <path
                  d="M38 194C38 144 47 104 64 104C81 104 90 144 90 194H38Z"
                  fill="#0A1B3D"
                />
                {/* Buyer arm extending code card toward rider */}
                <path
                  d="M78 122L122 118"
                  stroke="#0A1B3D"
                  strokeWidth="10"
                  strokeLinecap="round"
                />

                {/* Opened parcel beside buyer */}
                <rect x="86" y="156" width="38" height="34" rx="4" fill="#0B6E55" />
                {/* Open flaps */}
                <path d="M86 156L76 144L98 150L86 156Z" fill="#0FA36B" />
                <path d="M124 156L134 144L112 150L124 156Z" fill="#0FA36B" />
                {/* Confirmation check badge above open parcel */}
                <circle cx="105" cy="138" r="9" fill="#5BE3AB" />
                <path
                  d="M101 138L104 141L110 135"
                  stroke="#0A1B3D"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>

              {/* 2. Center group: Rider silhouette receiving code card */}
              <g>
                {/* Rider helmet & visor silhouette */}
                <circle cx="192" cy="76" r="16" fill="#0B6E55" />
                <path d="M178 74H205C205 80 199 83 192 83C184 83 178 80 178 74Z" fill="#5BE3AB" />
                {/* Rider torso & legs */}
                <path
                  d="M166 194C166 144 175 102 192 102C209 102 218 144 218 194H166Z"
                  fill="#0B6E55"
                />
                {/* Rider arm receiving card from buyer */}
                <path
                  d="M174 122L144 118"
                  stroke="#0B6E55"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                {/* Rider signal wave toward seller's phone */}
                <path
                  className="hero-scene-c-signal"
                  d="M214 118L268 118"
                  stroke="#0FA36B"
                  strokeWidth="3"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                />
              </g>

              {/* Small code card handed from buyer to rider */}
              <g className="hero-scene-c-card">
                <rect
                  x="116"
                  y="102"
                  width="32"
                  height="22"
                  rx="4"
                  fill="#5BE3AB"
                  stroke="#0A1B3D"
                  strokeWidth="2"
                />
                <circle cx="125" cy="113" r="2.2" fill="#0A1B3D" />
                <circle cx="132" cy="113" r="2.2" fill="#0A1B3D" />
                <circle cx="139" cy="113" r="2.2" fill="#0A1B3D" />
              </g>

              {/* 3. Right group: Seller silhouette beside a phone receiving the code */}
              <g>
                {/* Minimal iconic phone silhouette beside seller (no detailed UI or text) */}
                <g className="hero-scene-c-phone">
                  <rect
                    x="274"
                    y="92"
                    width="32"
                    height="56"
                    rx="7"
                    fill="#0A1B3D"
                  />
                  <rect x="279" y="100" width="22" height="40" rx="4" fill="#0FA36B" />
                  <circle cx="290" cy="120" r="7" fill="#5BE3AB" />
                  <path
                    d="M286.5 120L289 122.5L294 117.5"
                    stroke="#0A1B3D"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>

                {/* Seller silhouette */}
                <circle cx="338" cy="78" r="15" fill="#0A1B3D" />
                <path
                  d="M312 194C312 144 321 104 338 104C355 104 364 144 364 194H312Z"
                  fill="#0A1B3D"
                />
              </g>
            </g>
          </svg>
        </div>

        {/* Bottom Subtle Progress Timeline Dots (purely decorative) */}
        <div className="flex items-center justify-center gap-2 pt-1">
          <span className="hero-dot-a w-6 h-1.5 rounded-full bg-[#0B6E55]" />
          <span className="hero-dot-b w-6 h-1.5 rounded-full bg-[#0FA36B]" />
          <span className="hero-dot-c w-6 h-1.5 rounded-full bg-[#5BE3AB]" />
        </div>
      </div>

      {/* Reduced-motion static caption (shown when prefers-reduced-motion: reduce is active) */}
      <p
        data-testid="hero-reduced-motion-caption"
        className="hero-reduced-motion-caption mt-3 text-xs sm:text-sm text-muted text-center font-medium"
      >
        Your money waits until delivery is confirmed.
      </p>
    </div>
  );
}
