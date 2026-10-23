'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { 
  ShieldCheck, 
  ArrowRight, 
  Lock, 
  CheckCircle2, 
  Store, 
  Sparkles, 
  Smartphone, 
  Truck, 
  Zap, 
  MessageCircle,
  KeyRound
} from 'lucide-react';
import { formatNaira } from '@/lib/pricing';

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-16 space-y-16 sm:space-y-24">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Africa's First Instant Social Commerce Trust Layer</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
          Sell on Facebook, Instagram, TikTok & WhatsApp <br className="hidden sm:inline" />
          <span className="text-emerald-600">With 100% Escrow Protection.</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Relyvora eliminates "Payment on Delivery" headaches and "What I Ordered vs What I Got" dread. Buyers lock funds safely in escrow, and vendors unlock payout the moment the 6-digit delivery code is verified.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
          <Link
            href="/vendor"
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 transition-all transform active:scale-[0.99]"
          >
            <Store className="w-5 h-5 text-emerald-200" />
            <span>Open Vendor Dashboard</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>

          <Link
            href="/vendor"
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <span>Create Escrow Link</span>
          </Link>
        </div>

        {/* Value metrics pill */}
        <div className="pt-6 grid grid-cols-3 gap-2 sm:gap-6 border-t border-slate-200/80 max-w-lg mx-auto text-center">
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">3%</div>
            <div className="text-[11px] sm:text-xs text-slate-500">Protection Fee (Min ₦500)</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">6-Digit</div>
            <div className="text-[11px] sm:text-xs text-slate-500">Release Code Protection</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">0% Risk</div>
            <div className="text-[11px] sm:text-xs text-slate-500">Simulated Sandbox</div>
          </div>
        </div>
      </section>

      {/* Visual Product Showcase / How It Works */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            How The Relyvora Flow Works
          </h2>
          <p className="text-sm text-slate-500">
            A frictionless, high-trust sequence built specifically for Nigerian delivery dynamics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-xs space-y-4 relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xl border border-emerald-200">
              1
            </div>
            <h3 className="text-lg font-bold text-slate-900">Vendor Generates Link</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Vendor enters item name and price (e.g. ₦45,000). Relyvora calculates the 3% buyer protection fee and provides a clean shareable link with pre-written WhatsApp message.
            </p>
            <div className="pt-2 text-xs font-semibold text-emerald-700 flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              <span>Direct WhatsApp sharing</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-xs space-y-4 relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xl border border-blue-200">
              2
            </div>
            <h3 className="text-lg font-bold text-slate-900">Buyer Locks Escrow</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Buyer opens the link, reviews the item details, and locks funds in safe escrow via card, bank transfer, or USSD. The buyer instantly receives a secret 6-digit release code.
            </p>
            <div className="pt-2 text-xs font-semibold text-blue-700 flex items-center gap-1">
              <Lock className="w-4 h-4" />
              <span>Funds held safely in escrow</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-xs space-y-4 relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-black text-xl border border-teal-200">
              3
            </div>
            <h3 className="text-lg font-bold text-slate-900">Inspect & Release</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Vendor dispatches order. Upon doorstep inspection, the buyer gives the 6-digit code to the rider. The vendor enters the code to instantly unlock payout.
            </p>
            <div className="pt-2 text-xs font-semibold text-teal-700 flex items-center gap-1">
              <KeyRound className="w-4 h-4" />
              <span>Doorstep verification</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 text-center space-y-6 relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-400/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Ready to test the Escrow Experience?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            Experience the complete vendor and buyer perspective in our interactive simulated sandbox.
          </p>
          <div className="pt-2">
            <Link
              href="/vendor"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all"
            >
              <span>Go to Vendor Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>
    </div>
  );
}
