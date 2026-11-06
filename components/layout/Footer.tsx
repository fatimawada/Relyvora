import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-surface border-t border-border mt-auto transition-colors duration-200">
      <div className="max-w-container mx-auto px-6 py-16 lg:py-20 space-y-12">
        {/* Top Section: Brand + Navigation Columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-12">
          {/* Brand & Mission Statement */}
          <div className="md:col-span-5 space-y-4">
            <Logo variant="full" height={34} withLink={true} />
            <p className="text-muted text-[15px] leading-relaxed max-w-sm">
              Payment protection for WhatsApp and Instagram commerce. Your money is held safely until your order arrives and you confirm with a six-digit code.
            </p>
            <div className="pt-1 text-xs font-mono text-muted">
              <span>Anchor BaaS Custody</span>
              <span className="mx-2">•</span>
              <span>Flat 3% Buyer Protection</span>
            </div>
          </div>

          {/* Navigation Links Column */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-semibold tracking-wider uppercase text-muted">
              Platform
            </h4>
            <ul className="space-y-2.5 text-[15px]">
              <li>
                <Link href="/how-it-works" className="text-main hover:text-accent transition-colors">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/problem" className="text-main hover:text-accent transition-colors">
                  The Problem
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-main hover:text-accent transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/markets" className="text-main hover:text-accent transition-colors">
                  Markets
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-main hover:text-accent transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/trust-and-safety" className="text-main hover:text-accent transition-colors">
                  Trust &amp; Safety
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-main hover:text-accent transition-colors">
                  About
                </Link>
              </li>
            </ul>
          </div>

          {/* Operational Products & External Links */}
          <div className="md:col-span-4 space-y-3">
            <h4 className="text-xs font-semibold tracking-wider uppercase text-muted">
              Active Products
            </h4>
            <ul className="space-y-3 text-[15px]">
              <li>
                <a
                  href="https://ng.relyvora.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-card border border-border bg-site hover:border-accent transition-all flex items-center justify-between group"
                >
                  <div>
                    <div className="text-sm font-semibold text-main group-hover:text-accent transition-colors">
                      Relyvora Nigeria
                    </div>
                    <div className="text-xs text-muted">ng.relyvora.com</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
                </a>
              </li>
              <li>
                <a
                  href="https://foundation.relyvora.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-card border border-border bg-site hover:border-accent transition-all flex items-center justify-between group"
                >
                  <div>
                    <div className="text-sm font-semibold text-main group-hover:text-accent transition-colors">
                      Relyvora Foundation
                    </div>
                    <div className="text-xs text-muted">foundation.relyvora.com</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Regulatory Disclosure (Required Text Pending Anchor Confirmation) */}
        <div className="p-5 rounded-card border border-border bg-site text-xs text-muted leading-relaxed">
          <p>
            Relyvora Technologies Limited is a transaction protection technology platform. Payment collections, virtual accounts and payouts are powered by our regulated Banking-as-a-Service partner, Anchor Technologies Limited, in partnership with CBN-licensed financial institutions.
          </p>
        </div>

        {/* Legal Links & Statutory Details (TIN Permanently Removed) */}
        <div className="pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-main transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-main transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/disputes"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-main transition-colors"
            >
              Dispute Policy
            </Link>
          </div>

          <div className="text-center md:text-right">
            <span>© {currentYear} Relyvora Technologies Limited (RC 9982218). Abuja, Nigeria.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
