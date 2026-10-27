'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowUpRight, Menu, X } from 'lucide-react';

export function CorporateHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const nigeriaAppUrl = process.env.NODE_ENV === 'production' 
    ? 'https://ng.relyvora.com' 
    : '/vendor';

  const navLinks = [
    { label: 'The Problem', href: '#problem' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Ecosystem', href: '#ecosystem' },
    { label: 'Markets', href: '#markets' },
    { label: 'Trust & Safety', href: '#trust-and-safety' },
  ];

  return (
    <header className="w-full bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E7E4DC] sticky top-0 z-40 text-[#090E1A]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
        {/* Brand Wordmark & Emblem */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-[#047857] text-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-105">
            <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-[#090E1A] font-sans">
              Relyvora
            </span>
            <span className="text-[10px] uppercase font-mono tracking-widest text-[#64748B] -mt-1">
              Corporate
            </span>
          </div>
        </Link>

        {/* Desktop Editorial Navigation */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-semibold uppercase tracking-wider text-[#475569]">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="hover:text-[#090E1A] transition-colors py-1 relative hover:after:w-full after:w-0 after:h-[1.5px] after:bg-[#047857] after:absolute after:bottom-0 after:left-0 after:transition-all"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right Action: Country App Link */}
        <div className="hidden sm:flex items-center gap-3">
          <a
            href={nigeriaAppUrl}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#090E1A] text-white hover:bg-[#1E293B] transition-all shadow-xs"
          >
            <span>Launch Nigeria App</span>
            <span className="text-[11px] text-[#A7F3D0]">🇳🇬</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-80" />
          </a>
        </div>

        {/* Mobile menu trigger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-[#090E1A] hover:bg-[#EFECE6] rounded-lg transition-colors"
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#E7E4DC] bg-[#FAF8F5] px-5 py-6 space-y-4 animate-in fade-in duration-150">
          <nav className="flex flex-col space-y-3 text-sm font-semibold text-[#090E1A]">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-[#E7E4DC]/60"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="pt-2">
            <a
              href={nigeriaAppUrl}
              className="w-full py-3 rounded-lg text-xs font-bold bg-[#090E1A] text-white flex items-center justify-center gap-2 shadow-xs"
            >
              <span>Launch Nigeria App 🇳🇬</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
