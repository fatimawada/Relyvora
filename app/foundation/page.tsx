'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { 
  ArrowRight, 
  ArrowUpRight, 
  CheckCircle2, 
  Menu, 
  X, 
  BookOpen, 
  Smartphone, 
  ShieldCheck,
  Send,
  Sparkles
} from 'lucide-react';

type PartnerTab = 'funder' | 'corporate' | 'mentor';

export default function FoundationPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [partnerTab, setPartnerTab] = useState<PartnerTab>('funder');

  // Form states
  const [name, setName] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSubmitSuccess(null);

    try {
      const res = await fetch('/api/foundation/partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          organisation: organisation.trim(),
          email: email.trim(),
          partnerType: partnerTab,
          message: message.trim(),
          website: website.trim(), // Honeypot
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setSubmitSuccess(json.message || 'Thank you for reaching out. We will be in touch.');
        setName('');
        setOrganisation('');
        setEmail('');
        setMessage('');
        setWebsite('');
      } else {
        setErrorMessage(json.error || 'Failed to submit inquiry. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error submitting form.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-site text-main min-h-screen transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-site/90 backdrop-blur-md border-b border-border transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Foundation Label */}
          <div className="flex items-center gap-3">
            <Link href="/foundation" className="flex items-center gap-2" aria-label="Relyvora Foundation home">
              <Logo variant="full" height={32} withLink={false} />
            </Link>
            <div className="h-5 w-px bg-border hidden sm:block" />
            <span className="text-xs font-semibold text-muted tracking-wide">
              Foundation
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-muted">
            <a href="#about" className="hover:text-main transition-colors">
              About
            </a>
            <a href="#programmes" className="hover:text-main transition-colors">
              Programmes
            </a>
            <a href="#status" className="hover:text-main transition-colors">
              Progress
            </a>
            <a href="#partner" className="hover:text-main transition-colors">
              Partner
            </a>
            <a href="#contact" className="hover:text-main transition-colors">
              Contact
            </a>
          </nav>

          {/* Action CTAs & Theme Toggle */}
          <div className="hidden sm:flex items-center gap-4">
            <a
              href="https://relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-muted hover:text-main transition-colors flex items-center gap-1"
            >
              <span>Corporate site</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
            </a>

            <a
              href="#partner"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-accent-contrast hover:opacity-90 transition-all"
            >
              <span>Partner with us</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>

            <ThemeToggle />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 sm:hidden">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-muted hover:text-main hover:bg-surface rounded-xl transition-colors"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-b border-border bg-surface px-6 py-6 space-y-4 animate-in fade-in duration-150">
            <nav className="flex flex-col space-y-3 text-sm font-medium">
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 text-muted hover:text-main border-b border-border"
              >
                About
              </a>
              <a
                href="#programmes"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 text-muted hover:text-main border-b border-border"
              >
                Programmes
              </a>
              <a
                href="#status"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 text-muted hover:text-main border-b border-border"
              >
                Progress
              </a>
              <a
                href="#partner"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 text-muted hover:text-main border-b border-border"
              >
                Partner with us
              </a>
              <a
                href="#contact"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 text-muted hover:text-main border-b border-border"
              >
                Contact
              </a>
              <a
                href="https://relyvora.com"
                target="_blank"
                rel="noopener noreferrer"
                className="py-1 text-muted hover:text-main flex items-center justify-between"
              >
                <span>Corporate site</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </nav>
            <div className="pt-2">
              <a
                href="#partner"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center block px-4 py-3 rounded-xl text-xs font-semibold bg-accent text-accent-contrast"
              >
                Partner with us
              </a>
            </div>
          </div>
        )}
      </header>

      <main className="w-full">
        {/* ─────────────────────────────────────────────────────────────
            1. HERO SECTION
        ───────────────────────────────────────────────────────────── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
              {/* Left Column: Heading, Subhead & Actions */}
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-xs text-muted font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>Planned Non-Profit Initiative</span>
                </div>

                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-heading font-semibold text-main tracking-tight leading-[1.12]">
                  Helping women and young people in Africa sell online with confidence.
                </h1>

                <p className="text-base sm:text-lg text-muted max-w-2xl leading-relaxed">
                  Relyvora Foundation is a planned initiative of Relyvora Technologies. We want to combine practical digital selling skills with safer payments for women and young entrepreneurs.
                </p>

                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <a
                    href="#partner"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm bg-accent text-accent-contrast hover:opacity-90 transition-all shadow-sm"
                  >
                    <span>Partner with us</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  <a
                    href="#programmes"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm bg-surface border border-border text-main hover:bg-border/40 transition-colors"
                  >
                    <span>Read the plan</span>
                  </a>
                </div>
              </div>

              {/* Right Column: Hero Photo / Illustration Slot (4:5 desktop, 16:10 mobile) */}
              <div className="lg:col-span-5">
                <div className="relative w-full rounded-2xl sm:rounded-3xl border border-border bg-surface overflow-hidden shadow-sm aspect-[16/10] sm:aspect-[4/5]">
                  <Image
                    src="/foundation-hero-illustration.svg"
                    alt="Relyvora Foundation abstract geometric brand illustration representing digital commerce and trusted payments"
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 45vw, 480px"
                    className="object-cover"
                  />
                  {/* Soft brand-colour overlay */}
                  <div className="absolute inset-0 bg-emerald-950/20 dark:bg-emerald-950/40 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            2. WHY THIS MATTERS
        ───────────────────────────────────────────────────────────── */}
        <section id="about" className="py-16 sm:py-24 border-b border-border bg-surface/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="space-y-3">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                Why this matters
              </span>
              <h2 className="text-2xl sm:text-4xl font-heading font-semibold text-main tracking-tight">
                Addressing trust and capital risk in informal online trade.
              </h2>
            </div>

            <div className="space-y-6 text-base sm:text-lg text-muted leading-relaxed font-sans">
              <p>
                Many women and young people in Africa build micro-businesses through WhatsApp, Instagram, and social channels, reaching customers directly from their smartphones without expensive storefronts or formal infrastructure.
              </p>
              <p>
                However, operating in informal social commerce carries substantial financial risk. A single failed delivery, an unresponsive buyer at the doorstep, or a fake payment alert can wipe out scarce working capital and force a promising business to halt operations.
              </p>
              <p>
                Practical digital skills and safer payments work better together. Hands-on business training helps merchants structure catalogues and serve customers professionally, while protected payment mechanisms ensure they are paid for every completed order.
              </p>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            3. WHAT WE PLAN TO DO
        ───────────────────────────────────────────────────────────── */}
        <section id="programmes" className="py-16 sm:py-24 border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="max-w-3xl space-y-3">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                What we plan to do
              </span>
              <h2 className="text-2xl sm:text-4xl font-heading font-semibold text-main tracking-tight">
                Three focused areas designed for informal entrepreneurs.
              </h2>
              <p className="text-sm sm:text-base text-muted">
                Our planned curriculum and tooling focus on practical capabilities that protect working capital from day one.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Digital Selling Skills */}
              <div className="p-7 rounded-2xl border border-border bg-surface space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-border/50 text-muted">
                      Planned
                    </span>
                  </div>
                  <h3 className="text-lg font-heading font-semibold text-main">
                    Digital selling skills
                  </h3>
                  <p className="text-sm text-muted leading-relaxed">
                    Practical training on structuring product catalogues, setting up WhatsApp Business storefronts, and using accessible AI tools for clear product descriptions and customer inquiries.
                  </p>
                </div>
                <div className="pt-2 text-xs text-muted border-t border-border">
                  Focus: Professional storefront setups &amp; customer communication
                </div>
              </div>

              {/* Card 2: Money Basics */}
              <div className="p-7 rounded-2xl border border-border bg-surface space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-border/50 text-muted">
                      Planned
                    </span>
                  </div>
                  <h3 className="text-lg font-heading font-semibold text-main">
                    Money basics
                  </h3>
                  <p className="text-sm text-muted leading-relaxed">
                    Jargon-free financial education covering the separation of personal and business funds, simple digital bookkeeping, and identifying fake transfer alerts and payment scams.
                  </p>
                </div>
                <div className="pt-2 text-xs text-muted border-t border-border">
                  Focus: Cash flow separation &amp; fraud awareness
                </div>
              </div>

              {/* Card 3: Safer Payments */}
              <div className="p-7 rounded-2xl border border-border bg-surface space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-border/50 text-muted">
                      Planned
                    </span>
                  </div>
                  <h3 className="text-lg font-heading font-semibold text-main">
                    Safer payments
                  </h3>
                  <p className="text-sm text-muted leading-relaxed">
                    Access to Relyvora’s protected payment workflows, allowing sellers to confirm buyers have deposited funds before shipping goods. Any platform fee support remains to be decided.
                  </p>
                </div>
                <div className="pt-2 text-xs text-muted border-t border-border">
                  Focus: Delivery protection &amp; payment confirmation
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            4. WHERE WE ARE (PLANNING STAGE)
        ───────────────────────────────────────────────────────────── */}
        <section id="status" className="py-16 sm:py-20 border-b border-border bg-surface/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Where we are
            </span>
            <p className="text-xl sm:text-2xl font-heading font-semibold text-main leading-relaxed">
              &ldquo;We are in the planning stage. We are looking for partners, mentors and a first pilot group.&rdquo;
            </p>
            {/* OwnerTodo: confirm current status. */}
            <p className="text-xs text-muted max-w-lg mx-auto">
              We are currently designing curriculum modules and consulting with micro-enterprise operators to build an effective initial pilot.
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            5. PARTNER WITH US
        ───────────────────────────────────────────────────────────── */}
        <section id="partner" className="py-16 sm:py-24 border-b border-border">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="text-center space-y-3">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                Partner with us
              </span>
              <h2 className="text-2xl sm:text-4xl font-heading font-semibold text-main tracking-tight">
                Help shape safer digital commerce for micro-merchants.
              </h2>
              <p className="text-sm sm:text-base text-muted max-w-xl mx-auto">
                Whether you fund economic inclusion, mentor emerging operators, or provide enterprise resources, we welcome your involvement.
              </p>
            </div>

            {/* Three Tab Selectors */}
            <div className="grid grid-cols-3 gap-2 bg-surface p-1.5 rounded-2xl border border-border">
              <button
                type="button"
                onClick={() => setPartnerTab('funder')}
                className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  partnerTab === 'funder'
                    ? 'bg-site text-main shadow-xs border border-border'
                    : 'text-muted hover:text-main'
                }`}
              >
                Funder or DFI
              </button>
              <button
                type="button"
                onClick={() => setPartnerTab('corporate')}
                className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  partnerTab === 'corporate'
                    ? 'bg-site text-main shadow-xs border border-border'
                    : 'text-muted hover:text-main'
                }`}
              >
                Corporate sponsor
              </button>
              <button
                type="button"
                onClick={() => setPartnerTab('mentor')}
                className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  partnerTab === 'mentor'
                    ? 'bg-site text-main shadow-xs border border-border'
                    : 'text-muted hover:text-main'
                }`}
              >
                Mentor or operator
              </button>
            </div>

            {/* Inquiry Form */}
            <div className="p-6 sm:p-8 rounded-3xl border border-border bg-surface shadow-xs">
              {submitSuccess ? (
                <div className="text-center py-10 space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h3 className="text-lg font-heading font-semibold text-main">
                    Message Received
                  </h3>
                  <p className="text-sm text-muted max-w-md mx-auto">
                    {submitSuccess}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitSuccess(null)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-surface border border-border text-main hover:bg-border/30 transition-colors"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePartnerSubmit} className="space-y-5">
                  {errorMessage && (
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
                      {errorMessage}
                    </div>
                  )}

                  {/* Honeypot field - invisible to human users */}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="website">Website</label>
                    <input
                      type="text"
                      id="website"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="name" className="text-xs font-semibold text-muted block">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        id="name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Dr. Adaobi Okonkwo"
                        className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-sm text-main placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="organisation" className="text-xs font-semibold text-muted block">
                        Organisation *
                      </label>
                      <input
                        type="text"
                        id="organisation"
                        required
                        value={organisation}
                        onChange={(e) => setOrganisation(e.target.value)}
                        placeholder="e.g. Inclusive Growth Initiative"
                        className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-sm text-main placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-xs font-semibold text-muted block">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. contact@organisation.org"
                      className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-sm text-main placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="message" className="text-xs font-semibold text-muted block">
                      Message *
                    </label>
                    <textarea
                      id="message"
                      required
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us about your organization and how you would like to collaborate..."
                      className="w-full bg-site border border-border rounded-xl p-3.5 text-sm text-main placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  {/* Consent Line linking to /privacy */}
                  <p className="text-xs text-muted leading-relaxed">
                    By submitting this form, you agree that Relyvora Foundation may contact you regarding partnership discussions in accordance with our{' '}
                    <Link href="/privacy" className="underline hover:text-main">
                      Privacy Policy
                    </Link>.
                  </p>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-accent text-accent-contrast hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Send partnership message</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          6. FOOTER
      ───────────────────────────────────────────────────────────── */}
      <footer id="contact" className="py-12 border-t border-border bg-site">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-border">
            <div className="space-y-2">
              <Link href="/foundation" className="inline-block" aria-label="Relyvora Foundation home">
                <Logo variant="full" height={28} withLink={false} />
              </Link>
              <p className="text-xs text-muted max-w-md">
                Relyvora Foundation is an initiative of Relyvora Technologies Limited (RC 9982218).
              </p>
              {/* OwnerTodo: confirm legal status of the Foundation. */}
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs text-muted">
              <a
                href="mailto:foundation@relyvora.com"
                className="hover:text-main transition-colors font-medium"
              >
                foundation@relyvora.com
              </a>
              <span className="text-border">•</span>
              <a
                href="https://relyvora.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-main transition-colors"
              >
                Corporate site
              </a>
              <span className="text-border">•</span>
              <a
                href="https://ng.relyvora.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-main transition-colors"
              >
                Nigeria app
              </a>
              <span className="text-border">•</span>
              <Link href="/privacy" className="hover:text-main transition-colors">
                Privacy
              </Link>
              <span className="text-border">•</span>
              <Link href="/terms" className="hover:text-main transition-colors">
                Terms
              </Link>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-muted">
            <p>
              &copy; {new Date().getFullYear()} Relyvora Technologies Limited. All rights reserved.
            </p>
            <p className="text-xs text-muted">
              Supports UN Sustainable Development Goals 5 and 8.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
