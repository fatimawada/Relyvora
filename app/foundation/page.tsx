'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
    <div className="w-full bg-[#090E1A] text-slate-100 min-h-screen">
      {/* ─────────────────────────────────────────────────────────────
          INSTITUTIONAL FOUNDATION HEADER
      ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full bg-[#090E1A]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Foundation Pill */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <Image
                alt="Relyvora Logo"
                height={38}
                width={135}
                src="/relyvora-logo.png"
                className="h-8 w-auto object-contain brightness-110"
              />
            </Link>
            <div className="h-5 w-px bg-slate-700 hidden sm:block" />
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-mono font-semibold tracking-wider text-emerald-400">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>FOUNDATION</span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-medium text-slate-300">
            <a href="#about" className="hover:text-emerald-400 transition-colors py-1">
              About & Mission
            </a>
            <a href="#pillars" className="hover:text-emerald-400 transition-colors py-1">
              4 Pillars
            </a>
            <a href="#flagship" className="hover:text-emerald-400 transition-colors py-1">
              Women in Digital Commerce
            </a>
            <a href="#youth" className="hover:text-emerald-400 transition-colors py-1">
              Youth Skills
            </a>
            <a href="#impact" className="hover:text-emerald-400 transition-colors py-1">
              Impact Data
            </a>
            <a href="#partnerships" className="hover:text-emerald-400 transition-colors py-1">
              Grant Partners
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-slate-800/60"
            >
              <span>Corporate Site</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
            </Link>

            <a
              href="#partnerships"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-md shadow-emerald-500/20 active:scale-95"
            >
              <span>Partner With Us</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6 text-slate-200" />}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-slate-800 bg-[#0B1222] px-5 py-6 space-y-4 animate-in fade-in duration-150">
            <nav className="flex flex-col space-y-3 text-sm text-slate-200 font-medium">
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-slate-800/60 text-slate-300 hover:text-emerald-400"
              >
                About & Mission
              </a>
              <a
                href="#pillars"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-slate-800/60 text-slate-300 hover:text-emerald-400"
              >
                The 4 Pillars
              </a>
              <a
                href="#flagship"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-slate-800/60 text-slate-300 hover:text-emerald-400"
              >
                Women in Digital Commerce
              </a>
              <a
                href="#youth"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-slate-800/60 text-slate-300 hover:text-emerald-400"
              >
                Youth Skills & AI
              </a>
              <a
                href="#impact"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 border-b border-slate-800/60 text-slate-300 hover:text-emerald-400"
              >
                Impact Data & Stories
              </a>
              <a
                href="#partnerships"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-slate-300 hover:text-emerald-400"
              >
                Grant & DFI Partnerships
              </a>
            </nav>

            <div className="pt-2 flex flex-col gap-2">
              <a
                href="#partnerships"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 flex items-center justify-center gap-1.5"
              >
                <span>Partner With Us</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <Link
                href="/"
                className="w-full py-2 rounded-lg text-xs font-mono text-center text-slate-400 hover:text-white border border-slate-800"
              >
                Return to Relyvora Corporate ↗
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: HERO SECTION & SDG ALIGNMENT
      ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28 border-b border-slate-800/80">
        {/* Ambient Radial Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-radial from-emerald-500/15 via-transparent to-transparent pointer-events-none blur-3xl" />
        <div className="absolute top-20 right-10 w-[350px] h-[350px] bg-radial from-amber-500/10 via-transparent to-transparent pointer-events-none blur-3xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-10 text-center">
          {/* Institutional Pill Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-emerald-500/30 text-xs font-mono text-emerald-400 shadow-lg shadow-emerald-950/40 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold tracking-wide">
              ✦ AN ECONOMIC EMPOWERMENT INITIATIVE BY RELYVORA TECHNOLOGIES
            </span>
          </div>

          {/* Main Headline */}
          <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.12] text-white">
              Relyvora Foundation:{' '}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">
                Expanding Access to Opportunity
              </span>{' '}
              in the Digital Economy.
            </h1>

            <p className="text-base sm:text-lg lg:text-xl text-slate-300 leading-relaxed max-w-3xl mx-auto font-normal">
              Equipping women and youth across Africa with digital entrepreneurship skills, financial literacy, and zero-trust payment protection infrastructure to transition from informal trade into thriving, formal digital enterprises.
            </p>
          </div>

          {/* Dual CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <a
              href="#partnerships"
              className="w-full sm:w-auto px-7 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 transition-all transform hover:-translate-y-0.5"
            >
              <span>Partner With Us</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <a
              href="#pillars"
              className="w-full sm:w-auto px-7 py-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 font-bold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Explore Our 4 Pillars</span>
            </a>
          </div>

          {/* Institutional Grant & DFI Relevance Callout */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              MIT Economic Prosperity Challenge Alignment
            </span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ITFC & AfCFTA Digital Trade Framework
            </span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Ring-Fenced Programmatic Governance
            </span>
          </div>

          {/* 4 UN SDG Badges Strip */}
          <div className="pt-8 max-w-5xl mx-auto">
            <div className="text-[11px] font-mono tracking-wider text-slate-400 uppercase text-center mb-4">
              Direct Alignment with United Nations Sustainable Development Goals
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-left">
              {sdgs.map((sdg) => (
                <div
                  key={sdg.number}
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col justify-between space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <span className={`w-7 h-7 rounded-lg ${sdg.color} text-white font-black text-xs flex items-center justify-center font-mono shadow-xs`}>
                      {sdg.number}
                    </span>
                    <span className="text-[10px] font-mono font-medium text-slate-400 group-hover:text-slate-300">
                      {sdg.target}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-snug">
                      SDG {sdg.number}: {sdg.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-tight mt-1 line-clamp-2">
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
      <section id="about" className="py-20 sm:py-28 border-b border-slate-800/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {/* Section Header */}
          <div className="space-y-3 max-w-3xl">
            <div className="text-xs font-mono font-semibold tracking-wider text-emerald-400 uppercase">
              // Institutional Briefing & Context
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Bridging the Trust and Capability Divide in African Social Commerce.
            </h2>
          </div>

          {/* 2-Column Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: Context Analysis */}
            <div className="lg:col-span-7 space-y-6 text-slate-300 text-sm sm:text-base leading-relaxed">
              <p>
                Across Africa, more than <span className="text-white font-semibold">82% of women and young workers</span> earn their livelihoods in the informal economy. As smartphone penetration accelerates, informal commerce has migrated directly to WhatsApp, Instagram, TikTok, and Facebook, generating an estimated <span className="text-white font-semibold">$20+ billion</span> in decentralized trade.
              </p>
              <p>
                Yet this informal boom faces a structural bottleneck:{' '}
                <span className="text-emerald-400 font-medium">the acute deficit of transactional trust.</span> Emerging merchants are trapped in high-risk "Payment-on-Delivery" cycles where over <span className="text-white font-semibold">30% to 40% of interstate orders are rejected, intercepted by dispatch scams, or ghosted by buyers.</span>
              </p>
              <p>
                For a female artisan or youth merchant operating on a fragile working capital buffer of ₦50,000 to ₦150,000, two unfulfilled deliveries can permanently wipe out their business capital.
              </p>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="text-xs font-mono text-amber-400 font-semibold flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-amber-400" />
                  <span>The Dual-Gap Thesis</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Training programs that teach digital marketing without providing secure payment infrastructure fail because sellers lose their capital to fraud. Conversely, financial rails alone fail without basic bookkeeping, AI merchandising literacy, and peer mentorship. Relyvora Foundation unifies both.
                </p>
              </div>
            </div>

            {/* Right Column: Mission Statement Callout Card */}
            <div className="lg:col-span-5">
              <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-emerald-950/40 border border-emerald-500/40 shadow-2xl space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono font-semibold text-emerald-400">
                  <Award className="w-3.5 h-3.5" />
                  <span>FOUNDATION MISSION STATEMENT</span>
                </div>

                <blockquote className="text-base sm:text-lg font-serif italic text-slate-100 leading-relaxed border-l-2 border-emerald-400 pl-4 py-1">
                  &ldquo;To democratize safe digital trade by combining practical capacity building with institutional-grade transaction protection—ensuring emerging entrepreneurs don't just go online, but grow sustainably without losing capital to fraud.&rdquo;
                </blockquote>

                <div className="space-y-3 pt-2 border-t border-slate-800 text-xs text-slate-300">
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
      <section id="pillars" className="py-20 sm:py-28 border-b border-slate-800/80 bg-[#070B14]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="text-xs font-mono font-semibold tracking-wider text-emerald-400 uppercase">
                // Programmatic Framework
              </div>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                Our Four Programme Pillars
              </h2>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
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
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
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
                  className={`relative p-6 sm:p-8 rounded-2xl bg-gradient-to-b ${pillar.accentColor} bg-[#0A101D] border ${
                    isSelected ? 'border-emerald-400 ring-2 ring-emerald-500/20' : 'border-slate-800/90'
                  } transition-all duration-300 hover:border-slate-700 cursor-pointer flex flex-col justify-between space-y-6 group`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[11px] font-mono font-bold text-slate-400">
                            PILLAR {pillar.number}
                          </span>
                          <div className="text-[10px] font-mono text-emerald-400 font-semibold">
                            {pillar.badge}
                          </div>
                        </div>
                      </div>

                      <span className="text-2xl font-black text-slate-700/60 font-mono">
                        {pillar.number}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-emerald-300 transition-colors">
                        {pillar.title}
                      </h3>
                      <div className="text-xs font-mono text-slate-400 font-medium">
                        {pillar.tagline}
                      </div>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                      {pillar.summary}
                    </p>
                  </div>

                  {/* Programmatic Outcomes List */}
                  <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Core Curriculum & Capabilities:
                    </div>
                    {pillar.keyOutcomes.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
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
      <section id="flagship" className="py-20 sm:py-28 border-b border-slate-800/80 relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono font-semibold text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>FLAGSHIP PROGRAMME DEEP DIVE</span>
            </div>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              Women in Digital Commerce: The Empowerment Flywheel
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Why women micro-entrepreneurs thrive when practical training is backed by zero-trust escrow protection: breaking the informal trust penalty.
            </p>
          </div>

          {/* Flywheel Progression Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Step 1: TRAIN */}
            <div className="p-6 sm:p-8 rounded-2xl bg-[#0B1324] border border-slate-800 relative flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-mono font-black text-sm flex items-center justify-center">
                    01
                  </span>
                  <span className="text-xs font-mono text-emerald-400 uppercase font-semibold">
                    STAGE 1: CAPACITY
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white">TRAIN</h3>
                <div className="text-xs font-mono text-slate-400">
                  Digital & Financial Literacy Bootcamps
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  Female micro-merchants undergo a hands-on, mobile-first 6-week curriculum covering product photography, prompt-assisted catalog writing, cost-plus unit pricing, and digital customer service across WhatsApp and Instagram.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1 text-slate-400 font-mono">
                <div className="text-emerald-400 font-semibold">Key Output:</div>
                <div>Structured digital storefront & commercial pricing confidence.</div>
              </div>
            </div>

            {/* Step 2: EQUIP */}
            <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-emerald-950/40 to-[#0B1324] border border-emerald-500/50 shadow-xl shadow-emerald-950/50 relative flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="w-8 h-8 rounded-lg bg-emerald-500 text-slate-950 font-mono font-black text-sm flex items-center justify-center">
                    02
                  </span>
                  <span className="text-xs font-mono text-emerald-300 uppercase font-semibold">
                    STAGE 2: INFRASTRUCTURE
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white">EQUIP</h3>
                <div className="text-xs font-mono text-emerald-400">
                  Zero-Fee Relyvora Escrow Vaults
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  Cohort graduates receive subsidized, zero-fee Relyvora Escrow accounts. Buyers deposit funds into an automated Providus/Anchor FBO ledger upfront. The vendor dispatches with 100% confidence, ending the plague of rejected deliveries.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-xs space-y-1 text-emerald-200 font-mono">
                <div className="text-emerald-400 font-semibold">Key Output:</div>
                <div>Elimination of capital loss to ghost buyers & fake alert scams.</div>
              </div>
            </div>

            {/* Step 3: SCALE */}
            <div className="p-6 sm:p-8 rounded-2xl bg-[#0B1324] border border-slate-800 relative flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="w-8 h-8 rounded-lg bg-amber-950 border border-amber-500/40 text-amber-400 font-mono font-black text-sm flex items-center justify-center">
                    03
                  </span>
                  <span className="text-xs font-mono text-amber-400 uppercase font-semibold">
                    STAGE 3: INCLUSION
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white">SCALE</h3>
                <div className="text-xs font-mono text-slate-400">
                  Verified Data & Bankability
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  Every settled escrow transaction produces a cryptographically verifiable delivery and settlement record. This unalterable transaction history transforms informal sellers into credit-ready micro-enterprises qualified for commercial working capital.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1 text-slate-400 font-mono">
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
      <section id="youth" className="py-20 sm:py-28 border-b border-slate-800/80 bg-[#070B14]">
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
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-3.5">
                  <Cpu className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      AI-Assisted Merchandising & Prompt Engineering
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Training youth to leverage generative AI models for instant catalog copywriting, SEO-optimized product tagging, and automated customer triage on messaging channels.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-3.5">
                  <Globe2 className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      AfCFTA Digital Trade & Cross-Border Readiness
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Preparing young merchants for cross-border e-commerce across Anglophone and Francophone West Africa, navigating customs documentation, currency conversions, and regional logistics corridors.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-3.5">
                  <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Zero-Trust Transaction Mechanics
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Teaching courier integration protocols, 6-digit release key doorstep handshakes, and dispute mediation evidence preservation to insulate against logistics fraud.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Cohort Model Blueprint Card */}
            <div className="lg:col-span-6">
              <div className="p-6 sm:p-8 rounded-2xl bg-[#0D1527] border border-slate-800 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <div className="text-xs font-mono text-emerald-400 font-semibold">
                      COHORT ARCHITECTURE
                    </div>
                    <div className="text-lg font-bold text-white">
                      6-Week Intensive Digital Apprenticeship
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-300 font-semibold">
                    Hybrid / Mobile-First
                  </span>
                </div>

                {/* Timeline Weeks */}
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded bg-slate-800 text-xs font-mono text-emerald-400 flex items-center justify-center font-bold shrink-0">
                      1
                    </span>
                    <div className="text-xs text-slate-300">
                      <strong className="text-white">Weeks 1–2:</strong> Digital Brand Setup, WhatsApp Business Catalog Architecture & Generative AI Tools.
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded bg-slate-800 text-xs font-mono text-emerald-400 flex items-center justify-center font-bold shrink-0">
                      2
                    </span>
                    <div className="text-xs text-slate-300">
                      <strong className="text-white">Weeks 3–4:</strong> Financial Literacy, Cash-Flow Separation & Digital Ledger Bookkeeping.
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded bg-slate-800 text-xs font-mono text-emerald-400 flex items-center justify-center font-bold shrink-0">
                      3
                    </span>
                    <div className="text-xs text-slate-300">
                      <strong className="text-white">Week 5:</strong> Live Escrow Sandboxes: Generating Dynamic Virtual Accounts & Doorstep Release Verification.
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded bg-slate-800 text-xs font-mono text-emerald-400 flex items-center justify-center font-bold shrink-0">
                      4
                    </span>
                    <div className="text-xs text-slate-300">
                      <strong className="text-white">Week 6:</strong> Capstone Trade Fair, Mentor Showcase & Subsidized Relyvora Escrow Account Activation.
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-300">
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
      <section id="impact" className="py-20 sm:py-28 border-b border-slate-800/80">
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
                className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 group"
              >
                <div>
                  <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-400">
                    {stat.trend}
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-white tracking-tight font-mono mt-1">
                    {stat.value}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-200">
                    {stat.label}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {stat.subtext}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* 3 Real Case Study Cards */}
          <div className="space-y-6 pt-4">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 text-center">
              Field Case Studies & Merchant Voices
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
              {stories.map((story, i) => (
                <div
                  key={i}
                  className="p-6 sm:p-7 rounded-2xl bg-[#0B1222] border border-slate-800 flex flex-col justify-between space-y-6 hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold">
                        {story.badge}
                      </span>
                      <Quote className="w-5 h-5 text-slate-700" />
                    </div>

                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed italic">
                      &ldquo;{story.quote}&rdquo;
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 flex items-end justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">
                        {story.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {story.business}
                      </div>
                      <div className="text-[11px] font-mono text-emerald-400 mt-0.5">
                        📍 {story.location}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] font-mono text-slate-500 uppercase">
                        Outcome
                      </div>
                      <div className="text-xs font-mono font-bold text-emerald-300">
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
      <section id="partnerships" className="py-20 sm:py-28 border-b border-slate-800/80 bg-[#070B14]">
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
            <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-emerald-400 font-semibold">
                  TRACK 01
                </div>
                <h3 className="text-lg font-bold text-white">
                  Co-Designed Capacity Workshops
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Partner with us to deploy specialized curriculum tracks tailored to specific geographic corridors, agricultural value chains, or handicraft clusters with local chambers of commerce.
              </p>
              <ul className="text-xs text-slate-400 space-y-2 pt-2 border-t border-slate-800">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Customized localization for local dialects & trade
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Cohort progress tracking & attendance verification
                </li>
              </ul>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
              <div className="w-10 h-10 rounded-xl bg-teal-950 border border-teal-500/30 flex items-center justify-center text-teal-400">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-teal-400 font-semibold">
                  TRACK 02
                </div>
                <h3 className="text-lg font-bold text-white">
                  Empirical Research & Data Partnerships
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Provide grant evaluators and academic researchers with anonymized, high-fidelity empirical data on social commerce fraud patterns, gender financial behavior, and interstate trade barriers.
              </p>
              <ul className="text-xs text-slate-400 space-y-2 pt-2 border-t border-slate-800">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Quarterly Gender Digital Inclusion Index reports
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Policy briefs for ministries of trade and digital economy
                </li>
              </ul>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
              <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-amber-400 font-semibold">
                  TRACK 03
                </div>
                <h3 className="text-lg font-bold text-white">
                  Ring-Fenced Grant Deployment
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Channel programmatic subsidies, zero-fee transaction vouchers, and micro-grant seed capital directly to verified female and youth cohort graduates with 100% auditable traceability.
              </p>
              <ul className="text-xs text-slate-400 space-y-2 pt-2 border-t border-slate-800">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Designated, ring-fenced institutional impact accounts
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
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
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-slate-900 via-[#0B1324] to-emerald-950/50 border border-emerald-500/40 shadow-2xl space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />

            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono font-semibold text-emerald-400">
                <Mail className="w-3.5 h-3.5" />
                <span>INSTITUTIONAL ENGAGEMENT</span>
              </div>

              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                Support Our Programmes & Co-Create Impact
              </h2>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
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
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                Grantmakers & DFIs
              </button>

              <button
                type="button"
                onClick={() => setPartnerType('corporate')}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all ${
                  partnerType === 'corporate'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                Corporate Sponsors & CSR
              </button>

              <button
                type="button"
                onClick={() => setPartnerType('mentor')}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all ${
                  partnerType === 'mentor'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                Mentors & Industry Operators
              </button>
            </div>

            {/* Interactive Engagement Form */}
            {formSubmitted ? (
              <div className="p-6 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-center space-y-3 animate-in fade-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-bold text-white">
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
                    <label className="text-[11px] font-mono text-slate-400 uppercase">
                      Contact Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Dr. Ngozi Adeleke"
                      className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-hidden focus:border-emerald-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-slate-400 uppercase">
                      Organization / Institution
                    </label>
                    <input
                      type="text"
                      required
                      value={formOrg}
                      onChange={(e) => setFormOrg(e.target.value)}
                      placeholder="e.g. Global Development Fund / MIT Challenge"
                      className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-hidden focus:border-emerald-400 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400 uppercase">
                    Official Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="name@organization.org"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-hidden focus:border-emerald-400 transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400 uppercase">
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
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-hidden focus:border-emerald-400 transition-colors resize-none"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                  <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-emerald-400" />
                    <span>Direct Desk:</span>
                    <a
                      href="mailto:foundation@relyvora.com"
                      className="text-emerald-400 font-mono hover:underline font-semibold"
                    >
                      foundation@relyvora.com
                    </a>
                  </div>

                  <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all"
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
          <footer className="pt-12 border-t border-slate-800 space-y-8 text-slate-400 text-xs">
            {/* Mandatory Statutory Governance Box */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-slate-300 text-xs leading-relaxed space-y-2">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-emerald-400 uppercase">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>Statutory Governance & Compliance Notice</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                Relyvora Foundation is a programmatic economic empowerment initiative operated by Relyvora Technologies Limited. All grant funding and programmatic partnerships are managed through dedicated, ring-fenced impact accounts with strict audit and reporting compliance.
              </p>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-900">
              <div className="flex items-center gap-3">
                <Image
                  alt="Relyvora Logo"
                  height={30}
                  width={110}
                  src="/relyvora-logo.png"
                  className="h-6 w-auto object-contain brightness-110"
                />
                <span className="text-[11px] text-slate-500 font-mono">
                  © {new Date().getFullYear()} Relyvora Foundation
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-6 text-[11px] font-mono text-slate-400">
                <Link href="/" className="hover:text-emerald-400 transition-colors">
                  Corporate Portal
                </Link>
                <a
                  href={
                    process.env.NODE_ENV === 'production'
                      ? 'https://ng.relyvora.com'
                      : '/vendor'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  <span>Nigeria App 🇳🇬</span>
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
