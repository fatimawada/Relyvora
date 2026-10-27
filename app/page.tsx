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
              <span>Infrastructure for African Digital Commerce</span>
              <span className="text-[#94A3B8]">•</span>
              <span>EST. 2024</span>
            </div>

            {/* Editorial Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-serif font-normal tracking-tight text-[#090E1A] leading-[1.08] max-w-4xl">
              Building the institutional trust layer for African social commerce.
            </h1>
          </div>

          {/* Subtitle & Mission */}
          <p className="text-lg sm:text-xl text-[#334155] max-w-3xl leading-relaxed font-sans font-normal">
            Across African markets, commerce happens inside direct messages and social feeds—across <strong className="text-[#090E1A] font-semibold">WhatsApp</strong>, <strong className="text-[#090E1A] font-semibold">Facebook</strong>, <strong className="text-[#090E1A] font-semibold">TikTok</strong>, and <strong className="text-[#090E1A] font-semibold">Instagram</strong>. Relyvora provides the neutral transaction and escrow infrastructure that protects both buyers and independent merchants from order creation to physical doorstep verification.
          </p>

          {/* Editorial CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
            <a
              href={nigeriaAppUrl}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-xs sm:text-sm font-bold bg-[#090E1A] text-white hover:bg-[#1E293B] transition-all shadow-xs"
            >
              <span>Explore Nigeria MVP</span>
              <span className="text-xs">🇳🇬</span>
              <ArrowUpRight className="w-4 h-4 opacity-80" />
            </a>

            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-xs sm:text-sm font-semibold bg-[#EFECE6] text-[#090E1A] hover:bg-[#E7E3D8] transition-colors border border-[#DDD8CE]"
            >
              <span>Review The Protocol</span>
              <ArrowDown className="w-3.5 h-3.5 opacity-70" />
            </a>
          </div>

          {/* Distinctive Visual Motif: Trust Topology Diagram */}
          <div className="pt-6">
            <TrustNetworkDiagram />
          </div>
        </div>
      </section>

      {/* 2. THE PROBLEM: THE SOCIAL COMMERCE TRUST GAP */}
      <section id="problem" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-white">
        <div className="max-w-5xl mx-auto space-y-14">
          <div className="space-y-3 max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Market Realities
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              The fundamental friction of peer-to-peer commerce
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              Social commerce in emerging markets is heavily constrained by an asymmetric dilemma: neither party is willing to bear the financial risk of going first.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Pillar 1: Payment on Delivery Dilemma */}
            <div className="space-y-4 p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC]">
              <div className="w-9 h-9 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A] font-mono text-xs font-bold">
                01
              </div>
              <h3 className="text-lg font-bold text-[#090E1A]">
                The Payment-on-Delivery Dilemma
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Cash and transfer-on-delivery (PoD) represent up to 70% of social commerce orders in Sub-Saharan Africa. However, merchants experience up to 30%+ delivery refusal rates, dispatch rider theft risks, and significant logistics burn on uncommitted shoppers.
              </p>
            </div>

            {/* Pillar 2: Buyer Information Asymmetry */}
            <div className="space-y-4 p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC]">
              <div className="w-9 h-9 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A] font-mono text-xs font-bold">
                02
              </div>
              <h3 className="text-lg font-bold text-[#090E1A]">
                Buyer Uncertainty & "What I Ordered"
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Direct bank transfers to unknown personal accounts offer zero buyer protection. If goods arrive damaged, counterfeit, or fail to ship altogether, buyers have no recourse or dispute arbitration mechanism, capping consumer basket sizes.
              </p>
            </div>

            {/* Pillar 3: Merchant Payment Vulnerabilities */}
            <div className="space-y-4 p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC]">
              <div className="w-9 h-9 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A] font-mono text-xs font-bold">
                03
              </div>
              <h3 className="text-lg font-bold text-[#090E1A]">
                Merchant Exposure & Fake Proofs
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Independent social sellers routinely fall victim to sophisticated fake bank alert SMS messages, unauthorized chargeback disputes, and non-serious buyers who order products to distant locations and go unreachable upon courier arrival.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HOW RELYVORA WORKS: THE TRANSACTION PROTOCOL */}
      <section id="how-it-works" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-[#FAF8F5]">
        <div className="max-w-5xl mx-auto space-y-16">
          <div className="space-y-3 max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#047857]">
              The Transaction Lifecycle
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              A neutral, verified sequence from direct message to doorstep
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              Relyvora decouples the payment release from the initial purchase order, ensuring funds are held securely until physical verification occurs.
            </p>
          </div>

          {/* Stepper Grid */}
          <div className="space-y-6">
            {[
              {
                step: '01',
                title: 'Link Generation & Agreed Terms',
                description: 'The social vendor enters the item details and agreed purchase price in the Relyvora dashboard. Relyvora calculates the transparent 3% buyer protection fee (minimum ₦500 in Nigeria) and generates a secure link shareable directly in WhatsApp, Instagram DM, or TikTok chats.',
                detail: 'Standardized order specifications eliminate misunderstandings before payment is initiated.',
              },
              {
                step: '02',
                title: 'Custodial Pre-Funding',
                description: 'The buyer opens the link, inspects the exact item description, and securely locks the total order amount into Relyvora escrow. The vendor is notified instantly that funds are guaranteed in custody.',
                detail: 'Vendor sees confirmed funds before preparing inventory or booking couriers.',
              },
              {
                step: '03',
                title: 'Shipment with 6-Digit Release Code',
                description: 'Upon payment lock, Relyvora issues a unique, confidential 6-digit release code exclusively to the buyer. The vendor dispatches the merchandise with delivery couriers.',
                detail: 'The buyer is strictly instructed not to share this code until the parcel is physically unboxed.',
              },
              {
                step: '04',
                title: 'Doorstep Inspection & Final Settlement',
                description: 'When the delivery rider arrives, the buyer unboxes and inspects the item. If completely satisfied, the buyer gives the 6-digit code to the vendor/rider. Entering this matching code instantly releases the locked funds to the vendor payout balance.',
                detail: 'Wrong item or counterfeit? The buyer freezes escrow with 1 click, suspending payout pending inspection.',
              },
            ].map((item, idx) => (
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
                    Design Protocol
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
              Interoperability
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Connecting fragmented social commerce rails
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              Relyvora does not replace existing social platforms or delivery couriers. We provide the neutral trust layer that integrates seamlessly across the three touchpoints of social commerce.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl border border-[#E7E4DC] space-y-3 bg-[#FAF8F5]">
              <div className="w-8 h-8 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A]">
                <Share2 className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#090E1A]">
                Social Media Surfaces
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Merchants market and communicate where audiences naturally congregate—WhatsApp chats, Instagram stories, TikTok live streams, and Facebook groups. Relyvora links embed naturally into any messaging interface without requiring app downloads.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-[#E7E4DC] space-y-3 bg-[#FAF8F5]">
              <div className="w-8 h-8 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A]">
                <Truck className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#090E1A]">
                Decentralized Logistics
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Independent dispatch riders and regional parcel services manage the physical transit. By replacing risky cash collection with verified digital codes, riders avoid robbery and couriers reduce failed drop-offs.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-[#E7E4DC] space-y-3 bg-[#FAF8F5]">
              <div className="w-8 h-8 rounded-lg bg-[#EFECE6] flex items-center justify-center text-[#090E1A]">
                <Building2 className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#090E1A]">
                Digital Payment Rails
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                Relyvora connects to local bank account transfer rails, virtual accounts, and regional mobile money systems to safely sequester funds throughout the fulfillment lifecycle.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. MARKETS: OPERATIONAL & PLANNED GEOGRAPHIES */}
      <section id="markets" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-[#FAF8F5]">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="space-y-3 max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#047857]">
              Geographic Scope
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Operational in Nigeria, designed for continental expansion
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              We focus our initial deployment in Nigeria to prove unit economics and dispute resolution protocols, with planned expansion to major social commerce hubs in West, East, and Southern Africa.
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
                    <span>OPERATIONAL MARKET</span>
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                  Our initial active market, supporting Instagram and WhatsApp vendors in Lagos, Abuja, and major logistics corridors. Features simulated payments and instant delivery code verification.
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

            {/* Planned Future Markets */}
            <div className="md:col-span-6 grid grid-cols-1 gap-4">
              {/* Ghana */}
              <div className="p-5 rounded-xl bg-white border border-[#E7E4DC] flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🇬🇭</span>
                    <h4 className="text-sm font-bold text-[#090E1A]">Ghana</h4>
                  </div>
                  <p className="text-xs text-[#475569]">
                    Planned integration with Ghanaian Cedis (GH₵) and mobile money rails (MTN MoMo, Telecel Cash).
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1] shrink-0">
                  PLANNED
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
                    Planned support for Kenya Shillings (KSh) with M-Pesa STK push escrow workflows.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1] shrink-0">
                  PLANNED
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
                    Planned support for South African Rand (ZAR) utilizing Instant EFT and debit rails.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1] shrink-0">
                  PLANNED
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. TRUST & SAFETY: ACCURATE SAFEGUARDS & DISCLOSURES */}
      <section id="trust-and-safety" className="py-20 sm:py-28 px-4 sm:px-6 border-b border-[#E7E4DC] bg-white">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="space-y-3 max-w-2xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Governance & Integrity
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#090E1A] tracking-tight">
              Verifiable safeguards and operating transparency
            </h2>
            <p className="text-base text-[#475569] leading-relaxed">
              We design our protocol with transparent operational boundaries. We outline exactly what the platform does and how our safeguards are implemented.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-3">
              <KeyRound className="w-5 h-5 text-[#047857]" />
              <h3 className="text-sm font-bold text-[#090E1A]">
                Cryptographic Code Release
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                Funds in Relyvora transactions cannot be released by arbitrary admin action or vendor claim alone. Release requires the matching 6-digit verification code issued to the buyer's private device upon checkout.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-3">
              <AlertTriangle className="w-5 h-5 text-[#047857]" />
              <h3 className="text-sm font-bold text-[#090E1A]">
                Immediate Dispute Freeze
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                If merchandise arrives damaged, wrong in size, or inconsistent with agreed specifications, the buyer can freeze the transaction with a single click, instantly disabling release code entry and halting payout.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-3">
              <HelpCircle className="w-5 h-5 text-[#047857]" />
              <h3 className="text-sm font-bold text-[#090E1A]">
                Public Sandbox Environment
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                Our active deployment currently operates in an interactive demonstration mode using simulated payments. This permits extensive vendor usability testing and courier integration audits prior to commercial real-money custody rollout.
              </p>
            </div>
          </div>

          {/* Institutional Compliance Notice Box */}
          <div className="p-6 rounded-xl bg-[#F3EFEA] border border-[#E7E4DC] space-y-2 text-xs text-[#475569]">
            <span className="font-mono font-bold uppercase text-[11px] text-[#090E1A] block">
              Notice on Regulatory Architecture
            </span>
            <p className="leading-relaxed">
              Relyvora provides transaction verification technology. In production financial markets, real-money custody and settlement are structured in strict compliance with central banking regulations, anti-money laundering (AML) frameworks, and licensed financial institutional partners. No live user funds are collected or held in unverified environments.
            </p>
          </div>
        </div>
      </section>

      {/* 7. CLOSING CTA & PARTNERSHIPS */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 bg-[#090E1A] text-white">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-[#1E293B] text-[#A7F3D0] border border-[#334155]">
            <span>COMMERCE INFRASTRUCTURE</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-serif font-normal tracking-tight text-white max-w-2xl mx-auto">
            Experience the future of trusted social commerce.
          </h2>

          <p className="text-sm sm:text-base text-[#94A3B8] max-w-xl mx-auto leading-relaxed">
            Test the escrow link generator, simulated buyer checkout, and doorstep release code verification in our operational Nigerian sandbox.
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
              <span>Contact Institutional Team</span>
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
