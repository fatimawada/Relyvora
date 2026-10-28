'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowRight,
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  Truck, 
  Share2, 
  KeyRound, 
  HelpCircle,
  CreditCard,
  MessageCircle,
  Zap,
  Check,
  Store,
  Sparkles,
  ShoppingBag,
  Clock,
  RotateCcw
} from 'lucide-react';
import { CorporateFAQ } from '@/components/corporate/CorporateFAQ';
import { HeroCrossfade } from '@/components/corporate/HeroCrossfade';
import { TrustMarquee } from '@/components/corporate/TrustMarquee';
import { Testimonials } from '@/components/corporate/Testimonials';

export default function CorporateHomePage() {
  const nigeriaAppUrl = process.env.NODE_ENV === 'production' 
    ? 'https://ng.relyvora.com' 
    : '/vendor';

  return (
    <div className="w-full text-[#090E1A] bg-[#FAF8F5] selection:bg-[#047857] selection:text-white">
      {/* 1. DYNAMIC TWO-COLUMN HERO SECTION WITH RADIAL GLOW & FLOATING FINTECH CARDS */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-32 px-4 sm:px-6 lg:px-8 overflow-hidden border-b border-[#E7E4DC]">
        {/* Glowing atmospheric radial gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/15 via-teal-500/5 to-transparent pointer-events-none blur-3xl -z-10" />
        <div className="absolute top-1/4 -right-20 w-[450px] h-[450px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-emerald-400/10 via-transparent to-transparent pointer-events-none blur-2xl -z-10" />
        <div className="absolute bottom-10 -left-20 w-[400px] h-[400px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-slate-900/5 via-transparent to-transparent pointer-events-none blur-2xl -z-10" />

        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* LEFT COLUMN: Punchy headline, subtext, CTAs, trust stats */}
            <div className="lg:col-span-7 space-y-8 animate-fade-in-up">
              {/* Trust Badge Pill */}
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-mono text-[11px] tracking-wide uppercase">
                  Africa's Instant Social Commerce Trust Layer • Live in Nigeria
                </span>
              </div>

              {/* Main Headline */}
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#090E1A] tracking-tight leading-[1.12]">
                  Sell on Instagram, WhatsApp & TikTok <br className="hidden sm:inline" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700">
                    With 100% Escrow Protection.
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-[#475569] max-w-xl leading-relaxed font-normal">
                  Relyvora eliminates <span className="font-semibold text-[#090E1A]">Payment-on-Delivery losses</span> and <span className="font-semibold text-[#090E1A]">fake transfer alerts</span>. Buyers lock funds safely in escrow, and vendors receive instant bank payout the second items are verified at doorstep delivery.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-1">
                <a
                  href={nigeriaAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-700/25 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-700/35 active:translate-y-0"
                >
                  <Store className="w-5 h-5 text-emerald-200" />
                  <span>Go to Relyvora NG</span>
                  <ArrowRight className="w-4 h-4 ml-0.5" />
                </a>

                <a
                  href="#how-it-works"
                  className="px-7 py-4 rounded-xl bg-white hover:bg-slate-50 border border-[#E7E4DC] text-[#090E1A] font-semibold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span>See How Escrow Works</span>
                  <ArrowUpRight className="w-4 h-4 text-[#64748B]" />
                </a>
              </div>

              {/* Trust Metrics Pill Bar */}
              <div className="pt-4 grid grid-cols-3 gap-3 max-w-lg border-t border-[#E7E4DC]/80">
                <div className="space-y-0.5">
                  <div className="text-xl sm:text-2xl font-black text-[#090E1A] font-mono tracking-tight">₦0</div>
                  <div className="text-[11px] sm:text-xs text-[#64748B] font-medium leading-tight">PoD Scams & Lost Logistics</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono tracking-tight">3%</div>
                  <div className="text-[11px] sm:text-xs text-[#64748B] font-medium leading-tight">Flat Fee (Min ₦500)</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xl sm:text-2xl font-black text-[#090E1A] font-mono tracking-tight">6-Digit</div>
                  <div className="text-[11px] sm:text-xs text-[#64748B] font-medium leading-tight">Doorstep Handover Keys</div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Lifestyle African Merchant Visual + Floating Interactive Fintech Cards */}
            <div className="lg:col-span-5 relative mt-6 lg:mt-0">
              {/* Outer decorative ambient glows */}
              <div className="absolute -inset-4 bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-transparent rounded-[2.5rem] blur-2xl -z-10" />

              {/* Crossfading lifestyle background (floating cards below stay fixed) */}
              <HeroCrossfade />

              {/* FLOATING CARD 1 (Top Left): "Escrow Locked & Secure" */}
              <div className="absolute -top-6 -left-4 sm:-left-8 z-20 animate-float">
                <div className="p-3.5 sm:p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-xl shadow-slate-900/10 space-y-1.5 max-w-[210px] sm:max-w-[230px] transition-transform hover:scale-105">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      FUNDS LOCKED
                    </span>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-base sm:text-lg font-black text-[#090E1A] font-mono tracking-tight">
                    ₦45,000.00
                  </div>
                  <div className="text-[10px] text-[#64748B] truncate">
                    Order #RV-7821 • Instagram DM
                  </div>
                </div>
              </div>

              {/* FLOATING CARD 2 (Bottom Right): "6-Digit Release Key" */}
              <div className="absolute -bottom-6 -right-3 sm:-right-6 z-20 animate-float-delayed">
                <div className="p-3.5 sm:p-4 rounded-2xl bg-[#090E1A] text-white border border-slate-700/80 shadow-2xl space-y-2 max-w-[220px] sm:max-w-[240px] transition-transform hover:scale-105">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#A7F3D0]">
                    <span className="uppercase font-bold tracking-wider">Release Code</span>
                    <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="p-2 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-center">
                    <span className="font-mono text-base sm:text-lg font-black tracking-widest text-[#FCD34D]">
                      842 - 195
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-300">
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Instant Doorstep Settlement</span>
                  </div>
                </div>
              </div>

              {/* FLOATING CARD 3 (Center Right Mini Pill) */}
              <div className="absolute top-1/2 -right-4 sm:-right-8 z-10 animate-float-slow hidden sm:block">
                <div className="px-3.5 py-2 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg flex items-center gap-2 text-xs font-semibold text-[#090E1A]">
                  <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>Instant Payout: ₦43,650</span>
                </div>
              </div>

            </div>

          </div>
        </div>
      </section>

      <TrustMarquee />

      {/* 2. THE PROBLEM SECTION: WHY SOCIAL COMMERCE BREAKS IN AFRICA */}
      <section id="problem" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-b border-[#E7E4DC] bg-white">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="max-w-2xl space-y-3">
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#047857]">
              The Core Problem
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              A $20B African market held back by fear and friction.
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              Social commerce across Nigeria is booming on DMs and chats, but the trust gap costs vendors and shoppers millions of Naira every single day.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="p-7 rounded-2xl bg-[#FAF8F5] border border-[#E7E4DC] shadow-xs hover:border-[#CBD5E1] hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 space-y-4 group">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Truck className="w-6 h-6 stroke-[2]" />
              </div>
              <h3 className="text-lg font-bold text-[#090E1A]">Payment-on-Delivery Bleed</h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Dispatch riders arrive, but the customer changed their mind, doesn't answer phone calls, or refuses delivery. Nigerian vendors lose up to 35% of operational margin on wasted delivery fees.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-7 rounded-2xl bg-[#FAF8F5] border border-[#E7E4DC] shadow-xs hover:border-[#CBD5E1] hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 space-y-4 group">
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ShoppingBag className="w-6 h-6 stroke-[2]" />
              </div>
              <h3 className="text-lg font-bold text-[#090E1A]">"What I Ordered vs What I Got"</h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Shoppers are terrified to pay upfront to social media accounts. Fake hair plugs, counterfeit sneakers, and non-delivery scams make pre-paying feel like gambling.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-7 rounded-2xl bg-[#FAF8F5] border border-[#E7E4DC] shadow-xs hover:border-[#CBD5E1] hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 space-y-4 group">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                <AlertTriangle className="w-6 h-6 stroke-[2]" />
              </div>
              <h3 className="text-lg font-bold text-[#090E1A]">Fake Bank Transfer Alerts</h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Vendors get tricked into dispatching precious inventory by photoshopped credit receipts and fake SMS alerts that never actually reflect in their real bank balance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. BENTO-BOX: HOW IT WORKS (VARIED SIZES, HIGH-ENERGY FINTECH CARDS) */}
      <section id="how-it-works" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-b border-[#E7E4DC] bg-[#FAF8F5]">
        <div className="max-w-6xl mx-auto space-y-14">
          <div className="max-w-2xl space-y-3">
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#047857]">
              The 4-Step Escrow Workflow
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Turn social chats into safe, guaranteed transactions.
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              No complicated apps or paperwork. Relyvora works entirely over secure web links inside WhatsApp, Instagram DMs, and TikTok.
            </p>
          </div>

          {/* Dynamic Bento Box Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Bento Card 1: Large (Span 7) - Link Generation */}
            <div className="md:col-span-7 p-7 sm:p-9 rounded-3xl bg-white border border-[#E7E4DC] shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 space-y-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    STEP 01 • IN 30 SECONDS
                  </span>
                  <Share2 className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-[#090E1A]">
                  Vendor Generates a Protected Link
                </h3>
                <p className="text-sm text-[#475569] leading-relaxed max-w-lg">
                  Enter item name, price, and delivery location. Relyvora instantly produces an escrow payment link you drop directly into your customer's WhatsApp chat or Instagram DM.
                </p>
              </div>

              {/* Interactive Mockup Preview inside card */}
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-2.5 font-sans">
                <div className="flex items-center gap-2 text-xs text-[#64748B] font-mono">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp Chat Preview</span>
                </div>
                <div className="p-3.5 rounded-xl bg-white border border-[#E7E4DC] shadow-xs flex items-center justify-between gap-4">
                  <div className="space-y-0.5 truncate">
                    <div className="text-xs font-bold text-[#090E1A] truncate">
                      relyvora.com/pay/rv-4821
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      Human Hair Wig (30") • ₦85,000 + ₦2,500 Delivery
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-emerald-600 text-white shrink-0">
                    Pay Safely ↗
                  </span>
                </div>
              </div>
            </div>

            {/* Bento Card 2: Medium (Span 5) - Escrow Custody */}
            <div className="md:col-span-5 p-7 sm:p-9 rounded-3xl bg-white border border-[#E7E4DC] shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 space-y-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    STEP 02 • SAFE CUSTODY
                  </span>
                  <Lock className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-[#090E1A]">
                  Buyer Locks Payment
                </h3>
                <p className="text-sm text-[#475569] leading-relaxed">
                  The buyer pays via bank transfer, card, or USSD. Funds are safely locked in escrow custody. The vendor can't run off, and the buyer can't cancel without cause.
                </p>
              </div>

              {/* Status Graphic */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-emerald-900">
                  <span>ESCROW STATUS</span>
                  <span className="text-emerald-700">100% SECURE</span>
                </div>
                <div className="text-xl font-black text-emerald-900 font-mono">
                  ₦87,550 Locked
                </div>
                <div className="text-[10px] text-emerald-700">
                  Protected by Relyvora Protocol • Vendor notified to ship
                </div>
              </div>
            </div>

            {/* Bento Card 3: Medium (Span 5) - Doorstep Inspection */}
            <div className="md:col-span-5 p-7 sm:p-9 rounded-3xl bg-white border border-[#E7E4DC] shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 space-y-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    STEP 03 • PHYSICAL HANDOVER
                  </span>
                  <Truck className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-[#090E1A]">
                  Doorstep Unbox & Inspection
                </h3>
                <p className="text-sm text-[#475569] leading-relaxed">
                  The dispatch rider delivers the package. The customer unboxes and inspects the goods on the spot to verify correct quality, size, and condition.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-2 text-xs">
                <div className="flex items-center gap-2 text-[#090E1A] font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Unbox & verify item matches agreed video</span>
                </div>
                <div className="flex items-center gap-2 text-[#090E1A] font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Zero cash collection. Zero rider robbery risk</span>
                </div>
              </div>
            </div>

            {/* Bento Card 4: Large (Span 7) - 6-Digit Key Settlement */}
            <div className="md:col-span-7 p-7 sm:p-9 rounded-3xl bg-white border border-[#E7E4DC] shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 space-y-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    STEP 04 • INSTANT RELEASE
                  </span>
                  <KeyRound className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-[#090E1A]">
                  6-Digit Release Key & Payout
                </h3>
                <p className="text-sm text-[#475569] leading-relaxed max-w-lg">
                  Once satisfied, the buyer reveals their private 6-digit release key to the dispatch rider or vendor. Entering the code immediately releases funds to the vendor's bank account.
                </p>
              </div>

              {/* Code Entry Mockup */}
              <div className="p-4 rounded-2xl bg-[#090E1A] text-white border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="text-[11px] font-mono text-[#A7F3D0] uppercase font-bold">
                    Release Key Verified
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-black tracking-widest text-[#FCD34D]">
                    842 - 195
                  </div>
                </div>
                <div className="px-4 py-2.5 rounded-xl bg-emerald-600/90 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-md">
                  <Zap className="w-4 h-4" />
                  <span>Instant Payout Sent ⚡</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. BENTO-BOX: THE ECOSYSTEM & INFRASTRUCTURE (VIBRANT FINTECH GLOW) */}
      <section id="ecosystem" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-[#090E1A] text-white relative overflow-hidden">
        {/* Ambient Glowing Orbs */}
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto space-y-14 relative z-10">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-[#A7F3D0]">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>The Relyvora Architecture</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-white tracking-tight">
              An interoperable trust layer for modern African commerce.
            </h2>
            <p className="text-base text-slate-400 leading-relaxed">
              We connect fragmented social media chats, independent courier fleets, and regulated African financial settlement rails into one synchronized flow.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Card 1: Social Ingress (Span 6) */}
            <div className="md:col-span-6 p-7 sm:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1.5 transition-all duration-300 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <MessageCircle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Social Commerce Ingress</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Instagram DMs, WhatsApp Business, TikTok Shop, and Facebook Marketplace. Relyvora transforms unverified direct messages into secure, binding commerce contracts.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  WhatsApp
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  Instagram
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  TikTok
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  Facebook
                </span>
              </div>
            </div>

            {/* Card 2: Neutral Escrow Engine (Span 6) */}
            <div className="md:col-span-6 p-7 sm:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1.5 transition-all duration-300 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Neutral Escrow Engine</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Deterministic escrow state machine. Funds can never be released by vendor claim alone, nor held arbitrarily. Payouts require genuine buyer inspection and code confirmation.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                  3% Transparent Fee
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                  Locked Until Inspection
                </span>
              </div>
            </div>

            {/* Card 3: Logistics & Couriers (Span 4) */}
            <div className="md:col-span-4 p-6 sm:p-7 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl hover:border-emerald-500/50 hover:-translate-y-1.5 transition-all duration-300 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white">Courier Network Interop</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Compatible with private dispatch riders, GIG, Gokada, and third-party logistics. Couriers never carry cash or deal with change.
              </p>
            </div>

            {/* Card 4: 1-Click Dispute Freeze (Span 4) */}
            <div className="md:col-span-4 p-6 sm:p-7 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl hover:border-emerald-500/50 hover:-translate-y-1.5 transition-all duration-300 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white">1-Click Dispute Freeze</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Item damaged or incorrect? The buyer taps freeze on their phone. Payout is stopped immediately until replaced or 100% refunded.
              </p>
            </div>

            {/* Card 5: African Banking Rails (Span 4) */}
            <div className="md:col-span-4 p-6 sm:p-7 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl hover:border-emerald-500/50 hover:-translate-y-1.5 transition-all duration-300 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white">Local Financial Rails</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Designed to settle on NIBSS instant bank rails in Nigeria, M-Pesa in Kenya, and Mobile Money in Ghana with zero delay.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 5. PAN-AFRICAN MARKETS SECTION: NIGERIA ACTIVE & EXPANSION ROADMAP */}
      <section id="markets" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-b border-[#E7E4DC] bg-white">
        <div className="max-w-6xl mx-auto space-y-14">
          <div className="max-w-2xl space-y-3">
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#047857]">
              Regional Presence
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Live in Nigeria. Scaling across Africa.
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              We started where the social commerce volume and trust gap are largest, building a scalable escrow model ready to deploy into major African hubs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Nigeria - NOW LIVE */}
            <div className="p-6 rounded-3xl bg-gradient-to-b from-emerald-50/70 to-white border-2 border-emerald-500/60 shadow-lg shadow-emerald-500/10 hover:-translate-y-1.5 transition-all duration-300 space-y-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🇳🇬</span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-600 text-white flex items-center gap-1 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    NOW LIVE
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#090E1A]">Nigeria</h3>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Operational nationwide across all 36 states for Instagram, WhatsApp, TikTok, and Facebook merchants.
                </p>
                <div className="text-[11px] font-mono font-semibold text-emerald-800">
                  Currency: Naira (NGN ₦)
                </div>
              </div>

              <a
                href={nigeriaAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
              >
                <span>Go to Relyvora NG</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Ghana - COMING SOON */}
            <div className="p-6 rounded-3xl bg-[#FAF8F5] border border-[#E7E4DC] shadow-xs hover:-translate-y-1.5 transition-all duration-300 space-y-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🇬🇭</span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#E8F5E9] text-[#047857] border border-[#C8E6C9]">
                    COMING SOON
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#090E1A]">Ghana</h3>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Empowering peer-to-peer sellers nationwide across Ghana with Mobile Money (MTN & Telecel) escrow rails.
                </p>
                <div className="text-[11px] font-mono text-[#64748B]">
                  Currency: Cedis (GHS ₵)
                </div>
              </div>
            </div>

            {/* Kenya - COMING SOON */}
            <div className="p-6 rounded-3xl bg-[#FAF8F5] border border-[#E7E4DC] shadow-xs hover:-translate-y-1.5 transition-all duration-300 space-y-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🇰🇪</span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#E8F5E9] text-[#047857] border border-[#C8E6C9]">
                    COMING SOON
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#090E1A]">Kenya</h3>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Instant M-Pesa STK push escrow for creators and merchants selling nationwide across Kenya.
                </p>
                <div className="text-[11px] font-mono text-[#64748B]">
                  Currency: Shillings (KES KSh)
                </div>
              </div>
            </div>

            {/* South Africa - COMING SOON */}
            <div className="p-6 rounded-3xl bg-[#FAF8F5] border border-[#E7E4DC] shadow-xs hover:-translate-y-1.5 transition-all duration-300 space-y-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🇿🇦</span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#E8F5E9] text-[#047857] border border-[#C8E6C9]">
                    COMING SOON
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#090E1A]">South Africa</h3>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Connecting social merchants nationwide across South Africa with Instant EFT and card transaction protection.
                </p>
                <div className="text-[11px] font-mono text-[#64748B]">
                  Currency: Rand (ZAR R)
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. TRUST & SAFETY: BUILT-IN SAFEGUARDS */}
      <Testimonials />

      <section id="trust-and-safety" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-b border-[#E7E4DC] bg-[#FAF8F5]">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="max-w-2xl space-y-3">
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#047857]">
              Security & Transparency
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Built-in safeguards that protect both sides.
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              We engineered Relyvora to prevent fraud before it happens. Zero chargeback scams. Zero fake receipts. Zero uninspected deliveries.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-7 rounded-3xl bg-white border border-[#E7E4DC] shadow-xs space-y-3 hover:shadow-lg transition-shadow">
              <KeyRound className="w-5 h-5 text-emerald-700" />
              <h3 className="text-base font-bold text-[#090E1A]">
                6-Digit Release Keys
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Funds in Relyvora only unlock when the buyer verifies the 6-digit release code issued to their phone upon checkout. Vendors cannot claim cash without buyer inspection, and buyers cannot take goods without sharing the code.
              </p>
            </div>

            <div className="p-7 rounded-3xl bg-white border border-[#E7E4DC] shadow-xs space-y-3 hover:shadow-lg transition-shadow">
              <AlertTriangle className="w-5 h-5 text-emerald-700" />
              <h3 className="text-base font-bold text-[#090E1A]">
                1-Click Dispute Freeze
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                If the item arrives damaged, wrong in size, or missing pieces, the buyer freezes the transaction with one tap. Code release is immediately locked, suspending payout until resolved.
              </p>
            </div>

            <div className="p-7 rounded-3xl bg-white border border-[#E7E4DC] shadow-xs space-y-3 hover:shadow-lg transition-shadow">
              <HelpCircle className="w-5 h-5 text-emerald-700" />
              <h3 className="text-base font-bold text-[#090E1A]">
                Interactive Beta Sandbox
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Our active deployment currently operates in an interactive developer sandbox using simulated payments. This lets vendors, dispatch riders, and shoppers test the complete flow end-to-end with zero financial risk.
              </p>
            </div>
          </div>

          {/* Institutional Compliance Notice Box */}
          <div className="p-6 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2 text-xs text-[#475569]">
            <span className="font-mono font-bold uppercase text-[11px] text-[#090E1A] block">
              Beta Architecture & Regulatory Note
            </span>
            <p className="leading-relaxed">
              Relyvora provides transaction protection technology. We are currently testing in an interactive developer sandbox. Live commercial banking settlements and regulated custodial accounts will activate alongside our licensed institutional financial partners as we expand across Africa. No real money is collected or transferred during this preview.
            </p>
          </div>
        </div>
      </section>

      {/* 7. FREQUENTLY ASKED QUESTIONS */}
      <CorporateFAQ />

      {/* 8. HIGH-ENERGY CLOSING CTA WITH GLOWING RADIAL GRADIENT */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-[#090E1A] text-white relative overflow-hidden">
        {/* Glowing radial gradient backdrop */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[450px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/25 via-teal-500/10 to-transparent blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-[#A7F3D0] border border-slate-700">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>START IN SECONDS</span>
          </div>

          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-serif font-normal tracking-tight text-white max-w-2xl mx-auto leading-tight">
            Ready to build instant trust into your social sales?
          </h2>

          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
            Test the escrow link generator, simulated buyer checkout, and doorstep release code verification in our live Nigerian interactive beta.
          </p>

          <div className="flex items-center justify-center pt-2">
            <a
              href={nigeriaAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-9 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-sm sm:text-base font-bold flex items-center justify-center gap-2.5 shadow-2xl shadow-emerald-500/30 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-emerald-500/40 active:translate-y-0"
            >
              <span>Go to Relyvora NG</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
