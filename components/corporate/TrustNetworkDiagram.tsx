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
              Protocol Specification • Fig. 01 — Connected Trust Topology
            </span>
          </div>
          <div className="font-mono text-[11px] text-[#64748B]">
            Status: Active in Lagos (NG) • Expansion in Design
          </div>
        </div>

        {/* 3-Column Architectural Flow */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Layer 1: Social Touchpoints (Fragmented Channels) */}
          <div className="lg:col-span-3 space-y-3">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
              <span>01. Social Ingress</span>
            </div>
            <div className="bg-[#FAF8F5] border border-[#E7E4DC] rounded-xl p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-[#090E1A]">Unsecured Chat Rails</div>
              <div className="space-y-1.5 font-mono text-[11px] text-[#475569]">
                <div className="flex items-center justify-between p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <span>WhatsApp Direct</span>
                  <span className="text-[10px] text-[#047857]">P2P</span>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <span>Instagram DM</span>
                  <span className="text-[10px] text-[#047857]">Social</span>
                </div>
                <div className="flex items-center justify-between p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <span>TikTok Showcase</span>
                  <span className="text-[10px] text-[#047857]">Live</span>
                </div>
              </div>
              <p className="text-[10px] text-[#64748B] leading-tight">
                High friction, high fraud exposure before Relyvora.
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
                02. The Relyvora Core
              </span>
              <ShieldCheck className="w-4 h-4 text-[#34D399]" />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-bold tracking-tight text-white">
                Neutral Transaction Protocol
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Deterministic state machine holding order value in digital escrow until physical inspection.
              </p>
            </div>

            <div className="bg-[#1E293B]/80 rounded-lg p-3 space-y-2 font-mono text-xs text-[#CBD5E1]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#94A3B8]">1. Lock Terms:</span>
                <span className="text-[#34D399]">3% Fee / Min ₦500</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#94A3B8]">2. Pre-Funding:</span>
                <span className="text-white">Custody Activated</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#94A3B8]">3. Settlement:</span>
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
              <span>03. Verified Handover</span>
            </div>
            <div className="bg-[#FAF8F5] border border-[#E7E4DC] rounded-xl p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-[#090E1A]">Doorstep Inspection</div>
              <div className="space-y-1.5 font-mono text-[11px] text-[#475569]">
                <div className="flex items-center gap-2 p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#047857] shrink-0" />
                  <span>Unbox & Verify</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <KeyRound className="w-3.5 h-3.5 text-[#047857] shrink-0" />
                  <span>Exchange 6-Digit Code</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 bg-white rounded border border-[#E7E4DC]/80">
                  <Lock className="w-3.5 h-3.5 text-[#047857] shrink-0" />
                  <span>Funds Released to Vendor</span>
                </div>
              </div>
              <p className="text-[10px] text-[#64748B] leading-tight">
                Zero cash risks. Zero fake transfer slips.
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
              Operational Node
            </div>
            <p className="text-[10px] text-[#64748B]">ng.relyvora.com (Active)</p>
          </div>

          <div className="p-3 bg-[#FAF8F5]/60 rounded-xl border border-[#E7E4DC]/80 space-y-1 opacity-75">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#475569]">Accra, GH 🇬🇭</span>
              <span className="text-[9px] font-mono text-[#64748B]">PLANNED</span>
            </div>
            <div className="text-[10px] font-mono text-[#64748B] uppercase">
              Mobile Money Rail
            </div>
            <p className="text-[10px] text-[#94A3B8]">Ghana Expansion</p>
          </div>

          <div className="p-3 bg-[#FAF8F5]/60 rounded-xl border border-[#E7E4DC]/80 space-y-1 opacity-75">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#475569]">Nairobi, KE 🇰🇪</span>
              <span className="text-[9px] font-mono text-[#64748B]">PLANNED</span>
            </div>
            <div className="text-[10px] font-mono text-[#64748B] uppercase">
              M-Pesa STK Rail
            </div>
            <p className="text-[10px] text-[#94A3B8]">Kenya Expansion</p>
          </div>

          <div className="p-3 bg-[#FAF8F5]/60 rounded-xl border border-[#E7E4DC]/80 space-y-1 opacity-75">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#475569]">Joburg, ZA 🇿🇦</span>
              <span className="text-[9px] font-mono text-[#64748B]">PLANNED</span>
            </div>
            <div className="text-[10px] font-mono text-[#64748B] uppercase">
              Instant EFT Rail
            </div>
            <p className="text-[10px] text-[#94A3B8]">South Africa Expansion</p>
          </div>
        </div>
      </div>
    </div>
  );
}
