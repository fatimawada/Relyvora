'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Handle escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const navLinks = [
    { label: 'The Problem', href: '/problem' },
    { label: 'How it works', href: '/how-it-works' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Markets', href: '/markets' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Trust & Safety', href: '/trust-and-safety' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-surface/85 backdrop-blur-md border-b border-border transition-colors duration-200">
      <div className="max-w-container mx-auto px-4 sm:px-6 h-18 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo */}
        <div className="flex items-center shrink-0">
          <div className="sm:hidden">
            <Logo variant="full" height={28} withLink={true} />
          </div>
          <div className="hidden sm:block">
            <Logo variant="full" height={34} withLink={true} />
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav
          className="hidden lg:flex items-center gap-1 xl:gap-2 text-[15px]"
          aria-label="Main navigation"
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3.5 py-1.5 rounded-full transition-colors duration-150 ${
                  isActive
                    ? 'font-semibold text-accent bg-accent/10'
                    : 'font-medium text-main hover:text-accent'
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {/* External Foundation Link with arrow */}
          <a
            href="https://foundation.relyvora.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 font-medium text-main hover:text-accent transition-colors duration-150 inline-flex items-center gap-1"
          >
            <span>Foundation</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
          </a>
        </nav>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Theme Toggle (Light / Dark) */}
          <ThemeToggle />

          {/* Go to Relyvora NG Button */}
          <a
            href="https://ng.relyvora.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-4 h-11 rounded-btn text-sm font-semibold bg-main text-site hover:opacity-90 dark:bg-accent dark:text-[#071229] transition-all shadow-xs"
          >
            <span>Go to Relyvora NG</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            type="button"
            className="lg:hidden w-10 h-10 sm:w-11 sm:h-11 rounded-btn border border-border bg-surface text-main flex items-center justify-center hover:border-accent transition-colors"
            aria-label={mobileMenuOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Accessible Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-18 sm:top-20 z-50 bg-[#0A1B3D]/50 backdrop-blur-xs flex flex-col justify-start">
          <div className="w-full bg-surface border-b border-border p-6 shadow-xl space-y-4 max-h-[calc(100vh-72px)] sm:max-h-[calc(100vh-80px)] overflow-y-auto animate-fadeIn">
            <nav className="flex flex-col space-y-1.5" aria-label="Mobile navigation">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-4 py-3 rounded-xl text-base transition-colors ${
                      isActive
                        ? 'font-semibold text-accent bg-accent/10'
                        : 'font-medium text-main hover:bg-site'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}

              <a
                href="https://foundation.relyvora.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 rounded-xl text-base font-medium text-main hover:bg-site flex items-center justify-between"
              >
                <span>Relyvora Foundation</span>
                <ArrowUpRight className="w-4 h-4 opacity-70" />
              </a>
            </nav>

            <div className="pt-4 border-t border-border">
              <a
                href="https://ng.relyvora.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-btn font-semibold bg-main text-site dark:bg-accent dark:text-[#071229] flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Go to Relyvora NG</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
