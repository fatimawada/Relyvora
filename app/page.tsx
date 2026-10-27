'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDown, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  Truck, 
  Share2, 
  KeyRound, 
  Mail, 
  HelpCircle,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { TrustNetworkDiagram } from '@/components/corporate/TrustNetworkDiagram';
import { CorporateFAQ } from '@/components/corporate/CorporateFAQ';

export default function CorporateHomePage() {
  const nigeriaAppUrl = process.env.NODE_ENV === 'production' 
    ? 'https://ng.relyvora.com' 
    : '/vendor';

  return (
    <div className="w-full text-[#090E1A] bg-[#FAF8F5]">
      {/* 1. HERO SECTION */}
      <section className="pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6 border-b border-[#E7E4DC]">
        <div className="max-w-5xl mx-auto space-y-10">
          {/* Overline & Category */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-[#047857]">
              <span>The Trust Layer for African Social Commerce</span>
              <span className="text-[#94A3B8]">•</span>
              <span>Live in Nigeria</span>
            </div>

            {/* Editorial Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-serif font-normal tracking-tight text-[#090E1A] leading-[1.08] max-w-4xl">
              Turn social chats into safe, guaranteed transactions.
            </h1>
          </div>

          {/* Subtitle & Mission */}
          <p className="text-lg sm:text-xl text-[#334155] max-w-3xl leading-relaxed font-sans font-normal">
            Millions of Africans buy and sell daily on <strong className="text-[#090E1A] font-semibold">WhatsApp</strong>, <strong className="text-[#090E1A] font-semibold">Instagram</strong>, <strong className="text-[#090E1A] font-semibold">TikTok</strong>, and <strong className="text-[#090E1A] font-semibold">Facebook</strong>. Relyvora locks payments safely in escrow until the customer inspects and approves the delivery—eliminating fake alerts, bogus orders, and payment-on-delivery headaches.
          </p>

          {/* Editorial CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
            <a
              href={nigeriaAppUrl}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-xs sm:text-sm font-bold bg-[#090E1A] text-white hover:bg-[#1E293B] transition-all shadow-xs cursor-pointer"
            >
              <span>Launch Nigeria App</span>
              <span className="text-xs">🇳🇬</span>
              <ArrowUpRight className="w-4 h-4 opacity-80" />
            </a>

            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-xs sm:text-sm font-semibold bg-[#EFECE6] text-[#090E1A] hover:bg-[#E7E3D8] transition-colors border border-[#DDD8CE]"
            >
              <span>See How It Works</span>
              <ArrowDown className="w-3.5 h-3.5 opacity-70" />
            </a>
          </div>

          {/* Distinctive Visual Motif: Architecture Diagram */}
          <div className="pt-6">
            <TrustNetworkDiagram />
          </div>
        </div>
      </section>

      {/* 2. THE PROBLEM: WHY SOCIAL COMMERCE BREAKS */}
      <section id="problem" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-white">
        <div className="max-w-5xl mx-auto space-y-14">
          <div className="space-y-3 max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              The Trust Gap
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              A $20B market held back by fear and friction
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              Buyers refuse to pay upfront because they have been burned before. Sellers refuse to ship without payment because orders get rejected. Both sides lose.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Pillar 1: Payment on Delivery Dilemma */}
            <div className="space-y-4 p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC]">
              <div className="w-9 h-9 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A] font-mono text-xs font-bold">
                01
              </div>
              <h3 className="text-lg font-bold text-[#090E1A]">
                Payment-on-Delivery is Broken
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Up to 70% of social orders rely on cash or transfer on delivery. But with 30%+ rejection rates, couriers handling cash, and wasted delivery fees, payment-on-delivery eats up merchant profits and stalls growth.
              </p>
            </div>

            {/* Pillar 2: Buyer Information Asymmetry */}
            <div className="space-y-4 p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC]">
              <div className="w-9 h-9 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A] font-mono text-xs font-bold">
                02
              </div>
              <h3 className="text-lg font-bold text-[#090E1A]">
                "What I Ordered vs. What I Got"
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Sending money to a stranger's personal bank account on Instagram feels like a gamble. When an item arrives fake, damaged, or does not arrive at all, buyers have zero protection and stop shopping online.
              </p>
            </div>

            {/* Pillar 3: Merchant Payment Vulnerabilities */}
            <div className="space-y-4 p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC]">
              <div className="w-9 h-9 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A] font-mono text-xs font-bold">
                03
              </div>
              <h3 className="text-lg font-bold text-[#090E1A]">
                Fake Alerts & Ghost Buyers
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Merchants lose millions to edited screenshot receipts and fake SMS bank alerts. Even worse, impulsive buyers place orders and switch off their phones the moment the delivery rider arrives at their doorstep.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HOW RELYVORA WORKS: THE FLOW */}
      <section id="how-it-works" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-[#FAF8F5]">
        <div className="max-w-5xl mx-auto space-y-16">
          <div className="space-y-3 max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#047857]">
              Simple & Instant
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Four quick steps from social chat to doorstep payout
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              Relyvora makes buying and selling on social media as safe and seamless as checking out on any global e-commerce site.
            </p>
          </div>

          {/* Stepper Grid */}
          <div className="space-y-6">
            {[
              {
                step: '01',
                title: 'Generate an Escrow Link in 30 Seconds',
                description: 'The vendor enters the item price and description. Relyvora calculates the 3% buyer protection fee (minimum ₦500 in Nigeria) and creates a shareable link ready to paste directly into WhatsApp, Instagram DMs, or TikTok chats.',
                detail: 'Clean, transparent price breakdown with pre-written WhatsApp message.',
              },
              {
                step: '02',
                title: 'Buyer Locks Funds in Safe Escrow',
                description: 'The buyer opens the link, reviews the item details, and locks the total amount via card, bank transfer, or USSD. The vendor is notified instantly that payment is locked and guaranteed.',
                detail: '100% pre-funded buyer commitment before the seller touches inventory.',
              },
              {
                step: '03',
                title: 'Vendor Ships with Complete Confidence',
                description: 'Knowing the funds are secured in escrow, the vendor books the dispatch rider. Relyvora automatically generates a confidential 6-digit release code sent directly to the buyer.',
                detail: 'The buyer is reminded not to share the code until the package is physically inspected.',
              },
              {
                step: '04',
                title: 'Inspect & Unlock Instant Payout',
                description: 'When the rider arrives, the buyer unboxes and inspects the item. Once satisfied, the buyer hands the 6-digit code to the rider. The vendor enters the code to instantly unlock their payout. Wrong item? Freeze escrow with 1 click.',
                detail: 'Instant verification code releases money straight to the vendor balance.',
              },
            ].map((item) => (
              <div 
                key={item.step}
                className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 sm:p-8 rounded-xl bg-white border border-[#E7E4DC] hover:border-[#CBD5E1] transition-all"
              >
                <div className="md:col-span-2 font-mono text-2xl font-bold text-[#047857]">
                  {item.step}
                </div>
                <div className="md:col-span-6 space-y-2">
                  <h3 className="text-lg font-bold text-[#090E1A]">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                    {item.description}
                  </p>
                </div>
                <div className="md:col-span-4 p-4 rounded-lg bg-[#FAF8F5] border border-[#E7E4DC] self-center">
                  <span className="text-[11px] font-mono uppercase tracking-wide text-[#64748B] block mb-1">
                    The Guarantee
                  </span>
                  <p className="text-xs text-[#334155] font-medium leading-snug">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. THE ECOSYSTEM: CONNECTING SOCIAL COMMERCE RAILS */}
      <section id="ecosystem" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-white">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="space-y-3 max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              The Ecosystem
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Connecting social chats, couriers, and instant payments
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              Relyvora does not force merchants or buyers onto a new app. We plug directly into the tools African businesses and consumers use every single day.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl border border-[#E7E4DC] space-y-3 bg-[#FAF8F5]">
              <div className="w-8 h-8 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A]">
                <Share2 className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#090E1A]">
                Any Social Surface
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Sell where conversations happen. Relyvora links open instantly inside WhatsApp chats, Instagram DMs, TikTok bios, and Facebook Marketplace with zero app downloads required.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-[#E7E4DC] space-y-3 bg-[#FAF8F5]">
              <div className="w-8 h-8 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A]">
                <Truck className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#090E1A]">
                Any Courier or Dispatch Rider
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Compatible with any motorcycle dispatch rider or interstate bus courier. Replacing risky cash collections with digital 6-digit release codes protects riders from theft and stops rejected deliveries.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-[#E7E4DC] space-y-3 bg-[#FAF8F5]">
              <div className="w-8 h-8 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A]">
                <Building2 className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#090E1A]">
                Instant Digital Payments
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Accept payments via local bank transfer, virtual accounts, debit cards, and regional mobile money. Instant verification ensures sellers are never fooled by fabricated alert screenshots.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. MARKETS: LIVE IN NIGERIA. SCALING ACROSS AFRICA. */}
      <section id="markets" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-[#FAF8F5]">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="space-y-3 max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#047857]">
              Regional Rollout
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Live in Nigeria. Scaling across Africa.
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              We launched in Nigeria to solve payment-on-delivery headaches for thousands of Instagram and WhatsApp vendors. Next up: bringing instant trust to social commerce hubs across West, East, and Southern Africa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Operational Market Card: Nigeria */}
            <div className="md:col-span-6 p-7 rounded-2xl bg-white border-2 border-[#090E1A] shadow-sm flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">🇳🇬</span>
                    <div>
                      <h3 className="text-xl font-bold text-[#090E1A]">Nigeria</h3>
                      <span className="font-mono text-[11px] text-[#64748B]">ng.relyvora.com</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#E8F5E9] text-[#047857] border border-[#C8E6C9] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#047857] animate-pulse"></span>
                    <span>LIVE MARKET</span>
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                  Our flagship active deployment. Powering fast-growing Instagram and WhatsApp businesses in Lagos, Abuja, and nationwide delivery corridors. Instant link creation, automated fee calculation, and 6-digit doorstep release codes.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-xs">
                  <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#E7E4DC]">
                    <span className="text-[#64748B] text-[10px] block">CURRENCY</span>
                    <span className="font-bold text-[#090E1A]">Nigerian Naira (₦)</span>
                  </div>
                  <div className="p-3 bg-[#FAF8F5] rounded-lg border border-[#E7E4DC]">
                    <span className="text-[#64748B] text-[10px] block">PROTECTION FEE</span>
                    <span className="font-bold text-[#047857]">3% (Min ₦500)</span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <a
                  href={nigeriaAppUrl}
                  className="w-full py-3.5 px-4 rounded-lg bg-[#090E1A] hover:bg-[#1E293B] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <span>Launch Nigeria Application</span>
                  <ArrowUpRight className="w-4 h-4 opacity-80" />
                </a>
              </div>
            </div>

            {/* Next Markets */}
            <div className="md:col-span-6 grid grid-cols-1 gap-4">
              {/* Ghana */}
              <div className="p-5 rounded-xl bg-white border border-[#E7E4DC] flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🇬🇭</span>
                    <h4 className="text-sm font-bold text-[#090E1A]">Ghana</h4>
                  </div>
                  <p className="text-xs text-[#475569]">
                    Expanding to Accra and Kumasi merchants with native Mobile Money escrow (MTN MoMo, Telecel Cash).
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#E8F5E9] text-[#047857] border border-[#C8E6C9] shrink-0">
                  WAITLIST OPEN
                </span>
              </div>

              {/* Kenya */}
              <div className="p-5 rounded-xl bg-white border border-[#E7E4DC] flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🇰🇪</span>
                    <h4 className="text-sm font-bold text-[#090E1A]">Kenya</h4>
                  </div>
                  <p className="text-xs text-[#475569]">
                    Bringing instant M-Pesa STK push escrow to Instagram and TikTok sellers in Nairobi and Mombasa.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#E8F5E9] text-[#047857] border border-[#C8E6C9] shrink-0">
                  WAITLIST OPEN
                </span>
              </div>

              {/* South Africa */}
              <div className="p-5 rounded-xl bg-white border border-[#E7E4DC] flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🇿🇦</span>
                    <h4 className="text-sm font-bold text-[#090E1A]">South Africa</h4>
                  </div>
                  <p className="text-xs text-[#475569]">
                    Connecting social merchants in Joburg and Cape Town with Instant EFT and card transaction protection.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#E8F5E9] text-[#047857] border border-[#C8E6C9] shrink-0">
                  WAITLIST OPEN
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. TRUST & SAFETY: BUILT-IN SAFEGUARDS */}
      <section id="trust-and-safety" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-white">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="space-y-3 max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Trust & Security
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Built-in safeguards that protect both sides
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              We engineered Relyvora from the ground up to prevent fraud before it happens. Zero chargeback scams. Zero fake receipts. Zero uninspected deliveries.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-3">
              <KeyRound className="w-5 h-5 text-[#047857]" />
              <h3 className="text-sm font-bold text-[#090E1A]">
                6-Digit Release Keys
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                Funds in Relyvora only unlock when the buyer verifies the 6-digit release code issued to their phone upon checkout. Vendors cannot claim cash without buyer inspection, and buyers cannot take goods without sharing the code.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-3">
              <AlertTriangle className="w-5 h-5 text-[#047857]" />
              <h3 className="text-sm font-bold text-[#090E1A]">
                1-Click Dispute Freeze
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                If the item arrives damaged, wrong in size, or missing pieces, the buyer freezes the transaction with one tap. Code release is immediately locked, suspending payout until resolved.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-3">
              <HelpCircle className="w-5 h-5 text-[#047857]" />
              <h3 className="text-sm font-bold text-[#090E1A]">
                Interactive Beta Sandbox
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                Our active deployment currently operates in an interactive developer sandbox using simulated payments. This lets vendors, dispatch riders, and shoppers test the complete flow end-to-end with zero financial risk.
              </p>
            </div>
          </div>

          {/* Institutional Compliance Notice Box */}
          <div className="p-6 rounded-xl bg-[#F3EFEA] border border-[#E7E4DC] space-y-2 text-xs text-[#475569]">
            <span className="font-mono font-bold uppercase text-[11px] text-[#090E1A] block">
              Beta Architecture & Licensing Note
            </span>
            <p className="leading-relaxed">
              Relyvora provides transaction protection technology. We are currently testing in an interactive developer sandbox. Live commercial banking settlements and regulated custodial accounts will activate alongside our licensed institutional financial partners as we expand across Africa. No real money is collected or transferred during this preview.
            </p>
          </div>
        </div>
      </section>

      {/* 7. FREQUENTLY ASKED QUESTIONS */}
      <CorporateFAQ />

      {/* 8. CLOSING CTA & PARTNERSHIPS */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 bg-[#090E1A] text-white">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-[#1E293B] text-[#A7F3D0] border border-[#334155]">
            <span>START IN SECONDS</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-serif font-normal tracking-tight text-white max-w-2xl mx-auto">
            Ready to build instant trust into your social sales?
          </h2>

          <p className="text-sm sm:text-base text-[#94A3B8] max-w-xl mx-auto leading-relaxed">
            Test the escrow link generator, simulated buyer checkout, and doorstep release code verification in our live Nigerian interactive beta.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <a
              href={nigeriaAppUrl}
              className="w-full sm:w-auto px-7 py-4 rounded-lg bg-[#047857] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <span>Launch Nigeria Application</span>
              <span className="text-sm">🇳🇬</span>
              <ArrowUpRight className="w-4 h-4 opacity-80" />
            </a>

            <a
              href="mailto:partnerships@relyvora.com"
              className="w-full sm:w-auto px-7 py-4 rounded-lg bg-[#1E293B] hover:bg-[#334155] border border-[#334155] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Mail className="w-4 h-4 text-[#A7F3D0]" />
              <span>Talk to Partnerships</span>
            </a>
          </div>

          <p className="text-[11px] font-mono text-[#64748B] pt-4">
            Direct inquiries: <a href="mailto:partnerships@relyvora.com" className="text-[#A7F3D0] hover:underline">partnerships@relyvora.com</a>
          </p>
        </div>
      </section>
    </div>
  );
}
