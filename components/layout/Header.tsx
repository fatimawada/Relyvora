'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const NAV_LINKS = [
  { label: 'The Problem', href: '/problem' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Markets', href: '/markets' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Trust & Safety', href: '/trust-and-safety' },
] as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea';

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close the drawer if the viewport grows past the 1100px nav breakpoint
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Body scroll lock, Esc to close, focus trap, focus restore
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const trigger = triggerRef.current;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const items = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <header className="site-header sticky top-0 z-40 w-full h-[72px]">
        <div className="max-w-container mx-auto h-full px-4 sm:px-6 grid grid-cols-[auto_1fr_auto] items-center gap-3">
          {/* Left: logo (32 to 36 px high, links to /) */}
          <div className="flex items-center">
            <Link href="/" className="inline-flex items-center rounded-md" aria-label="Relyvora home">
              <span className="sm:hidden inline-flex">
                <Logo variant="full" height={32} withLink={false} />
              </span>
              <span className="hidden sm:inline-flex">
                <Logo variant="full" height={34} withLink={false} />
              </span>
            </Link>
          </div>

          {/* Centre: nav (1100px and above, all on ONE line) */}
          <nav aria-label="Main navigation" className="hidden nav:flex items-center justify-center gap-1 min-w-0">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  data-label={link.label}
                  aria-current={active ? 'page' : undefined}
                  className="nav-link"
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: actions */}
          <div className="col-start-3 flex items-center justify-end gap-2 sm:gap-2.5">
            <ThemeToggle />
            <a
              href="https://ng.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 h-11 nav:h-10 rounded-btn text-sm font-semibold whitespace-nowrap bg-main text-site hover:opacity-90 dark:bg-accent dark:text-[#071229] transition-opacity"
            >
              <span>Go to Relyvora NG</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen(true)}
              className="nav:hidden w-11 h-11 rounded-btn border border-border bg-surface text-main inline-flex items-center justify-center hover:border-accent transition-colors"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-drawer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer: slides in from the right, full height */}
      <div
        className={`drawer-root nav:hidden fixed inset-0 z-50 overflow-hidden ${open ? '' : 'pointer-events-none'}`}
        data-open={open}
        aria-hidden={!open}
      >
        <div
          className="drawer-backdrop absolute inset-0 bg-[#0A1B3D]/50"
          data-open={open}
          onClick={close}
        />
        <div
          id="mobile-drawer"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          data-open={open}
          inert={!open}
          className="drawer-panel absolute top-0 right-0 h-full w-[min(88vw,380px)] bg-surface border-l border-border shadow-2xl flex flex-col"
        >
          <div className="h-[72px] px-5 flex items-center justify-between border-b border-border shrink-0">
            <Logo variant="full" height={32} withLink={false} />
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              className="w-11 h-11 rounded-btn border border-border bg-surface text-main inline-flex items-center justify-center hover:border-accent transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={close}
                  className={`h-12 px-4 rounded-xl flex items-center text-base whitespace-nowrap transition-colors ${
                    active ? 'font-semibold text-accent bg-accent/10' : 'font-medium text-main hover:bg-site'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="shrink-0 border-t border-border p-4 flex items-center gap-3">
            <ThemeToggle />
            <a
              href="https://ng.relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-btn text-sm font-semibold whitespace-nowrap bg-main text-site hover:opacity-90 dark:bg-accent dark:text-[#071229] transition-opacity"
            >
              <span>Go to Relyvora NG</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
