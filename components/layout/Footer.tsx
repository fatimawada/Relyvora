import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';

const PLATFORM_LINKS = [
  { label: 'The Problem', href: '/problem' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Markets', href: '/markets' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Trust & Safety', href: '/trust-and-safety' },
  { label: 'About', href: '/about' },
];

const PRODUCT_LINKS = [
  { label: 'Relyvora Nigeria', sub: 'ng.relyvora.com', href: 'https://ng.relyvora.com' },
  { label: 'Relyvora Foundation', sub: 'foundation.relyvora.com', href: 'https://foundation.relyvora.com' },
];

const LEGAL_LINKS = [
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Dispute Policy', href: '/disputes' },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-surface border-t border-border mt-auto">
      <div className="max-w-container mx-auto px-6 py-14 lg:py-16 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-12">
          {/* Brand */}
          <div className="md:col-span-5 space-y-4">
            <Logo variant="full" height={34} withLink={true} />
            <p className="text-muted text-[15px] leading-relaxed max-w-sm">
              Payment protection for WhatsApp and Instagram commerce. Your money is held until your order arrives and you
              confirm with a <span className="nowrap">six-digit</span> code.
            </p>
            <p className="text-sm font-medium text-main">Payments powered by Anchor</p>
          </div>

          {/* Platform */}
          <div className="md:col-span-3 space-y-3">
            <h2 className="section-label !text-muted">Platform</h2>
            <ul className="space-y-2.5 text-[15px]">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-main hover:text-accent transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Products (external) */}
          <div className="md:col-span-4 space-y-3">
            <h2 className="section-label !text-muted">Products</h2>
            <ul className="space-y-3">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-card border border-border bg-site hover:border-accent transition-colors flex items-center justify-between group"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-main group-hover:text-accent transition-colors">
                        {link.label}
                      </span>
                      <span className="block text-xs text-muted">{link.sub}</span>
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-muted group-hover:text-accent transition-colors" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Regulatory disclosure (approved wording) */}
        <div className="p-5 rounded-card border border-border bg-site text-xs text-muted leading-relaxed">
          <p>
            Relyvora Technologies Limited is a transaction protection technology platform. Payments are powered by our
            regulated Banking<span className="nowrap">-as-a-</span>Service partner, Anchor Technologies Limited, in
            partnership with <span className="nowrap">CBN-licensed</span> financial institutions.
          </p>
        </div>

        {/* Legal links and statutory details (TIN intentionally not shown) */}
        <div className="pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-main transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <p className="text-center md:text-right">
            © {currentYear} Relyvora Technologies Limited (RC 9982218). Abuja, Nigeria.
          </p>
        </div>
      </div>
    </footer>
  );
}
