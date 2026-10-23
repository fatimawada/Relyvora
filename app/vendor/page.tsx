'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  createTransaction, 
  getTransactions 
} from '@/lib/supabase';
import { Transaction, VendorMetrics } from '@/lib/types';
import { calculatePricing, formatNaira, MINIMUM_PROTECTION_FEE } from '@/lib/pricing';
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
  Database
} from 'lucide-react';

export default function VendorDashboardPage() {
  const [vendorHandle, setVendorHandle] = useState('@LagosHairPlug');
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
      const { data, error } = await createTransaction({
        item_name: itemName.trim(),
        item_price: pricing.itemPrice,
        protection_fee: pricing.protectionFee,
        total_amount: pricing.totalAmount,
        vendor_handle: vendorHandle,
        buyer_phone: buyerPhone.trim() || null,
        buyer_notes: buyerNotes.trim() || null,
        status: 'AWAITING_PAYMENT',
      });

      if (data) {
        setGeneratedTx(data);
        // Refresh transactions list
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
      `📦 Item: ${tx.item_name}\n` +
      `💰 Agreed Price: ${formatNaira(Number(tx.item_price))}\n` +
      `🛡️ 3% Protection Fee: ${formatNaira(Number(tx.protection_fee))}\n` +
      `💳 Total Payable: ${formatNaira(Number(tx.total_amount))}\n\n` +
      `🔒 Pay safely here: ${link}\n\n` +
      `Your money is safely locked in escrow until you inspect the delivery!`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8 w-full">
      {/* Header & Vendor Profile Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-emerald-500/20">
            {vendorHandle.slice(1, 3).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {vendorHandle}
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                <span>Simulated Verified Vendor ⭐</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Social Commerce Escrow Dashboard • Real-time settlement simulation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTransactions}
            disabled={isLoading}
            className="p-2 sm:px-3 sm:py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1.5"
            title="Refresh database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
        </div>
      </div>

      {/* Supabase status notice if local fallback is active */}
      {isUsingFallback && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-amber-900">
            <strong>Supabase Setup Note:</strong> The app is connected to your Supabase project, but the <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">transactions</code> table needs to be created. Please run the SQL script in <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">supabase/schema.sql</code> inside your Supabase SQL editor. Transactions are safely stored locally in the meantime.
          </div>
        </div>
      )}

      {/* Dynamic Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Locked in Escrow */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Locked in Escrow (Simulated)
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {formatNaira(metrics.lockedInEscrow)}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Secured across active shipments
            </p>
          </div>
        </div>

        {/* Available for Payout */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Available for Payout
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight">
              {formatNaira(metrics.availablePayout)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Released upon delivery release codes
            </p>
          </div>
        </div>

        {/* Active Orders */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Active Orders
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {metrics.activeOrders}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {metrics.totalCompleted} orders successfully released
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Generator & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Left Column: The Link Generator Form */}
        <div className="lg:col-span-7 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 mb-2">
              <Link2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Instant Escrow Link Creator</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Create Protected Order Link
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Generate a high-trust payment link to paste in WhatsApp chats, Instagram DMs, or bios.
            </p>
          </div>

          <form onSubmit={handleGenerateLink} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Item Description / Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Bone Straight 30 Inch Wig + Closure"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Agreed Item Price (₦) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-slate-400 font-bold text-base">₦</span>
                <input
                  type="number"
                  required
                  min="500"
                  step="100"
                  placeholder="e.g. 75000"
                  value={itemPriceInput}
                  onChange={(e) => setItemPriceInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-semibold font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Buyer WhatsApp / Phone (Optional)
                </label>
                <input
                  type="text"
                  placeholder="080 1234 5678"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Vendor Handle
                </label>
                <input
                  type="text"
                  value={vendorHandle}
                  onChange={(e) => setVendorHandle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Live Fee Preview Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Vendor Item Price:</span>
                <span className="font-semibold text-slate-900 font-mono">
                  {formatNaira(pricing.itemPrice)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1">
                  <span>3% buyer protection fee (minimum ₦500):</span>
                  <span title="Calculated as Math.max(500, Math.round(itemPrice * 0.03))">
                    <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                  </span>
                </span>
                <span className="font-semibold text-emerald-700 font-mono">
                  +{formatNaira(pricing.protectionFee)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900">Total Buyer Payable:</span>
                  <p className="text-[10px] text-slate-400">Locked safely until delivery inspection</p>
                </div>
                <span className="text-lg font-black text-slate-900 font-mono">
                  {formatNaira(pricing.totalAmount)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || pricing.itemPrice <= 0}
              className="w-full py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating Secure Link in Supabase...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5 text-emerald-200" />
                  <span>Generate Secure Escrow Link</span>
                </>
              )}
            </button>
          </form>

          {/* Generated Link Drawer Box */}
          {generatedTx && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5 space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 uppercase tracking-wide">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Link Created Successfully!</span>
                </div>
                <StatusBadge status={generatedTx.status} size="sm" />
              </div>

              <div>
                <span className="text-xs text-slate-600 font-medium block mb-1">
                  Shareable Buyer Checkout Link:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getPayUrl(generatedTx.id)}
                    className="flex-1 bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(getPayUrl(generatedTx.id), 'link')}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
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
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-200" />
                  <span>{copiedWhatsApp ? 'Copied to Clipboard!' : 'Copy WhatsApp Message'}</span>
                </button>

                <Link
                  href={`/pay/${generatedTx.id}`}
                  target="_blank"
                  className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-emerald-300 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Open Buyer Checkout</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Why Nigerian Vendors Trust Relyvora */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 text-white p-6 rounded-3xl space-y-4 shadow-sm relative overflow-hidden">
            <div className="relative z-10 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-full">
                Vendor Advantage
              </span>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Eliminate "Payment on Delivery" Headaches
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Nigerian buyers hesitate to pay before delivery, but delivery riders running away with cash or fake transfer alerts burn vendors.
              </p>
              <div className="pt-2 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>100% Guaranteed Commitment:</strong> Buyer must lock full funds before dispatch.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>6-Digit Release Code:</strong> Rider collects the code at doorstep, instantly unlocking your payout.</span>
                </div>
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
          </div>

          {/* Quick link to tracker demo */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-2">
            <span className="font-bold text-slate-900 block">💡 Testing Tip</span>
            <p>
              After generating a link, open it in another tab or device. Simulate the payment, receive the 6-digit release code, and test entering it in the Vendor view to watch the funds unlock!
            </p>
          </div>
        </div>
      </div>

      {/* Active Transactions Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Active Transactions ({transactions.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live orders synced directly with your Supabase database
            </p>
          </div>
          <button
            onClick={loadTransactions}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Table</span>
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <span>Fetching live escrow records from Supabase...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Package className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">No transactions recorded yet</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Use the form above to generate your first Relyvora escrow link and start testing!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4 sm:px-6">Item & Vendor</th>
                  <th className="py-3 px-4">Amount Breakdown</th>
                  <th className="py-3 px-4">Escrow Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-bold text-slate-900">{tx.item_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{tx.vendor_handle}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 font-mono">
                        {formatNaira(Number(tx.total_amount))}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Item: {formatNaira(Number(tx.item_price))} + Fee: {formatNaira(Number(tx.protection_fee))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={tx.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
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
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                          >
                            <span>Pay</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        ) : (
                          <Link
                            href={`/order/${tx.id}`}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors flex items-center gap-1"
                          >
                            <span>Track & Release</span>
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
