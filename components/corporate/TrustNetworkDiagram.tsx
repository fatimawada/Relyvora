import React from 'react';
import { ShieldCheck, ArrowRight, CheckCircle2, Lock, KeyRound } from 'lucide-react';

export function TrustNetworkDiagram() {
  return (
    <div className="w-full bg-[#FFFFFF] rounded-2xl border border-[#E7E4DC] p-6 sm:p-8 lg:p-10 shadow-sm relative overflow-hidden text-[#090E1A]">
      {/* Background Architectural Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.4] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#CBD5E1 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 space-y-8">
        {/* Header metadata */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E7E4DC] pb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#047857]" />
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#475569]">
              The Relyvora Architecture • How It Works
            </span>
          </div>
          <div className="font-mono text-[11px] text-[#047857] font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#047857] animate-pulse"></span>
            <span>Active Now in Nigeria • Expanding Across Africa</span>
          </div>
        </div>

        {/* 3-Column Architectural Flow */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Layer 1: Social Touchpoints (Fragmented Channels) */}
          <div className="lg:col-span-3 space-y-3">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
              <span>01. Social Checkout</span>
            </div>
            <div className="bg-[#FAF8F5] border border-[#E7E4DC] rounded-xl p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-[#090E1A]">Where Deals Happen</div>
              <div className="space-y-1.5 font-mono text-[11px] text-[#475569]">
                <div className="flex items-center justify-between p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <span>WhatsApp Chat</span>
                  <span className="text-[10px] font-bold text-[#047857]">DMs</span>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <span>Instagram Direct</span>
                  <span className="text-[10px] font-bold text-[#047857]">Posts</span>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <span>TikTok & Facebook</span>
                  <span className="text-[10px] font-bold text-[#047857]">Live</span>
                </div>
              </div>
              <p className="text-[10px] text-[#64748B] leading-tight">
                Zero buyer trust. High payment-on-delivery refusal rates.
              </p>
            </div>
          </div>

          {/* Connector Arrow */}
          <div className="hidden lg:flex lg:col-span-1 justify-center text-[#94A3B8]">
            <ArrowRight className="w-5 h-5" />
          </div>

          {/* Layer 2: Relyvora Neutral Escrow Protocol (The Core Engine) */}
          <div className="lg:col-span-4 bg-[#090E1A] text-white rounded-xl p-5 border border-[#1E293B] shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#A7F3D0]">
                02. The Relyvora Engine
              </span>
              <ShieldCheck className="w-4 h-4 text-[#34D399]" />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-bold tracking-tight text-white">
                Instant Escrow Protection
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Money is safely locked in escrow until the customer inspects and approves the item.
              </p>
            </div>

            <div className="bg-[#1E293B]/80 rounded-lg p-3 space-y-2 font-mono text-xs text-[#CBD5E1]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#94A3B8]">1. Protection Fee:</span>
                <span className="text-[#34D399]">3% (Min ₦500)</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#94A3B8]">2. Pre-Funding:</span>
                <span className="text-white font-bold">Locked & Secure</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#94A3B8]">3. Instant Payout:</span>
                <span className="text-[#FCD34D]">6-Digit Release Key</span>
              </div>
            </div>
          </div>

          {/* Connector Arrow */}
          <div className="hidden lg:flex lg:col-span-1 justify-center text-[#94A3B8]">
            <ArrowRight className="w-5 h-5" />
          </div>

          {/* Layer 3: Physical Fulfillment & Doorstep Settlement */}
          <div className="lg:col-span-3 space-y-3">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#64748B]">
              <span>03. Doorstep Settlement</span>
            </div>
            <div className="bg-[#FAF8F5] border border-[#E7E4DC] rounded-xl p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-[#090E1A]">Inspect & Confirm</div>
              <div className="space-y-1.5 font-mono text-[11px] text-[#475569]">
                <div className="flex items-center gap-2 p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#047857] shrink-0" />
                  <span>Unbox & Verify Item</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <KeyRound className="w-3.5 h-3.5 text-[#047857] shrink-0" />
                  <span>Share 6-Digit Code</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <Lock className="w-3.5 h-3.5 text-[#047857] shrink-0" />
                  <span>Instant Payout to Vendor</span>
                </div>
              </div>
              <p className="text-[10px] text-[#64748B] leading-tight">
                Zero cash risks. Zero fake transfer alerts.
              </p>
            </div>
          </div>
        </div>

        {/* Geographic African Nodes Ribbon */}
        <div className="pt-4 border-t border-[#E7E4DC] grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E7E4DC] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#090E1A]">Lagos, NG 🇳🇬</span>
              <span className="w-2 h-2 rounded-full bg-[#047857] animate-pulse" />
            </div>
            <div className="text-[10px] font-mono text-[#047857] uppercase font-bold">
              Active Now
            </div>
            <p className="text-[10px] text-[#64748B]">ng.relyvora.com (Live)</p>
          </div>

          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E7E4DC] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#090E1A]">Accra, GH 🇬🇭</span>
              <span className="text-[9px] font-mono font-bold text-[#047857] bg-[#E8F5E9] px-1.5 py-0.5 rounded">COMING SOON</span>
            </div>
            <div className="text-[10px] font-mono text-[#64748B] uppercase font-medium">
              Mobile Money Escrow
            </div>
            <p className="text-[10px] text-[#64748B]">Next Market</p>
          </div>

          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E7E4DC] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#090E1A]">Nairobi, KE 🇰🇪</span>
              <span className="text-[9px] font-mono font-bold text-[#047857] bg-[#E8F5E9] px-1.5 py-0.5 rounded">COMING SOON</span>
            </div>
            <div className="text-[10px] font-mono text-[#64748B] uppercase font-medium">
              M-Pesa STK Escrow
            </div>
            <p className="text-[10px] text-[#64748B]">Next Market</p>
          </div>

          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E7E4DC] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#090E1A]">Joburg, ZA 🇿🇦</span>
              <span className="text-[9px] font-mono font-bold text-[#047857] bg-[#E8F5E9] px-1.5 py-0.5 rounded">COMING SOON</span>
            </div>
            <div className="text-[10px] font-mono text-[#64748B] uppercase font-medium">
              Instant EFT Escrow
            </div>
            <p className="text-[10px] text-[#64748B]">Next Market</p>
          </div>
        </div>
      </div>
    </div>
  );
}
