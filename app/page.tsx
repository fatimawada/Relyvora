'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, 
  ArrowRight, 
  Lock, 
  CheckCircle2, 
  Globe, 
  Sparkles, 
  Smartphone, 
  ExternalLink,
  MessageCircle,
  KeyRound,
  Building,
  Check,
  Send,
  ChevronRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';

export default function CorporateHomePage() {
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  // In production, point to https://ng.relyvora.com; in local dev fallback to /vendor
  const nigeriaAppUrl = process.env.NODE_ENV === 'production' 
    ? 'https://ng.relyvora.com' 
    : '/vendor';

  const handleWaitlistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    setWaitlistSubmitted(true);
    setWaitlistEmail('');
  };

  return (
    <div className="w-full bg-slate-50 text-slate-900 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-32 px-4 border-b border-slate-200/80 bg-white">
        <div className="max-w-6xl mx-auto text-center space-y-8 relative z-10">
          {/* Institutional Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="tracking-wide uppercase text-[11px] font-bold">Pan-African Fintech Infrastructure</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-slate-900 tracking-tight leading-[1.1] max-w-4xl mx-auto">
            The Trust Layer for <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 bg-clip-text text-transparent">
              African Social Commerce.
            </span>
          </h1>

          {/* Core Value Proposition */}
          <p className="text-lg sm:text-2xl text-slate-600 max-w-3xl mx-auto leading-relaxed font-normal">
            We secure transactions across <span className="text-slate-900 font-semibold">WhatsApp</span>, <span className="text-slate-900 font-semibold">Facebook</span>, <span className="text-slate-900 font-semibold">TikTok</span>, and <span className="text-slate-900 font-semibold">Instagram</span> with automated, fraud-proof escrow protection.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <a
              href={nigeriaAppUrl}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <span>Launch Nigeria App</span>
              <span className="text-lg">🇳🇬</span>
              <ArrowRight className="w-4 h-4 ml-0.5" />
            </a>

            <a
              href="#how-it-works"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold text-base flex items-center justify-center gap-2 transition-colors"
            >
              <span>How Escrow Works</span>
            </a>
          </div>

          {/* Supported Platforms Social Proof Ticker */}
          <div className="pt-10 max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Securing Peer-to-Peer & Merchant Checkout On
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
              {[
                { name: 'WhatsApp', icon: '💬', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
                { name: 'Instagram', icon: '📸', color: 'bg-pink-50 text-pink-800 border-pink-200' },
                { name: 'TikTok', icon: '🎵', color: 'bg-slate-100 text-slate-800 border-slate-200' },
                { name: 'Facebook', icon: '🌐', color: 'bg-blue-50 text-blue-800 border-blue-200' },
              ].map((platform) => (
                <div
                  key={platform.name}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border shadow-xs ${platform.color}`}
                >
                  <span>{platform.icon}</span>
                  <span>{platform.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-4 max-w-6xl mx-auto space-y-16">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
            Bi-Directional Protection
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Built to Protect Both Sides of Every Deal
          </h2>
          <p className="text-base sm:text-lg text-slate-600">
            Social commerce in emerging markets fails when buyers fear paying upfront and sellers fear unfulfilled cash on delivery. Relyvora solves both instantly.
          </p>
        </div>

        {/* Two-Perspective Value Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* For Buyers */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Buyer Confidence</span>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                Zero Risk of "What I Ordered vs What I Got"
              </h3>
            </div>
            <ul className="space-y-3.5 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Funds Safely Held in Custody:</strong> Money remains in escrow until your package arrives.</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Doorstep Unboxing Inspection:</strong> Inspect the merchandise before releasing the payment.</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>1-Click Dispute Freeze:</strong> If the item is fake or broken, freeze escrow instantly to prevent payout.</span>
              </li>
            </ul>
          </div>

          {/* For Vendors */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Merchant Assurance</span>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                Zero Bogus Orders or Delivery Rider Thefts
              </h3>
            </div>
            <ul className="space-y-3.5 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <span><strong>100% Pre-Funded Commitment:</strong> Never dispatch goods without confirmed buyer funds locked in escrow.</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <span><strong>No Fake Transfer Alerts:</strong> Digital payment confirmation verified directly by our gateway.</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <span><strong>Instant 6-Digit Code Payout:</strong> Enter the buyer's handover code to immediately unlock balance.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* 3-Step Process Diagram */}
        <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 space-y-8">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              The 3-Step Escrow Protocol
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              How Relyvora executes transactions from social chat to doorstep delivery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700 space-y-3">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-1 rounded">
                STEP 01
              </span>
              <h4 className="text-lg font-bold text-white">Create & Lock Escrow</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Vendor shares an escrow checkout link via WhatsApp or Instagram DM. The buyer locks agreed funds in custody.
              </p>
            </div>

            <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700 space-y-3">
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/80 border border-blue-800/80 px-2 py-1 rounded">
                STEP 02
              </span>
              <h4 className="text-lg font-bold text-white">Dispatch & Inspect</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Vendor dispatches the parcel with guaranteed commitment. The buyer unboxes and verifies item quality upon delivery.
              </p>
            </div>

            <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700 space-y-3">
              <span className="text-xs font-mono font-bold text-teal-400 bg-teal-950/80 border border-teal-800/80 px-2 py-1 rounded">
                STEP 03
              </span>
              <h4 className="text-lg font-bold text-white">6-Digit Code Settlement</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Buyer provides the secret release code to the rider. Vendor enters the code to instantly release funds to payout.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Active Markets Section (Spotlight on Nigeria) */}
      <section className="py-20 px-4 bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase tracking-wide">
                Active Operational Market
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
                Live Now in Nigeria
              </h2>
              <p className="text-base text-slate-600">
                Powering Instagram and WhatsApp commerce across Lagos, Abuja, and nationwide delivery routes.
              </p>
            </div>

            <div>
              <a
                href={nigeriaAppUrl}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 transition-all"
              >
                <span>Launch Nigeria App</span>
                <span className="text-base">🇳🇬</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Nigeria Market Feature Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-8 sm:p-10 border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🇳🇬</span>
                  <div>
                    <h3 className="text-2xl font-black text-white">Nigeria (ng.relyvora.com)</h3>
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Production MVP Live & Operational
                    </span>
                  </div>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  The Nigerian social commerce market processes billions in annual volume across social media. Relyvora delivers instant trust with real-time Nigerian Naira (<span className="text-white font-bold">₦</span>) settlements, 3% buyer protection fees, and door-to-door OTP security.
                </p>

                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-center">
                  <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80">
                    <div className="text-lg font-black text-white font-mono">₦500</div>
                    <div className="text-[10px] text-slate-400 uppercase">Min Protection Fee</div>
                  </div>
                  <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80">
                    <div className="text-lg font-black text-emerald-400 font-mono">3%</div>
                    <div className="text-[10px] text-slate-400 uppercase">Take Rate</div>
                  </div>
                  <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80">
                    <div className="text-lg font-black text-white font-mono">6 Digits</div>
                    <div className="text-[10px] text-slate-400 uppercase">Release Code</div>
                  </div>
                </div>

                <div>
                  <a
                    href={nigeriaAppUrl}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all"
                  >
                    <span>Open ng.relyvora.com</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Visual simulated preview mockup */}
              <div className="lg:col-span-5 bg-slate-800/90 rounded-2xl border border-slate-700 p-5 space-y-3.5 shadow-2xl">
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-700/80 pb-3">
                  <span className="font-mono">ng.relyvora.com/pay</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                    LIVE ESCROW
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-400 font-medium">Sample Order</div>
                  <div className="text-sm font-bold text-white">Luxury Raw Human Hair 30" Bundle</div>
                </div>
                <div className="bg-slate-900/90 p-3 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Agreed Item Price</span>
                    <span className="font-mono text-white">₦85,000</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>3% Protection Fee</span>
                    <span className="font-mono text-emerald-400">+₦2,550</span>
                  </div>
                  <div className="pt-1.5 border-t border-slate-800 flex justify-between font-bold text-white text-sm">
                    <span>Total Protected</span>
                    <span className="font-mono text-emerald-400">₦87,550</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Release Code generated upon payment lock</span>
                </div>
              </div>
            </div>

            <div className="absolute -right-24 -bottom-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Future Expansion Section */}
      <section className="py-20 px-4 max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-800 uppercase tracking-wider">
            Roadmap & Scale
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Pan-African Expansion
          </h2>
          <p className="text-base text-slate-600">
            Social commerce is ubiquitous across Africa. Following Nigeria, Relyvora is expanding into major regional hubs with localized payment rails.
          </p>
        </div>

        {/* Expansion Market Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Ghana */}
          <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-xs space-y-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-3xl">🇬🇭</span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Coming Soon
              </span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Ghana (gh.relyvora.com)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Accra & Kumasi Social Merchants</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Localized for Ghanaian Cedis (GH₵) with native mobile money escrow (MTN MoMo and Telecel Cash).
            </p>
            <div className="pt-2 border-t border-slate-100 text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-400" />
              <span>Mobile Money Rail Integration</span>
            </div>
          </div>

          {/* Kenya */}
          <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-xs space-y-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-3xl">🇰🇪</span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Coming Soon
              </span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Kenya (ke.relyvora.com)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Nairobi East African Hub</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Native M-Pesa escrow rails for Kenya Shillings (KSh) ensuring trusted social vendor settlement.
            </p>
            <div className="pt-2 border-t border-slate-100 text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-400" />
              <span>M-Pesa STK Push Settlement</span>
            </div>
          </div>

          {/* South Africa */}
          <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-xs space-y-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-3xl">🇿🇦</span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Coming Soon
              </span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">South Africa (za.relyvora.com)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Johannesburg & Cape Town</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              South African Rand (ZAR) support with Instant EFT (Ozow, Stitch) and card protection.
            </p>
            <div className="pt-2 border-t border-slate-100 text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-400" />
              <span>Instant EFT & Debit Rails</span>
            </div>
          </div>
        </div>

        {/* Waitlist Capture Box */}
        <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-10 max-w-3xl mx-auto text-center space-y-6 shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-lg mx-auto space-y-3">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Be Notified When Relyvora Launches in Your Market
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              Join 1,200+ merchants and buyers waiting for our next country rollout.
            </p>

            {waitlistSubmitted ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>You're on the list! We'll notify you as soon as new markets open.</span>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <input
                  type="email"
                  required
                  placeholder="Enter your email address"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  <span>Join Waitlist</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Institutional Security Bar */}
      <section className="py-12 px-4 bg-slate-100 border-t border-slate-200">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-center sm:text-left">
          <div className="flex items-start gap-3.5 justify-center sm:justify-start">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Non-Custodial Integrity</h4>
              <p className="text-xs text-slate-500 mt-0.5">Funds are sequestered in dedicated regulated partner accounts.</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 justify-center sm:justify-start">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Arbitrated Dispute Resolution</h4>
              <p className="text-xs text-slate-500 mt-0.5">Human and automated arbitration prevents fraud and ensures fair refunds.</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 justify-center sm:justify-start">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Pan-African Architecture</h4>
              <p className="text-xs text-slate-500 mt-0.5">Designed to scale multi-currency and cross-border social transactions.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
