'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  createTransaction, 
  getTransactions 
} from '@/lib/supabase';
import { Transaction, VendorMetrics } from '@/lib/types';
import { calculatePricing, formatNaira, MINIMUM_PROTECTION_FEE } from '@/lib/pricing';
import { isLiveMode } from '@/lib/paymentsMode';
import { StatusBadge } from '@/components/StatusBadge';
import { 
  Store, 
  Sparkles, 
  ShieldCheck, 
  Link2, 
  Copy, 
  Check, 
  Share2, 
  Lock, 
  Wallet, 
  Package, 
  ArrowUpRight, 
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Info,
  Clock,
  Database,
  Star,
  Lightbulb
} from 'lucide-react';

export default function VendorDashboardPage() {
  const [vendorHandle, setVendorHandle] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPriceInput, setItemPriceInput] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerNotes, setBuyerNotes] = useState('');
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedTx, setGeneratedTx] = useState<Transaction | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const liveMode = isLiveMode();

  // Compute live fee preview
  const pricing = useMemo(() => {
    return calculatePricing(itemPriceInput);
  }, [itemPriceInput]);

  // Load transactions from Supabase
  const loadTransactions = async () => {
    setIsLoading(true);
    const { data, isLocalFallback } = await getTransactions();
    setTransactions(data);
    setIsUsingFallback(Boolean(isLocalFallback));
    setIsLoading(false);
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  // Calculate dynamic metrics from transaction list
  const metrics: VendorMetrics = useMemo(() => {
    let lockedInEscrow = 0;
    let availablePayout = 0;
    let activeOrders = 0;
    let totalCompleted = 0;

    transactions.forEach((tx) => {
      const price = Number(tx.item_price) || 0;
      if (tx.status === 'FUNDS_LOCKED' || tx.status === 'DISPATCHED' || tx.status === 'DISPUTED') {
        lockedInEscrow += price;
        activeOrders += 1;
      } else if (tx.status === 'RELEASED') {
        availablePayout += price;
        totalCompleted += 1;
      } else if (tx.status === 'AWAITING_PAYMENT') {
        activeOrders += 1;
      }
    });

    return {
      lockedInEscrow,
      availablePayout,
      activeOrders,
      totalCompleted,
    };
  }, [transactions]);

  // Handle Generate Escrow Link
  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || pricing.itemPrice <= 0) return;

    setIsSubmitting(true);
    try {
      const activeVendorHandle = vendorHandle.trim() || '@LagosHairPlug';

      // 1. Try server-side route handler with service role (and Anchor Virtual NUBAN in live mode)
      try {
        const res = await fetch('/api/escrow/create-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemName: itemName.trim(),
            itemPrice: pricing.itemPrice,
            deliveryFee: pricing.deliveryFee,
            vendorHandle: activeVendorHandle,
            buyerPhone: buyerPhone.trim() || null,
            buyerNotes: buyerNotes.trim() || null,
          }),
        });

        const json = await res.json();
        if (json.success && json.transaction) {
          setGeneratedTx(json.transaction);
          await loadTransactions();
          return;
        } else if (json.error) {
          alert(`Link creation rejected: ${json.error}`);
          return;
        }
      } catch (serverErr) {
        console.warn('Network issue reaching /api/escrow/create-link, using fallback:', serverErr);
      }

      // 2. Client fallback for local caching / demo resilience
      const { data, error } = await createTransaction({
        item_name: itemName.trim(),
        item_price: pricing.itemPrice,
        protection_fee: pricing.protectionFee,
        total_amount: pricing.totalAmount,
        vendor_handle: activeVendorHandle,
        buyer_phone: buyerPhone.trim() || null,
        buyer_notes: buyerNotes.trim() || null,
        status: 'AWAITING_PAYMENT',
      });

      if (data) {
        setGeneratedTx(data);
        await loadTransactions();
      } else if (error) {
        alert(`Could not create link: ${error}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPayUrl = (id: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/pay/${id}`;
    }
    return `/pay/${id}`;
  };

  const copyToClipboard = (text: string, type: 'link' | 'whatsapp') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedWhatsApp(true);
      setTimeout(() => setCopiedWhatsApp(false), 2000);
    }
  };

  const generateWhatsAppMessage = (tx: Transaction) => {
    const link = getPayUrl(tx.id);
    return `Hello! Here is your secure Relyvora Escrow payment link for ${tx.item_name}:\n\n` +
      `Item: ${tx.item_name}\n` +
      `Agreed Price: ${formatNaira(Number(tx.item_price))}\n` +
      `3% Protection Fee: ${formatNaira(Number(tx.protection_fee))}\n` +
      `Total Payable: ${formatNaira(Number(tx.total_amount))}\n\n` +
      `Pay safely here: ${link}\n\n` +
      `Your money is safely locked in escrow until you inspect the delivery!`;
  };

  const displayHandle = vendorHandle.trim() || '@LagosHairPlug';
  const avatarInitials = displayHandle.replace('@', '').slice(0, 2).toUpperCase() || 'VN';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8 w-full">
      {/* Header & Vendor Profile Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-5 sm:p-6 rounded-3xl border border-border shadow-xs transition-colors">
        <div className="flex items-center gap-3.5">
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-accent text-[#071229] flex items-center justify-center font-bold text-xl shadow-md">
            {avatarInitials}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-heading font-semibold text-main tracking-tight">
                {displayHandle}
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
                <Sparkles className="w-3 h-3 text-accent" />
                <span>Simulated Verified Vendor</span>
                <Star className="w-3 h-3 text-accent fill-accent ml-0.5" />
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              {liveMode ? 'Social Commerce Escrow Dashboard • Live Anchor BaaS Settlement' : 'Social Commerce Escrow Dashboard • Real-time settlement simulation'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTransactions}
            disabled={isLoading}
            className="p-2 sm:px-3 sm:py-2 text-xs font-semibold text-main bg-site hover:bg-border/60 rounded-xl transition-all flex items-center gap-1.5 border border-border"
            title="Refresh database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
        </div>
      </div>

      {/* KYC / Regulated Settlement Activation Banner */}
      <div className="bg-navy-900 text-white p-5 sm:p-6 rounded-3xl border border-accent/30 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0 text-accent">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-heading font-semibold text-white tracking-tight">
                {liveMode ? 'Live Anchor BaaS Payout Rails Activated' : 'Activate Live Regulated Settlement'}
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-accent text-[#071229]">
                {liveMode ? 'PROV-LIVE' : 'ACTION REQUIRED'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              {liveMode
                ? 'Your account is connected to Anchor virtual NUBAN accounts for live collection and automated NIP settlement.'
                : 'To receive automated Nigerian Inter-Bank Settlement System (NIP) payouts to your commercial bank account, complete 2-minute KYC verification (BVN/NIN name enquiry).'}
            </p>
          </div>
        </div>

        <Link
          href="/vendor/onboarding"
          className="shrink-0 px-4 py-2.5 rounded-xl bg-accent hover:opacity-90 text-[#071229] font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-colors self-end md:self-auto"
        >
          <span>{liveMode ? 'View KYC Profile' : 'Complete Verification'}</span>
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Locked in Escrow */}
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xs relative overflow-hidden transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              Locked in Escrow
            </span>
            <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-heading font-bold text-main tracking-tight">
              {formatNaira(metrics.lockedInEscrow)}
            </div>
            <p className="text-xs text-muted mt-1 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent"></span>
              Secured across active shipments
            </p>
          </div>
        </div>

        {/* Available for Payout */}
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xs relative overflow-hidden transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              Available for Payout
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-heading font-bold text-accent tracking-tight">
              {formatNaira(metrics.availablePayout)}
            </div>
            <p className="text-xs text-muted mt-1">
              Released upon delivery release codes
            </p>
          </div>
        </div>

        {/* Active Orders */}
        <div className="bg-surface p-5 rounded-2xl border border-border shadow-xs relative overflow-hidden transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              Active Orders
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-heading font-bold text-main tracking-tight">
              {metrics.activeOrders}
            </div>
            <p className="text-xs text-muted mt-1">
              {metrics.totalCompleted} {metrics.totalCompleted === 1 ? 'order' : 'orders'} successfully released
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Generator & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Left Column: The Link Generator Form */}
        <div className="lg:col-span-7 bg-surface p-6 sm:p-7 rounded-3xl border border-border shadow-xs space-y-6 transition-colors">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-accent/10 text-accent mb-2">
              <Link2 className="w-3.5 h-3.5 text-accent" />
              <span>Instant Escrow Link Creator</span>
            </div>
            <h2 className="text-xl font-heading font-semibold text-main tracking-tight">
              Create Protected Order Link
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-1">
              Generate a high-trust payment link to paste in WhatsApp chats, Instagram DMs, or bios.
            </p>
          </div>

          <form onSubmit={handleGenerateLink} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-main uppercase tracking-wide mb-1.5">
                Your Brand / Store Handle:
              </label>
              <input
                type="text"
                value={vendorHandle}
                onChange={(e) => setVendorHandle(e.target.value)}
                placeholder="@LagosHairPlug or Store Name"
                className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-main uppercase tracking-wide mb-1.5">
                Item Name / Description: <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Bone Straight Human Hair 30 inches (Grade 12A)"
                className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-main uppercase tracking-wide mb-1.5">
                Agreed Item Price (₦): <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted font-bold text-sm">₦</span>
                <input
                  type="number"
                  min="500"
                  step="100"
                  required
                  value={itemPriceInput}
                  onChange={(e) => setItemPriceInput(e.target.value)}
                  placeholder="e.g. 45000"
                  className="w-full bg-site border border-border rounded-xl pl-8 pr-3.5 py-2.5 text-xs sm:text-sm font-semibold text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-main uppercase tracking-wide mb-1.5">
                  Buyer WhatsApp Phone:
                </label>
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="e.g. 08012345678"
                  className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-main uppercase tracking-wide mb-1.5">
                  Delivery Notes / Size:
                </label>
                <input
                  type="text"
                  value={buyerNotes}
                  onChange={(e) => setBuyerNotes(e.target.value)}
                  placeholder="e.g. Lekki Phase 1 delivery, Size 42"
                  className="w-full bg-site border border-border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            {/* Live Fee Breakdown */}
            <div className="bg-site border border-border rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Agreed Item Price:</span>
                <span className="font-semibold text-main">
                  {formatNaira(pricing.itemPrice)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1">
                  <span>Relyvora Escrow Protection Fee (3%):</span>
                  <span title={`Minimum fee is ${formatNaira(MINIMUM_PROTECTION_FEE)}`}>
                    <Info className="w-3.5 h-3.5 text-muted" />
                  </span>
                </span>
                <span className="font-semibold text-accent">
                  +{formatNaira(pricing.protectionFee)}
                </span>
              </div>
              <div className="pt-2 border-t border-border flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-main">Total Buyer Payable:</span>
                  <p className="text-[10px] text-muted">Locked safely until delivery inspection</p>
                </div>
                <span className="text-lg font-heading font-bold text-main">
                  {formatNaira(pricing.totalAmount)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || pricing.itemPrice <= 0}
              className="w-full py-4 px-5 rounded-2xl bg-accent hover:opacity-90 text-[#071229] font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-card transition-all transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-[#071229] border-t-transparent rounded-full animate-spin" />
                  <span>Generating Secure Link in Supabase...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5 text-[#071229]" />
                  <span>Generate Secure Escrow Link</span>
                </>
              )}
            </button>
          </form>

          {/* Generated Link Drawer Box */}
          {generatedTx && (
            <div className="bg-accent/10 border border-accent/30 rounded-2xl p-5 space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wide">
                  <Check className="w-4 h-4 text-accent" />
                  <span>Link Created Successfully!</span>
                </div>
                <StatusBadge status={generatedTx.status} size="sm" />
              </div>

              <div>
                <span className="text-xs text-muted font-medium block mb-1">
                  Shareable Buyer Checkout Link:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getPayUrl(generatedTx.id)}
                    className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-xs text-main select-all"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(getPayUrl(generatedTx.id), 'link')}
                    className="px-3 py-2 bg-accent hover:opacity-90 text-[#071229] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => copyToClipboard(generateWhatsAppMessage(generatedTx), 'whatsapp')}
                  className="w-full py-2.5 px-3 rounded-xl bg-accent/20 hover:bg-accent/30 text-accent text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-accent/30 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-accent" />
                  <span>{copiedWhatsApp ? 'Copied to Clipboard!' : 'Copy WhatsApp Message'}</span>
                </button>

                <Link
                  href={`/pay/${generatedTx.id}`}
                  target="_blank"
                  className="w-full py-2.5 px-3 rounded-xl bg-surface hover:bg-site border border-border text-main text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Open Buyer Checkout</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Why Nigerian Vendors Trust Relyvora */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-navy-950 text-white p-6 rounded-3xl space-y-4 shadow-sm relative overflow-hidden border border-border">
            <div className="relative z-10 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-full">
                Vendor Advantage
              </span>
              <h3 className="text-lg font-heading font-semibold text-white tracking-tight">
                Eliminate &quot;Payment on Delivery&quot; Headaches
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Nigerian buyers hesitate to pay before delivery, but delivery riders running away with cash or fake transfer alerts burn vendors.
              </p>
              <div className="pt-2 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong>Guaranteed Escrow Lock:</strong> Buyer must lock full funds before dispatch.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong>6-Digit Release Code:</strong> Rider collects the code at doorstep, instantly unlocking your payout.</span>
                </div>
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-accent/10 rounded-full blur-2xl" />
          </div>

          {/* Quick link to tracker demo */}
          <div className="bg-surface p-5 rounded-2xl border border-border text-xs text-muted space-y-2 transition-colors">
            <div className="flex items-center gap-1.5 font-bold text-main">
              <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Testing Tip</span>
            </div>
            <p>
              After generating a link, open it in another tab or device. Simulate the payment, receive the 6-digit release code, and test entering it in the Vendor view to watch the funds unlock!
            </p>
          </div>
        </div>
      </div>

      {/* Active Transactions Table */}
      <div className="bg-surface rounded-3xl border border-border shadow-xs overflow-hidden transition-colors">
        <div className="p-5 sm:p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-heading font-semibold text-main tracking-tight">
              Active Transactions ({transactions.length})
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Live orders synced directly with your Supabase database
            </p>
          </div>
          <button
            onClick={loadTransactions}
            className="text-xs font-semibold text-accent hover:opacity-80 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Table</span>
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-muted text-xs flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span>Fetching live escrow records from Supabase...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Package className="w-10 h-10 text-muted mx-auto" />
            <h4 className="text-sm font-heading font-semibold text-main">No transactions recorded yet</h4>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Use the form above to generate your first Relyvora escrow link and start testing!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-site text-muted border-b border-border font-semibold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4 sm:px-6">Item &amp; Vendor</th>
                  <th className="py-3 px-4">Amount Breakdown</th>
                  <th className="py-3 px-4">Escrow Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium text-main">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-site/60 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-semibold text-main">{tx.item_name}</div>
                      <div className="text-[11px] text-muted mt-0.5">{tx.vendor_handle}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-main">
                        {formatNaira(Number(tx.total_amount))}
                      </div>
                      <div className="text-[11px] text-muted">
                        Item: {formatNaira(Number(tx.item_price))} + Fee: {formatNaira(Number(tx.protection_fee))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={tx.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-muted whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleDateString('en-NG', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {tx.status === 'AWAITING_PAYMENT' ? (
                          <Link
                            href={`/pay/${tx.id}`}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors flex items-center gap-1"
                          >
                            <span>Pay</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        ) : (
                          <Link
                            href={`/order/${tx.id}`}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-surface text-main border border-border hover:bg-site transition-colors flex items-center gap-1"
                          >
                            <span>Track &amp; Release</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
