import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, ArrowUpRight, LifeBuoy } from 'lucide-react';

export function CorporateFooter() {
  const currentYear = new Date().getFullYear();

  const nigeriaAppUrl = process.env.NODE_ENV === 'production' 
    ? 'https://ng.relyvora.com' 
    : '/vendor';

  return (
    <footer className="w-full bg-[#F3EFEA] border-t border-[#E7E4DC] text-[#090E1A] pt-16 pb-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand & Mission */}
          <div className="md:col-span-5 space-y-4">
            <Link href="/" className="inline-block">
              <Image
                alt="Relyvora Logo"
                height={36}
                width={145}
                src="/relyvora-logo.png"
                className="h-9 w-auto object-contain"
              />
            </Link>
            <p className="text-sm text-[#475569] leading-relaxed max-w-sm">
              The neutral trust infrastructure for African social commerce. Bridging the gap between peer-to-peer sellers, buyers, and delivery couriers across the continent.
            </p>
          </div>

          {/* Architecture & Navigation */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#64748B]">
              Navigation
            </h4>
            <ul className="space-y-2 text-sm text-[#334155]">
              <li>
                <a href="#about" className="hover:text-[#090E1A] transition-colors">
                  Company Vision
                </a>
              </li>
              <li>
                <a href="#problem" className="hover:text-[#090E1A] transition-colors">
                  The Trust Gap
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-[#090E1A] transition-colors">
                  The Escrow Protocol
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-[#090E1A] transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#ecosystem" className="hover:text-[#090E1A] transition-colors">
                  Ecosystem Architecture
                </a>
              </li>
              <li>
                <a href="#markets" className="hover:text-[#090E1A] transition-colors">
                  Markets & Roadmap
                </a>
              </li>
            </ul>
          </div>

          {/* Operational Markets & Inquiries */}
          <div className="md:col-span-4 space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#64748B]">
              Active Products & Inquiries
            </h4>
            <div className="space-y-3">
              <a
                href={nigeriaAppUrl}
                className="group flex items-center justify-between p-3 rounded-xl bg-white border border-[#E7E4DC] hover:border-[#CBD5E1] transition-all shadow-2xs"
              >
                <div>
                  <div className="text-xs font-bold text-[#090E1A] flex items-center gap-1.5">
                    <span>Nigeria Operational App</span>
                    <span className="text-[10px] text-[#047857] font-mono">🇳🇬</span>
                  </div>
                  <div className="text-[11px] text-[#64748B] font-mono">
                    ng.relyvora.com
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-[#64748B] group-hover:text-[#090E1A] group-hover:translate-x-0.5 transition-transform" />
              </a>

              <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-1 text-xs text-[#475569]">
                <div className="font-semibold text-[#090E1A] flex items-center gap-1.5">
                  <LifeBuoy className="w-3.5 h-3.5 text-[#047857]" />
                  <span>Customer Support</span>
                </div>
                <p className="text-[11px] text-[#64748B]">
                  For help with active escrow transactions or delivery codes:
                </p>
                <a
                  href="mailto:support@relyvora.com"
                  className="inline-block text-[#047857] hover:underline font-mono text-[11px] font-semibold pt-0.5"
                >
                  support@relyvora.com
                </a>
              </div>

              <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E7E4DC] space-y-1 text-xs text-[#475569]">
                <div className="font-semibold text-[#090E1A] flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#047857]" />
                  <span>Partnerships & Inquiries</span>
                </div>
                <p className="text-[11px] text-[#64748B]">
                  For courier networks, merchant associations, and payment integrations:
                </p>
                <a
                  href="mailto:partnerships@relyvora.com"
                  className="inline-block text-[#047857] hover:underline font-mono text-[11px] font-semibold pt-0.5"
                >
                  partnerships@relyvora.com
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Legal & Regulatory Notice */}
        <div className="pt-8 border-t border-[#E7E4DC] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
          <p>
            © {currentYear} Relyvora. All rights reserved.
          </p>
          <p className="text-[11px] text-center sm:text-right max-w-md">
            Notice: Relyvora is currently operating in an interactive testing and merchant-verification sandbox pending commercial financial compliance licensing.
          </p>
        </div>
      </div>
    </footer>
  );
}
