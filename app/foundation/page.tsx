'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { FlagIcon } from '@/components/flags/FlagIcon';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Users,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Award,
  Globe2,
  BookOpen,
  Briefcase,
  HeartHandshake,
  Layers,
  ChevronRight,
  ExternalLink,
  Lock,
  Compass,
  Cpu,
  Mail,
  Building2,
  FileCheck2,
  Quote,
  Menu,
  X
} from 'lucide-react';

export default function FoundationPage() {
  const [activePillar, setActivePillar] = useState(0);
  const [partnerType, setPartnerType] = useState<'grant' | 'corporate' | 'mentor'>('grant');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Inquiry form states
  const [formName, setFormName] = useState('');
  const [formOrg, setFormOrg] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);

  const pillars = [
    {
      id: 'pillar-1',
      number: '01',
      title: 'Digital Entrepreneurship',
      tagline: 'Practical E-Commerce & AI Productivity for Micro-Enterprises',
      icon: Cpu,
      accentColor: 'from-emerald-500/20 to-teal-500/10',
      borderColor: 'border-emerald-500/30',
      badge: 'Core Curriculum',
      summary:
        'Helping women and young people start, manage, and scale online businesses through hands-on training in digital commerce, cataloging, content creation, and practical AI tools for small business efficiency.',
      keyOutcomes: [
        'AI-assisted product descriptions, catalog structuring, and customer response automation',
        'Multi-channel social selling setups across WhatsApp Business, Instagram & TikTok',
        'Mobile-first inventory forecasting to prevent stockouts and dead capital',
        'Digital brand positioning and customer trust building for first-time sellers'
      ]
    },
    {
      id: 'pillar-2',
      number: '02',
      title: 'Financial & Digital Literacy',
      tagline: 'Demystifying Cash Flow, Unit Economics & Digital Safety',
      icon: BookOpen,
      accentColor: 'from-amber-500/20 to-orange-500/10',
      borderColor: 'border-amber-500/30',
      badge: 'Economic Resilience',
      summary:
        'A practical, jargon-free curriculum covering digital finance, bookkeeping, online transaction safety, and capital management specifically designed for micro-enterprises operating in informal markets.',
      keyOutcomes: [
        'Separation of personal living expenses from business operational cash flows',
        'Digital ledger bookkeeping and daily reconciliation using accessible mobile tools',
        'Recognizing and defending against payment interception, social engineering & fake alerts',
        'Unit economics mastery: factoring courier fees, packaging, and return overhead'
      ]
    },
    {
      id: 'pillar-3',
      number: '03',
      title: 'Women & Youth in Social Commerce',
      tagline: 'Eliminating the Informal Trust Penalty via Zero-Fee Escrow',
      icon: ShieldCheck,
      accentColor: 'from-emerald-500/30 to-blue-500/10',
      borderColor: 'border-emerald-400',
      badge: 'Flagship Initiative',
      summary:
        'Helping informal vendors enter digital markets, build buyer trust, and develop sustainable businesses. All cohort participants receive subsidized, zero-fee access to Relyvora’s institutional escrow infrastructure.',
      keyOutcomes: [
        'Complete elimination of "Payment on Delivery" (POD) scam losses and ghost buyers',
        'Zero-fee escrow protection accounts provisioned for every cohort entrepreneur',
        'Doorstep inspection & 6-digit release code mechanics for guaranteed settlement',
        'Creation of verifiable, tamper-proof digital transaction ledgers for credit scoring'
      ]
    },
    {
      id: 'pillar-4',
      number: '04',
      title: 'Mentorship & Opportunity',
      tagline: 'Global Networks, Toolkits & Institutional Linkages',
      icon: HeartHandshake,
      accentColor: 'from-purple-500/20 to-pink-500/10',
      borderColor: 'border-purple-500/30',
      badge: 'Sustained Growth',
      summary:
        'Connecting emerging founders to seasoned industry mentors, digital business toolkits, peer mastermind circles, and direct linkages to global challenge grants and catalytic market opportunities.',
      keyOutcomes: [
        '1-on-1 mentorship pairings with established African fintech & e-commerce operators',
        'Access to the Relyvora Digital Founder Toolkit (templates, contracts, calculators)',
        'Quarterly peer-learning circles across Lagos, Abuja, Kano, and regional hubs',
        'Direct pipeline recommendations for regional and international grantmaker awards'
      ]
    }
  ];

  const sdgs = [
    {
      number: '1',
      title: 'No Poverty',
      target: 'Target 1.4',
      description: 'Equal rights to economic resources, financial services, and digital market access for vulnerable micro-merchants.',
      color: 'bg-[#E5243B]',
      textColor: 'text-[#E5243B]'
    },
    {
      number: '5',
      title: 'Gender Equality',
      target: 'Target 5.b',
      description: 'Enhancing the use of enabling technology to promote the economic empowerment and digital leadership of women.',
      color: 'bg-[#FF3A21]',
      textColor: 'text-[#FF3A21]'
    },
    {
      number: '8',
      title: 'Decent Work & Growth',
      target: 'Target 8.3',
      description: 'Promoting development-oriented policies that support formalization, entrepreneurship, and micro-enterprise resilience.',
      color: 'bg-[#A21942]',
      textColor: 'text-[#A21942]'
    },
    {
      number: '9',
      title: 'Industry & Infrastructure',
      target: 'Target 9.3',
      description: 'Increasing the access of small-scale industrial and other enterprises to financial services and value chains.',
      color: 'bg-[#FD6925]',
      textColor: 'text-[#FD6925]'
    }
  ];

  const impactMetrics = [
    {
      value: '10,000+',
      label: 'Women & Youth Targeted',
      subtext: 'Across hands-on cohorts in 36 Nigerian states & regional nodes',
      trend: 'Multi-Year Plan'
    },
    {
      value: '100%',
      label: 'Fraud-Free Protection',
      subtext: 'Zero capital loss to fake alerts or POD defaults for cohort sellers',
      trend: 'Powered by Escrow'
    },
    {
      value: '₦0.00',
      label: 'Escrow Fee for Cohorts',
      subtext: '100% subsidized platform fees for all foundation cohort participants',
      trend: 'Subsidized Tooling'
    },
    {
      value: '3.8x',
      label: 'Revenue Growth Potential',
      subtext: 'Average interstate sales expansion once buyer fraud hesitation is removed',
      trend: 'Empirical Target'
    }
  ];

  const stories = [
    {
      name: 'Amina B.',
      business: 'Handcrafted Leathergoods & Modest Fashion',
      location: 'Kano, Northern Nigeria',
      quote:
        'Before the cohort, I lost nearly ₦45,000 in courier fees sending bags to customers in Lagos who simply switched off their phones upon arrival. Relyvora Foundation trained me on WhatsApp catalog automation and gave me free escrow links. Today, every interstate order is locked safely in escrow before I step into the dispatch office.',
      impactMetric: '0% Unpaid Deliveries',
      badge: 'Cross-Regional Expansion'
    },
    {
      name: 'Chidinma O.',
      business: 'Direct-from-Source Mobile Gadgets',
      location: 'Computer Village, Ikeja, Lagos',
      quote:
        'In tech retail, fake mobile transfer alerts and payment delays bleed small sellers dry. Through the Foundation’s financial literacy modules, I separated my personal living account from my business cash flow. Using the 6-digit release key at doorstep delivery gave my out-of-state buyers the confidence to pay upfront.',
      impactMetric: '3x Inventory Velocity',
      badge: 'Working Capital Health'
    },
    {
      name: 'Hauwa & Fatima',
      business: 'Shea Butter & Natural Skincare Formulations',
      location: 'Abuja, FCT',
      quote:
        'As young female artisans, commercial banks always rejected us because our transactions were purely cash or informal peer-to-peer chats. Relyvora’s verified escrow transaction ledger became our official financial statement, proving over ₦1.8M in verified transactions and qualifying us for our first seed development grant.',
      impactMetric: 'Bankable Audit Trail',
      badge: 'Formal Credit Readiness'
    }
  ];

  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
  };

  return (
    <div className="w-full bg-site text-main min-h-screen transition-colors">
      {/* ─────────────────────────────────────────────────────────────
          INSTITUTIONAL FOUNDATION HEADER
      ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full bg-site/90 backdrop-blur-md border-b border-border transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Foundation Pill */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group" aria-label="Relyvora home">
              <Logo variant="full" height={32} withLink={false} />
            </Link>
            <div className="h-5 w-px bg-border hidden sm:block" />
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-[11px] font-mono font-semibold tracking-wider text-accent">
              <Sparkles className="w-3 h-3 text-accent" />
              <span>FOUNDATION</span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-medium text-muted">
            <a href="#about" className="hover:text-accent transition-colors py-1">
              About & Mission
            </a>
            <a href="#pillars" className="hover:text-accent transition-colors py-1">
              4 Pillars
            </a>
            <a href="#flagship" className="hover:text-accent transition-colors py-1">
              Women in Digital Commerce
            </a>
            <a href="#youth" className="hover:text-accent transition-colors py-1">
              Youth Skills
            </a>
            <a href="#impact" className="hover:text-accent transition-colors py-1">
              Impact Data
            </a>
            <a href="#partnerships" className="hover:text-accent transition-colors py-1">
              Grant Partners
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <a
              href="https://relyvora.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-muted hover:text-main transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-surface border border-transparent hover:border-border"
            >
              <span>Corporate Site</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
            </a>

            <a
              href="#partnerships"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-accent hover:opacity-90 text-[#071229] transition-all shadow-card active:scale-95"
            >
              <span>Partner With Us</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>

            <ThemeToggle />
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-muted hover:text-main hover:bg-surface rounded-lg transition-colors"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6 text-slate-200" />}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-border bg-surface px-5 py-6 space-y-4 animate-in fade-in duration-150">
            <nav className="flex flex-col space-y-3 text-sm text-slate-200 font-medium">
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-border text-muted hover:text-accent"
              >
                About & Mission
              </a>
              <a
                href="#pillars"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-border text-muted hover:text-accent"
              >
                The 4 Pillars
              </a>
              <a
                href="#flagship"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-border text-muted hover:text-accent"
              >
                Women in Digital Commerce
              </a>
              <a
                href="#youth"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-border text-muted hover:text-accent"
              >
                Youth Skills & AI
              </a>
              <a
                href="#impact"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-border text-muted hover:text-accent"
              >
                Impact Data & Stories
              </a>
              <a
                href="#partnerships"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-muted hover:text-accent"
              >
                Grant & DFI Partnerships
              </a>
            </nav>

            <div className="pt-2 flex flex-col gap-2">
              <a
                href="#partnerships"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2.5 rounded-lg text-xs font-bold bg-accent text-[#071229] flex items-center justify-center gap-1.5"
              >
                <span>Partner With Us</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://relyvora.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 rounded-lg text-xs font-mono text-center text-muted hover:text-main border border-border"
              >
                Return to Relyvora Corporate ↗
              </a>
            </div>
          </div>
        )}
      </header>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: HERO SECTION & SDG ALIGNMENT
      ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28 border-b border-border">
        {/* Ambient Radial Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-radial from-emerald-500/15 via-transparent to-transparent pointer-events-none blur-3xl" />
        <div className="absolute top-20 right-10 w-[350px] h-[350px] bg-radial from-amber-500/10 via-transparent to-transparent pointer-events-none blur-3xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-10 text-center">
          {/* Institutional Pill Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface border border-accent/30 text-xs font-mono text-accent shadow-card backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-semibold tracking-wide">
              ✦ AN ECONOMIC EMPOWERMENT INITIATIVE BY RELYVORA TECHNOLOGIES
            </span>
          </div>

          {/* Main Headline */}
          <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-heading font-bold tracking-tight leading-[1.12] text-main">
              Relyvora Foundation:{' '}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">
                Expanding Access to Opportunity
              </span>{' '}
              in the Digital Economy.
            </h1>

            <p className="text-base sm:text-lg lg:text-xl text-muted leading-relaxed max-w-3xl mx-auto font-sans">
              Equipping women and youth across Africa with digital entrepreneurship skills, financial literacy, and zero-trust payment protection infrastructure to transition from informal trade into thriving, formal digital enterprises.
            </p>
          </div>

          {/* Dual CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <a
              href="#partnerships"
              className="w-full sm:w-auto px-7 py-4 rounded-xl bg-accent hover:opacity-90 text-[#071229] font-bold text-sm flex items-center justify-center gap-2 shadow-card transition-all transform hover:-translate-y-0.5"
            >
              <span>Partner With Us</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <a
              href="#pillars"
              className="w-full sm:w-auto px-7 py-4 rounded-xl bg-surface hover:bg-site text-main border border-border font-bold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <Layers className="w-4 h-4 text-accent" />
              <span>Explore Our 4 Pillars</span>
            </a>
          </div>

          {/* Institutional Grant & DFI Relevance Callout */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-muted font-mono">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              MIT Economic Prosperity Challenge Alignment
            </span>
            <span className="hidden sm:inline text-border">•</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              ITFC & AfCFTA Digital Trade Framework
            </span>
            <span className="hidden sm:inline text-border">•</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              Ring-Fenced Programmatic Governance
            </span>
          </div>

          {/* 4 UN SDG Badges Strip */}
          <div className="pt-8 max-w-5xl mx-auto">
            <div className="text-[11px] font-mono tracking-wider text-muted uppercase text-center mb-4">
              Direct Alignment with United Nations Sustainable Development Goals
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-left">
              {sdgs.map((sdg) => (
                <div
                  key={sdg.number}
                  className="p-3.5 rounded-card bg-surface border border-border hover:border-border/80 transition-colors flex flex-col justify-between space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <span className={`w-7 h-7 rounded-lg ${sdg.color} text-white font-black text-xs flex items-center justify-center font-mono shadow-xs`}>
                      {sdg.number}
                    </span>
                    <span className="text-[10px] font-mono font-medium text-muted group-hover:text-main">
                      {sdg.target}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-heading font-semibold text-main leading-snug">
                      SDG {sdg.number}: {sdg.title}
                    </h4>
                    <p className="text-[11px] text-muted leading-tight mt-1 line-clamp-2">
                      {sdg.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: ABOUT THE FOUNDATION & OUR MISSION
      ───────────────────────────────────────────────────────────── */}
      <section id="about" className="py-20 sm:py-28 border-b border-border relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {/* Section Header */}
          <div className="space-y-3 max-w-3xl">
            <div className="text-xs font-mono font-semibold tracking-wider text-accent uppercase">
              // Institutional Briefing & Context
            </div>
            <h2 className="text-2xl sm:text-4xl font-heading font-bold text-main tracking-tight">
              Bridging the Trust and Capability Divide in African Social Commerce.
            </h2>
          </div>

          {/* 2-Column Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: Context Analysis */}
            <div className="lg:col-span-7 space-y-6 text-muted text-sm sm:text-base leading-relaxed font-sans">
              <p>
                Across Africa, more than <span className="text-main font-semibold">82% of women and young workers</span> earn their livelihoods in the informal economy. As smartphone penetration accelerates, informal commerce has migrated directly to WhatsApp, Instagram, TikTok, and Facebook, generating an estimated <span className="text-main font-semibold">$20+ billion</span> in decentralized trade.
              </p>
              <p>
                Yet this informal boom faces a structural bottleneck:{' '}
                <span className="text-accent font-medium">the acute deficit of transactional trust.</span> Emerging merchants are trapped in high-risk "Payment-on-Delivery" cycles where over <span className="text-main font-semibold">30% to 40% of interstate orders are rejected, intercepted by dispatch scams, or ghosted by buyers.</span>
              </p>
              <p>
                For a female artisan or youth merchant operating on a fragile working capital buffer of ₦50,000 to ₦150,000, two unfulfilled deliveries can permanently wipe out their business capital.
              </p>

              <div className="p-4 rounded-card bg-surface border border-border space-y-2">
                <div className="text-xs font-mono text-amber-400 font-semibold flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-amber-400" />
                  <span>The Dual-Gap Thesis</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Training programs that teach digital marketing without providing secure payment infrastructure fail because sellers lose their capital to fraud. Conversely, financial rails alone fail without basic bookkeeping, AI merchandising literacy, and peer mentorship. Relyvora Foundation unifies both.
                </p>
              </div>
            </div>

            {/* Right Column: Mission Statement Callout Card */}
            <div className="lg:col-span-5">
              <div className="p-6 sm:p-8 rounded-card bg-surface border border-accent/30 shadow-card space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs font-mono font-semibold text-accent">
                  <Award className="w-3.5 h-3.5" />
                  <span>FOUNDATION MISSION STATEMENT</span>
                </div>

                <blockquote className="text-base sm:text-lg font-heading italic text-main leading-relaxed border-l-2 border-accent pl-4 py-1">
                  &ldquo;To democratize safe digital trade by combining practical capacity building with institutional-grade transaction protection—ensuring emerging entrepreneurs don't just go online, but grow sustainably without losing capital to fraud.&rdquo;
                </blockquote>

                <div className="space-y-3 pt-2 border-t border-border text-xs text-muted">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Structured cohorts across all 36 Nigerian states and regional nodes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Free, zero-fee Relyvora Escrow Vault infrastructure for cohort members</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Verifiable digital audit trails that graduate informal sellers into bankability</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: OUR FOUR PROGRAMME PILLARS (BENTO GRID)
      ───────────────────────────────────────────────────────────── */}
      <section id="pillars" className="py-20 sm:py-28 border-b border-border bg-site">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="text-xs font-mono font-semibold tracking-wider text-emerald-400 uppercase">
                // Programmatic Framework
              </div>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                Our Four Programme Pillars
              </h2>
              <p className="text-sm sm:text-base text-muted leading-relaxed">
                A multi-dimensional economic empowerment framework designed to transition informal micro-sellers into resilient, fraud-proof digital enterprises.
              </p>
            </div>

            {/* Quick interactive toggle indicators */}
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              {pillars.map((pillar, idx) => (
                <button
                  key={pillar.id}
                  onClick={() => setActivePillar(idx)}
                  className={`px-3 py-1.5 rounded-lg border transition-all ${
                    activePillar === idx
                      ? 'bg-accent/15 border-accent text-accent font-bold'
                      : 'bg-surface border-border text-muted hover:text-main'
                  }`}
                >
                  Pillar {pillar.number}
                </button>
              ))}
            </div>
          </div>

          {/* 4-Card Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {pillars.map((pillar, idx) => {
              const Icon = pillar.icon;
              const isSelected = activePillar === idx;

              return (
                <div
                  key={pillar.id}
                  onClick={() => setActivePillar(idx)}
                  className={`relative p-6 sm:p-8 rounded-card bg-surface border ${
                    isSelected ? 'border-accent ring-2 ring-accent/20' : 'border-border'
                  } transition-all duration-300 hover:border-border/80 cursor-pointer flex flex-col justify-between space-y-6 group`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[11px] font-mono font-bold text-muted">
                            PILLAR {pillar.number}
                          </span>
                          <div className="text-[10px] font-mono text-accent font-semibold">
                            {pillar.badge}
                          </div>
                        </div>
                      </div>

                      <span className="text-2xl font-mono font-bold text-muted/40">
                        {pillar.number}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="text-xl sm:text-2xl font-heading font-bold text-main group-hover:text-accent transition-colors">
                        {pillar.title}
                      </h3>
                      <div className="text-xs font-mono text-muted font-medium">
                        {pillar.tagline}
                      </div>
                    </div>

                    <p className="text-sm text-muted leading-relaxed font-sans">
                      {pillar.summary}
                    </p>
                  </div>

                  {/* Programmatic Outcomes List */}
                  <div className="pt-4 border-t border-border space-y-2.5">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-muted">
                      Core Curriculum & Capabilities:
                    </div>
                    {pillar.keyOutcomes.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: FLAGSHIP SPOTLIGHT: WOMEN IN DIGITAL COMMERCE
      ───────────────────────────────────────────────────────────── */}
      <section id="flagship" className="py-20 sm:py-28 border-b border-border relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono font-semibold text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>FLAGSHIP PROGRAMME DEEP DIVE</span>
            </div>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-heading font-bold text-main tracking-tight">
              Women in Digital Commerce: The Empowerment Flywheel
            </h2>
            <p className="text-sm sm:text-base text-muted leading-relaxed font-sans">
              Why women micro-entrepreneurs thrive when practical training is backed by zero-trust escrow protection: breaking the informal trust penalty.
            </p>
          </div>

          {/* Flywheel Progression Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Step 1: TRAIN */}
            <div className="p-6 sm:p-8 rounded-card bg-surface border border-border relative flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent font-mono font-bold text-sm flex items-center justify-center">
                    01
                  </span>
                  <span className="text-xs font-mono text-accent uppercase font-semibold">
                    STAGE 1: CAPACITY
                  </span>
                </div>

                <h3 className="text-xl font-heading font-bold text-main">TRAIN</h3>
                <div className="text-xs font-mono text-muted">
                  Digital & Financial Literacy Bootcamps
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  Female micro-merchants undergo a hands-on, mobile-first 6-week curriculum covering product photography, prompt-assisted catalog writing, cost-plus unit pricing, and digital customer service across WhatsApp and Instagram.
                </p>
              </div>

              <div className="p-3.5 rounded-card bg-site border border-border text-xs space-y-1 text-muted font-mono">
                <div className="text-emerald-400 font-semibold">Key Output:</div>
                <div>Structured digital storefront & commercial pricing confidence.</div>
              </div>
            </div>

            {/* Step 2: EQUIP */}
            <div className="p-6 sm:p-8 rounded-card bg-surface border border-accent shadow-card relative flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="w-8 h-8 rounded-lg bg-accent text-[#071229] font-mono font-bold text-sm flex items-center justify-center">
                    02
                  </span>
                  <span className="text-xs font-mono text-accent uppercase font-semibold">
                    STAGE 2: INFRASTRUCTURE
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white">EQUIP</h3>
                <div className="text-xs font-mono text-accent font-medium">
                  Zero-Fee Relyvora Escrow Vaults
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  Cohort graduates receive subsidized, zero-fee Relyvora Escrow accounts. Buyers deposit funds into an automated Providus/Anchor FBO ledger upfront. The vendor dispatches with 100% confidence, ending the plague of rejected deliveries.
                </p>
              </div>

              <div className="p-3.5 rounded-card bg-accent/10 border border-accent/20 text-xs space-y-1 text-accent font-mono">
                <div className="text-emerald-400 font-semibold">Key Output:</div>
                <div>Elimination of capital loss to ghost buyers & fake alert scams.</div>
              </div>
            </div>

            {/* Step 3: SCALE */}
            <div className="p-6 sm:p-8 rounded-card bg-surface border border-border relative flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-mono font-bold text-sm flex items-center justify-center">
                    03
                  </span>
                  <span className="text-xs font-mono text-amber-600 dark:text-amber-400 uppercase font-semibold">
                    STAGE 3: INCLUSION
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white">SCALE</h3>
                <div className="text-xs font-mono text-muted">
                  Verified Data & Bankability
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  Every settled escrow transaction produces a cryptographically verifiable delivery and settlement record. This unalterable transaction history transforms informal sellers into credit-ready micro-enterprises qualified for commercial working capital.
                </p>
              </div>

              <div className="p-3.5 rounded-card bg-site border border-border text-xs space-y-1 text-muted font-mono">
                <div className="text-amber-400 font-semibold">Key Output:</div>
                <div>Auditable transaction history for micro-grants & inventory loans.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 5: YOUTH ENTREPRENEURSHIP & FUTURE-READY SKILLS
      ───────────────────────────────────────────────────────────── */}
      <section id="youth" className="py-20 sm:py-28 border-b border-border bg-site">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-6 space-y-6">
              <div className="text-xs font-mono font-semibold tracking-wider text-emerald-400 uppercase">
                // Youth Opportunity Track
              </div>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                Empowering Africa’s Digital Youth with Frontier Commerce Skills.
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Africa has the youngest population on earth, with 70% under age 30. Our youth cohorts equip ambitious young people to move beyond precarious gig labor into high-value digital merchandising and e-commerce management.
              </p>

              <div className="space-y-4">
                <div className="p-4 rounded-card bg-surface border border-border flex items-start gap-3.5">
                  <Cpu className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-heading font-semibold text-main">
                      AI-Assisted Merchandising & Prompt Engineering
                    </h4>
                    <p className="text-xs text-muted mt-1 leading-relaxed font-sans">
                      Training youth to leverage generative AI models for instant catalog copywriting, SEO-optimized product tagging, and automated customer triage on messaging channels.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-card bg-surface border border-border flex items-start gap-3.5">
                  <Globe2 className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-heading font-semibold text-main">
                      AfCFTA Digital Trade & Cross-Border Readiness
                    </h4>
                    <p className="text-xs text-muted mt-1 leading-relaxed font-sans">
                      Preparing young merchants for cross-border e-commerce across Anglophone and Francophone West Africa, navigating customs documentation, currency conversions, and regional logistics corridors.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-card bg-surface border border-border flex items-start gap-3.5">
                  <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-heading font-semibold text-main">
                      Zero-Trust Transaction Mechanics
                    </h4>
                    <p className="text-xs text-muted mt-1 leading-relaxed font-sans">
                      Teaching courier integration protocols, 6-digit release key doorstep handshakes, and dispute mediation evidence preservation to insulate against logistics fraud.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Cohort Model Blueprint Card */}
            <div className="lg:col-span-6">
              <div className="p-6 sm:p-8 rounded-card bg-surface border border-border space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div>
                    <div className="text-xs font-mono text-emerald-400 font-semibold">
                      COHORT ARCHITECTURE
                    </div>
                    <div className="text-lg font-heading font-semibold text-main">
                      6-Week Intensive Digital Apprenticeship
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs font-mono text-accent font-semibold">
                    Hybrid / Mobile-First
                  </span>
                </div>

                {/* Timeline Weeks */}
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded bg-accent/10 text-xs font-mono text-accent flex items-center justify-center font-bold shrink-0">
                      1
                    </span>
                    <div className="text-xs text-muted">
                      <strong className="text-main">Weeks 1–2:</strong> Digital Brand Setup, WhatsApp Business Catalog Architecture & Generative AI Tools.
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded bg-accent/10 text-xs font-mono text-accent flex items-center justify-center font-bold shrink-0">
                      2
                    </span>
                    <div className="text-xs text-muted">
                      <strong className="text-main">Weeks 3–4:</strong> Financial Literacy, Cash-Flow Separation & Digital Ledger Bookkeeping.
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded bg-accent/10 text-xs font-mono text-accent flex items-center justify-center font-bold shrink-0">
                      3
                    </span>
                    <div className="text-xs text-muted">
                      <strong className="text-main">Week 5:</strong> Live Escrow Sandboxes: Generating Dynamic Virtual Accounts & Doorstep Release Verification.
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded bg-accent/10 text-xs font-mono text-accent flex items-center justify-center font-bold shrink-0">
                      4
                    </span>
                    <div className="text-xs text-muted">
                      <strong className="text-main">Week 6:</strong> Capstone Trade Fair, Mentor Showcase & Subsidized Relyvora Escrow Account Activation.
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-card bg-site border border-border flex items-center justify-between text-xs font-mono text-muted">
                  <span>Graduation Certification:</span>
                  <span className="text-emerald-400 font-semibold">
                    Certified Relyvora Safe Merchant ✦
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 6: IMPACT FRAMEWORK & STORIES
      ───────────────────────────────────────────────────────────── */}
      <section id="impact" className="py-20 sm:py-28 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="text-xs font-mono font-semibold tracking-wider text-emerald-400 uppercase">
              // Empirical Metrics & Human Impact
            </div>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              Impact Framework & Merchant Stories
            </h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Tracking tangible capital preservation, income growth, and digital formalization across Nigerian commercial centers.
            </p>
          </div>

          {/* Target Impact Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {impactMetrics.map((stat, i) => (
              <div
                key={i}
                className="p-6 rounded-card bg-surface border border-border hover:border-border/80 transition-all flex flex-col justify-between space-y-4 group"
              >
                <div>
                  <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-400">
                    {stat.trend}
                  </div>
                  <div className="text-3xl sm:text-4xl font-mono font-bold text-main tracking-tight mt-1">
                    {stat.value}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-heading font-semibold text-main">
                    {stat.label}
                  </h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed font-sans">
                    {stat.subtext}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* 3 Real Case Study Cards */}
          <div className="space-y-6 pt-4">
            <div className="text-xs font-mono uppercase tracking-wider text-muted text-center">
              Field Case Studies & Merchant Voices
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
              {stories.map((story, i) => (
                <div
                  key={i}
                  className="p-6 sm:p-7 rounded-card bg-surface border border-border flex flex-col justify-between space-y-6 hover:border-border/80 transition-colors"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold">
                        {story.badge}
                      </span>
                      <Quote className="w-5 h-5 text-muted/50" />
                    </div>

                    <p className="text-xs sm:text-sm text-muted leading-relaxed italic font-sans">
                      &ldquo;{story.quote}&rdquo;
                    </p>
                  </div>

                  <div className="pt-4 border-t border-border flex items-end justify-between">
                    <div>
                      <div className="text-sm font-heading font-semibold text-main">
                        {story.name}
                      </div>
                      <div className="text-xs text-muted">
                        {story.business}
                      </div>
                      <div className="text-[11px] font-mono text-emerald-400 mt-0.5">
                        📍 {story.location}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] font-mono text-muted uppercase">
                        Outcome
                      </div>
                      <div className="text-xs font-mono font-bold text-accent">
                        {story.impactMetric}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 7: MENTORSHIP, INSTITUTIONAL PARTNERSHIPS & GRANT ALIGNMENT
      ───────────────────────────────────────────────────────────── */}
      <section id="partnerships" className="py-20 sm:py-28 border-b border-border bg-site">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="text-xs font-mono font-semibold tracking-wider text-emerald-400 uppercase">
              // For Grantmakers, DFIs & Institutional Partners
            </div>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              Institutional Partnership Pathways
            </h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              We collaborate with global development finance institutions, multilateral challenge funds, and corporate foundations seeking high-integrity, data-verifiable impact.
            </p>
          </div>

          {/* 3 Partnership Tracks */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            <div className="p-6 sm:p-8 rounded-card bg-surface border border-border space-y-5">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-emerald-400 font-semibold">
                  TRACK 01
                </div>
                <h3 className="text-lg font-heading font-semibold text-main">
                  Co-Designed Capacity Workshops
                </h3>
              </div>
              <p className="text-xs text-muted leading-relaxed font-sans">
                Partner with us to deploy specialized curriculum tracks tailored to specific geographic corridors, agricultural value chains, or handicraft clusters with local chambers of commerce.
              </p>
              <ul className="text-xs text-muted space-y-2 pt-2 border-t border-border">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  Customized localization for local dialects & trade
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  Cohort progress tracking & attendance verification
                </li>
              </ul>
            </div>

            <div className="p-6 sm:p-8 rounded-card bg-surface border border-border space-y-5">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-teal-400 font-semibold">
                  TRACK 02
                </div>
                <h3 className="text-lg font-heading font-semibold text-main">
                  Empirical Research & Data Partnerships
                </h3>
              </div>
              <p className="text-xs text-muted leading-relaxed font-sans">
                Provide grant evaluators and academic researchers with anonymized, high-fidelity empirical data on social commerce fraud patterns, gender financial behavior, and interstate trade barriers.
              </p>
              <ul className="text-xs text-muted space-y-2 pt-2 border-t border-border">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  Quarterly Gender Digital Inclusion Index reports
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  Policy briefs for ministries of trade and digital economy
                </li>
              </ul>
            </div>

            <div className="p-6 sm:p-8 rounded-card bg-surface border border-border space-y-5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-amber-400 font-semibold">
                  TRACK 03
                </div>
                <h3 className="text-lg font-heading font-semibold text-main">
                  Ring-Fenced Grant Deployment
                </h3>
              </div>
              <p className="text-xs text-muted leading-relaxed font-sans">
                Channel programmatic subsidies, zero-fee transaction vouchers, and micro-grant seed capital directly to verified female and youth cohort graduates with 100% auditable traceability.
              </p>
              <ul className="text-xs text-muted space-y-2 pt-2 border-t border-border">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  Designated, ring-fenced institutional impact accounts
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  Independent third-party financial audits & reporting
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 8: SUPPORT OUR PROGRAMMES (GRANT INQUIRY & FOOTER)
      ───────────────────────────────────────────────────────────── */}
      <section id="partner" className="py-20 sm:py-28 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="p-8 sm:p-12 rounded-card bg-surface border border-border shadow-card space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />

            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono font-semibold text-emerald-400">
                <Mail className="w-3.5 h-3.5" />
                <span>INSTITUTIONAL ENGAGEMENT</span>
              </div>

              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                Support Our Programmes & Co-Create Impact
              </h2>

              <p className="text-sm sm:text-base text-muted leading-relaxed max-w-2xl font-sans">
                Whether you are an international challenge committee (such as MIT Economic Prosperity or ITFC), a bilateral DFI, or a corporate foundation, we welcome collaborative discussions on advancing African digital trade.
              </p>
            </div>

            {/* Role selector tabs */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPartnerType('grant')}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all ${
                  partnerType === 'grant'
                    ? 'bg-accent text-[#071229] font-bold shadow-xs'
                    : 'bg-site text-muted hover:text-main border border-border'
                }`}
              >
                Grantmakers & DFIs
              </button>

              <button
                type="button"
                onClick={() => setPartnerType('corporate')}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all ${
                  partnerType === 'corporate'
                    ? 'bg-accent text-[#071229] font-bold shadow-xs'
                    : 'bg-site text-muted hover:text-main border border-border'
                }`}
              >
                Corporate Sponsors & CSR
              </button>

              <button
                type="button"
                onClick={() => setPartnerType('mentor')}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all ${
                  partnerType === 'mentor'
                    ? 'bg-accent text-[#071229] font-bold shadow-xs'
                    : 'bg-site text-muted hover:text-main border border-border'
                }`}
              >
                Mentors & Industry Operators
              </button>
            </div>

            {/* Interactive Engagement Form */}
            {formSubmitted ? (
              <div className="p-6 rounded-card bg-accent/10 border border-accent/30 text-center space-y-3 animate-in fade-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-heading font-semibold text-main">
                  Thank You for Reaching Out
                </h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  Our institutional partnerships team will review your message and reply via official email within 2 business days with our comprehensive programmatic briefing deck.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setFormSubmitted(false)}
                    className="text-xs font-mono text-emerald-400 hover:underline"
                  >
                    Submit another inquiry
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInquirySubmit} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-muted uppercase">
                      Contact Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Dr. Ngozi Adeleke"
                      className="w-full px-4 py-3 rounded-xl bg-site border border-border text-main placeholder:text-muted/60 text-xs focus:outline-hidden focus:border-accent transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-muted uppercase">
                      Organization / Institution
                    </label>
                    <input
                      type="text"
                      required
                      value={formOrg}
                      onChange={(e) => setFormOrg(e.target.value)}
                      placeholder="e.g. Global Development Fund / MIT Challenge"
                      className="w-full px-4 py-3 rounded-xl bg-site border border-border text-main placeholder:text-muted/60 text-xs focus:outline-hidden focus:border-accent transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-muted uppercase">
                    Official Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="name@organization.org"
                    className="w-full px-4 py-3 rounded-xl bg-site border border-border text-main placeholder:text-muted/60 text-xs focus:outline-hidden focus:border-accent transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-muted uppercase">
                    Inquiry Details & Scope of Interest
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    placeholder={`Describe your interest in ${
                      partnerType === 'grant'
                        ? 'grant funding, challenge sponsorship, or DFI research'
                        : partnerType === 'corporate'
                        ? 'CSR sponsorship or commercial partnership'
                        : 'mentorship and hands-on cohort guidance'
                    }...`}
                    className="w-full px-4 py-3 rounded-xl bg-site border border-border text-main placeholder:text-muted/60 text-xs focus:outline-hidden focus:border-accent transition-colors resize-none"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                  <div className="text-xs text-muted flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-accent" />
                    <span>Direct Desk:</span>
                    <a
                      href="mailto:foundation@relyvora.com"
                      className="text-accent font-mono hover:underline font-semibold"
                    >
                      foundation@relyvora.com
                    </a>
                  </div>

                  <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-accent hover:opacity-90 text-[#071229] font-bold text-xs flex items-center justify-center gap-2 shadow-card transition-all"
                  >
                    <span>Send Partnership Inquiry</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────
              MANDATORY COMPLIANCE & LEGAL GOVERNANCE FOOTER
          ───────────────────────────────────────────────────────────── */}
          <footer className="pt-12 border-t border-border space-y-8 text-muted text-xs">
            {/* Mandatory Statutory Governance Box */}
            <div className="p-4 rounded-card bg-site border border-border text-muted text-xs leading-relaxed space-y-2">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-emerald-400 uppercase">
                <Building2 className="w-4 h-4 text-accent" />
                <span>Statutory Governance & Compliance Notice</span>
              </div>
              <p className="text-muted text-xs leading-relaxed font-sans">
                Relyvora Foundation is a programmatic economic empowerment initiative operated by Relyvora Technologies Limited. All grant funding and programmatic partnerships are managed through dedicated, ring-fenced impact accounts with strict audit and reporting compliance.
              </p>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-border/60">
              <div className="flex items-center gap-3">
                <Logo variant="full" height={26} withLink={false} />
                <span className="text-[11px] text-muted font-mono">
                  © {new Date().getFullYear()} Relyvora Foundation
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-6 text-[11px] font-mono text-muted">
                <a 
                  href="https://relyvora.com" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-emerald-400 transition-colors"
                >
                  Corporate Portal
                </a>
                <a
                  href="https://ng.relyvora.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  <span className="inline-flex items-center gap-1.5"><FlagIcon country="NG" size={14} /><span>Nigeria App</span></span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
                <a
                  href="mailto:foundation@relyvora.com"
                  className="hover:text-emerald-400 transition-colors"
                >
                  foundation@relyvora.com
                </a>
              </div>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
