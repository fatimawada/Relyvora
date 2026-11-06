'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDown, 
  Lock, 
  Package, 
  Zap, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

interface OverlayProps {
  scrollProgress: number;
}

export function Overlay({ scrollProgress }: OverlayProps) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="relative z-10 w-full text-white pointer-events-auto select-none">
      {/* ----------------------------------------------------------- */}
      {/* GLOBAL LUXURY HEADER (Dark Glassmorphism) */}
      {/* ----------------------------------------------------------- */}
      <header className="fixed top-0 left-0 w-full z-50 bg-[#0A0A0C]/80 backdrop-blur-md border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Reversed High-Contrast Brand Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0 hover:opacity-90 transition-opacity">
            <Image
              src="/relyvora-logo-reversed.png"
              alt="Relyvora"
              width={150}
              height={42}
              priority
              className="h-9 w-auto object-contain"
            />
          </Link>

          {/* Desktop Protocol Indicators */}
          <div className="hidden md:flex items-center gap-6 text-xs font-mono tracking-wider uppercase text-zinc-400">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Protocol v1.0 • WebGL Active</span>
            </span>
            <span className="text-zinc-600">|</span>
            <span>Anchor BaaS Rails</span>
          </div>

          {/* Action Links */}
          <div className="flex items-center gap-3">
            <a
              href="https://foundation.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-mono text-zinc-300 hover:text-white border border-white/10 hover:border-white/30 transition-all"
            >
              <span>Foundation</span>
              <ArrowUpRight className="w-3 h-3 text-emerald-400" />
            </a>

            <a
              href="https://ng.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-[#E4E4E7] text-[#0A0A0C] hover:bg-white transition-all shadow-md hover:scale-[1.02]"
            >
              <span>Go to Relyvora NG</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------------- */}
      {/* SECTION 1: HERO - THE INGRESS */}
      {/* ----------------------------------------------------------- */}
      <section className="min-h-screen flex flex-col justify-between pt-32 pb-16 px-6 max-w-7xl mx-auto relative">
        <div className="space-y-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-xs font-mono text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>DUAL-LOCK ESCROW PROTOCOL</span>
          </div>
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white uppercase leading-[0.95]">
            Trade with<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-500">
              confidence.
            </span>
          </h1>
          <p className="text-base sm:text-lg text-[#71717A] max-w-lg leading-relaxed font-sans">
            Neutral transaction protocol for African social commerce. Eliminating Pay-on-Delivery failure and fake transfer receipts across WhatsApp, Instagram, and TikTok.
          </p>

          <div className="pt-4 flex flex-wrap items-center gap-4">
            <a
              href="https://ng.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3.5 rounded-full bg-white text-[#0A0A0C] font-bold text-sm tracking-wide hover:bg-zinc-200 transition-all flex items-center gap-2"
            >
              <span>Launch Relyvora NG ↗</span>
            </a>
            <div className="px-4 py-3 rounded-full bg-white/[0.04] border border-white/10 text-xs font-mono text-zinc-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Payments powered by Anchor</span>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="flex items-center justify-between text-xs font-mono text-zinc-500 pt-8 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <ArrowDown className="w-3.5 h-3.5 animate-bounce text-emerald-400" />
            <span>SCROLL TO ENGAGE THE ESCROW JOURNEY</span>
          </div>
          <div className="hidden sm:block">
            STAGE 01 / 04 • THE INGRESS
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- */}
      {/* SECTION 2: THE VAULT - SAFE CUSTODY */}
      {/* ----------------------------------------------------------- */}
      <section className="min-h-screen flex flex-col justify-center px-6 max-w-7xl mx-auto relative">
        <div className="max-w-xl space-y-5 backdrop-blur-xs p-6 sm:p-8 rounded-3xl border border-white/[0.05] bg-[#0A0A0C]/40">
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-emerald-400">
            <Lock className="w-3.5 h-3.5" />
            <span>STAGE 02 • ZERO-TRUST CUSTODY</span>
          </div>
          <h2 className="text-4xl sm:text-6xl font-black text-white uppercase tracking-tight leading-none">
            Funds Locked<br />in Escrow.
          </h2>
          <p className="text-sm sm:text-base text-[#71717A] leading-relaxed">
            Buyer funds are isolated inside a dedicated Anchor virtual deposit account with partner commercial banks. Neither the seller nor the buyer can unilaterally alter or extract the funds until physical delivery criteria are met.
          </p>

          <div className="pt-2 grid grid-cols-2 gap-3 text-xs font-mono text-zinc-300">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="text-emerald-400 font-bold">3% FLAT FEE</div>
              <div className="text-zinc-500 text-[11px] mt-0.5">Transparent &amp; Fair</div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="text-emerald-400 font-bold">CBN-REGULATED</div>
              <div className="text-zinc-500 text-[11px] mt-0.5">Anchor BaaS Custody</div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- */}
      {/* SECTION 3: THE HANDOVER - DISPATCH */}
      {/* ----------------------------------------------------------- */}
      <section className="min-h-screen flex flex-col justify-center items-start lg:items-end px-6 max-w-7xl mx-auto relative">
        <div className="max-w-xl space-y-5 backdrop-blur-xs p-6 sm:p-8 rounded-3xl border border-white/[0.05] bg-[#0A0A0C]/40 text-left">
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-emerald-400">
            <Package className="w-3.5 h-3.5" />
            <span>STAGE 03 • PHYSICAL DISPATCH</span>
          </div>
          <h2 className="text-4xl sm:text-6xl font-black text-white uppercase tracking-tight leading-none">
            Doorstep<br />Verification.
          </h2>
          <p className="text-sm sm:text-base text-[#71717A] leading-relaxed">
            The merchant securely hands goods to independent dispatch couriers. The package arrives at the buyer&apos;s doorstep for on-the-spot physical inspection. No blind bank transfers, and no delivery-day ghosting.
          </p>

          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-xs font-mono text-zinc-300">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Inspection Before Release</span>
            </span>
            <span className="text-zinc-500">Zero PoD Scams</span>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- */}
      {/* SECTION 4: THE RELEASE - PAYOUT */}
      {/* ----------------------------------------------------------- */}
      <section className="min-h-screen flex flex-col justify-between py-24 px-6 max-w-7xl mx-auto relative">
        <div className="max-w-xl space-y-5 backdrop-blur-xs p-6 sm:p-8 rounded-3xl border border-white/[0.05] bg-[#0A0A0C]/40">
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-emerald-400">
            <Zap className="w-3.5 h-3.5" />
            <span>STAGE 04 • INSTANT SETTLEMENT</span>
          </div>
          <h2 className="text-4xl sm:text-6xl font-black text-white uppercase tracking-tight leading-none">
            Instant Payout<br />Released.
          </h2>
          <p className="text-sm sm:text-base text-[#71717A] leading-relaxed">
            Upon satisfying inspection, the buyer hands their secret 6-digit release code to the rider or confirms in-app. The vault shatters, triggering an instant, automated bank transfer into the merchant&apos;s settlement account.
          </p>

          {/* Holographic Code Graphic */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-emerald-500/30 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Verified 6-Digit Handshake
              </div>
              <div className="text-2xl font-mono font-black tracking-widest text-emerald-400">
                842 - 195
              </div>
            </div>
            <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold border border-emerald-400/30">
              SETTLED ⚡
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <a
              href="https://ng.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-[#0A0A0C] font-bold text-sm tracking-wide transition-all shadow-lg shadow-emerald-500/20"
            >
              Start Trading on Relyvora NG ↗
            </a>
            <Link
              href="/vendor/onboarding"
              className="px-5 py-3.5 rounded-full bg-white/[0.06] hover:bg-white/10 text-white font-mono text-xs transition-all border border-white/10"
            >
              Merchant KYC Activation
            </Link>
          </div>
        </div>

        {/* Global Institutional Regulatory Footer */}
        <footer className="pt-12 border-t border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-zinc-500">
          <div className="flex flex-wrap items-center gap-6 font-mono text-zinc-400">
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/disputes" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              Dispute Policy
            </Link>
            <a href="https://foundation.relyvora.com" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">
              Relyvora Foundation ↗
            </a>
          </div>

          <div className="font-mono text-[11px] text-zinc-500 text-center md:text-right">
            Relyvora Technologies Limited (RC 9982218 | TIN 2623717709692). Abuja, Nigeria.
          </div>
        </footer>
      </section>
    </div>
  );
}
