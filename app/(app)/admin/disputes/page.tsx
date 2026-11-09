'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ShieldAlert, 
  Scale, 
  Clock, 
  AlertOctagon, 
  CheckCircle2, 
  ArrowLeft, 
  Store, 
  User, 
  FileText, 
  ChevronRight, 
  AlertTriangle,
  RefreshCw,
  Search,
  Check,
  X
} from 'lucide-react';
import { formatNaira } from '@/lib/pricing';
import { DISPUTE_SCENARIOS, DisputeScenario, calculateSlaCountdown } from '@/lib/disputeScenarios';
import { Transaction } from '@/lib/types';
import { Logo } from '@/components/Logo';
import { StatusBadge } from '@/components/StatusBadge';

interface DisputeResolution {
  id: string;
  transaction_id: string;
  scenario_number: number;
  scenario_name: string;
  resolution_action: string;
  buyer_refund_amount: number;
  vendor_payout_amount: number;
  relyvora_fee: number;
  resolved_by: string;
  resolution_notes?: string | null;
  created_at: string;
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Transaction[]>([]);
  const [resolutions, setResolutions] = useState<DisputeResolution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected dispute for arbitration
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<DisputeScenario>(DISPUTE_SCENARIOS[0]);
  const [resolutionAction, setResolutionAction] = useState<string>('FULL_REFUND_BUYER');
  const [buyerRefundAmount, setBuyerRefundAmount] = useState<number>(0);
  const [vendorPayoutAmount, setVendorPayoutAmount] = useState<number>(0);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [arbitratorName, setArbitratorName] = useState('Senior Arbitrator');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Live timer tick every second
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/disputes/list');
      const json = await res.json();
      if (json.success) {
        setDisputes(json.disputes || []);
        setResolutions(json.resolutions || []);
      }
    } catch (e) {
      console.error('Failed to load disputes:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When a dispute is selected, pre-fill resolution fields
  const handleSelectDispute = (tx: Transaction) => {
    setSelectedTx(tx);
    const total = Number(tx.total_amount) || 0;
    const fee = Number(tx.protection_fee) || 500;
    const itemPrice = Number(tx.item_price) || (total - fee);

    // Default to Scenario 1 (Quality Mismatch -> 100% Refund)
    setSelectedScenario(DISPUTE_SCENARIOS[0]);
    setResolutionAction('FULL_REFUND_BUYER');
    setBuyerRefundAmount(total);
    setVendorPayoutAmount(0);
    setResolutionNotes(`Verified evidence for ${tx.item_name}. Binding arbitration decision.`);
    setIsConfirmed(false);
  };

  // Change scenario and adjust amounts automatically
  const handleScenarioChange = (scenario: DisputeScenario) => {
    setSelectedScenario(scenario);
    if (!selectedTx) return;

    const total = Number(selectedTx.total_amount) || 0;
    const fee = Number(selectedTx.protection_fee) || 500;
    const itemPrice = Number(selectedTx.item_price) || (total - fee);
    const estimatedDelivery = Math.max(1500, Math.round(itemPrice * 0.1));

    switch (scenario.resolutionType) {
      case 'FULL_REFUND_BUYER':
        setResolutionAction('FULL_REFUND_BUYER');
        setBuyerRefundAmount(total);
        setVendorPayoutAmount(0);
        break;
      case 'FULL_PAYOUT_VENDOR':
        setResolutionAction('FULL_PAYOUT_VENDOR');
        setBuyerRefundAmount(0);
        setVendorPayoutAmount(itemPrice);
        break;
      case 'SPLIT_MINUS_DELIVERY':
        setResolutionAction('SPLIT_MINUS_DELIVERY');
        // Buyer gets purchase price minus delivery fee, vendor gets delivery fee
        setBuyerRefundAmount(Math.max(0, itemPrice - estimatedDelivery));
        setVendorPayoutAmount(estimatedDelivery);
        break;
      case 'CUSTOM_SPLIT':
        setResolutionAction('CUSTOM_SPLIT');
        setBuyerRefundAmount(Math.round(total / 2));
        setVendorPayoutAmount(Math.round(total / 2));
        break;
    }
  };

  // Submit binding arbitration decision
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTx) return;

    if ((resolutionAction === 'FULL_REFUND_BUYER' || resolutionAction === 'FULL_PAYOUT_VENDOR') && !isConfirmed) {
      alert(`Executing ${resolutionAction} is irreversible and requires checking the authorization box.`);
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/admin/disputes/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: selectedTx.id,
          scenarioNumber: selectedScenario.id,
          resolutionAction,
          buyerRefundAmount,
          vendorPayoutAmount,
          relyvoraFee: Number(selectedTx.protection_fee) || 500,
          resolutionNotes,
          resolvedBy: arbitratorName.trim() || 'Admin Arbitrator',
          adminEmail: 'support@relyvora.com',
          confirmed: isConfirmed,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccessMessage(json.message);
        setSelectedTx(null);
        await loadData();
      } else {
        alert(`Resolution failed: ${json.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Compute metrics
  const activeDisputes = disputes.filter(d => d.status === 'DISPUTED');
  const resolvedDisputes = disputes.filter(d => d.status !== 'DISPUTED' && (d.resolved_at || d.status === 'RELEASED'));
  const totalValueAtRisk = activeDisputes.reduce((acc, d) => acc + (Number(d.total_amount) || 0), 0);

  // Filtered list
  const filteredDisputes = disputes.filter(tx => {
    if (filter === 'active' && tx.status !== 'DISPUTED') return false;
    if (filter === 'resolved' && tx.status === 'DISPUTED') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = tx.item_name?.toLowerCase().includes(q);
      const matchVendor = tx.vendor_handle?.toLowerCase().includes(q);
      const matchId = tx.id.toLowerCase().includes(q);
      return matchName || matchVendor || matchId;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 w-full font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-200 uppercase">
              Admin Ops • Level 3 Access
            </span>
            <span className="text-xs text-slate-400">Strict Audit Protocol</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Scale className="w-7 h-7 text-rose-600" />
            <span>Dispute Mediation & Arbitration Console</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Enforcing the 8 Binding Arbitration Scenarios with Real-Time 2h / 6h / 12h SLA Countdowns.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/vendor"
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Vendor Portal</span>
          </Link>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Disputes</span>
          <div className="text-2xl font-black text-rose-600 font-mono">{activeDisputes.length}</div>
          <span className="text-[11px] text-slate-500">Funds frozen in custody</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Value at Risk</span>
          <div className="text-2xl font-black text-slate-900 font-mono">{formatNaira(totalValueAtRisk)}</div>
          <span className="text-[11px] text-slate-500">Pending binding split/refund</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">SLA Enforcement</span>
          <div className="text-2xl font-black text-amber-600 font-mono">3 Windows</div>
          <span className="text-[11px] text-slate-500">2h • 6h • 12h countdowns</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Resolved Cases</span>
          <div className="text-2xl font-black text-emerald-600 font-mono">{resolutions.length}</div>
          <span className="text-[11px] text-slate-500">Immutable ledger signed</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active Disputes ({activeDisputes.length})
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === 'resolved' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Resolved Cases ({resolvedDisputes.length})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All History ({disputes.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search vendor, item or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Disputes List */}
      <div className="space-y-4">
        {filteredDisputes.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h3 className="text-base font-bold text-slate-900">Zero Pending Disputes</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              All transactions are healthy or fully resolved. No active arbitrations require review.
            </p>
          </div>
        ) : (
          filteredDisputes.map((tx) => {
            const isDisputed = tx.status === 'DISPUTED';
            const disputedAt = tx.disputed_at || tx.updated_at || tx.created_at;

            // Compute SLA Countdowns for the 3 key policy windows
            const sla2h = calculateSlaCountdown(disputedAt, 2);
            const sla6h = calculateSlaCountdown(disputedAt, 6);
            const sla12h = calculateSlaCountdown(disputedAt, 12);

            return (
              <div
                key={tx.id}
                className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-shadow space-y-5"
              >
                {/* Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-400">REF: {tx.id.slice(0, 8)}...</span>
                      <StatusBadge status={tx.status} size="sm" />
                      {tx.code_locked && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          Lockout Triggered (5 Attempts)
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight mt-1">
                      {tx.item_name}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                      <span className="font-semibold text-slate-700">Vendor: {tx.vendor_handle}</span>
                      <span>•</span>
                      <span>Buyer Contact: {tx.buyer_phone || 'Unspecified'}</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-2xl font-black text-slate-900 font-mono block">
                      {formatNaira(Number(tx.total_amount))}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Item: {formatNaira(Number(tx.item_price))} • Fee: {formatNaira(Number(tx.protection_fee))}
                    </span>
                  </div>
                </div>

                {/* Dispute Reason Section */}
                <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-xs uppercase tracking-wide">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Buyer Dispute Claim</span>
                    <span className="text-[10px] text-rose-600 font-normal">
                      Logged {new Date(disputedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-800 font-medium">
                    "{tx.dispute_reason || 'Buyer withheld release code and reported non-conformity / defect.'}"
                  </p>
                </div>

                {/* The 3 Real-Time SLA Countdown Timers */}
                {isDisputed && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Policy SLA Countdown Timers
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* 2-Hour Timer (Scenarios 1 & 4) */}
                      <div className={`p-3.5 rounded-2xl border ${sla2h.isExpired ? 'bg-slate-50 border-slate-200' : 'bg-amber-50/80 border-amber-200'}`}>
                        <div className="flex items-center justify-between text-xs font-bold mb-1">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>2-Hour Window</span>
                          </span>
                          <span className={`font-mono text-xs ${sla2h.isExpired ? 'text-slate-400' : 'text-amber-800'}`}>
                            {sla2h.formattedRemaining}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Buyer doorstep evidence submission (Quality Mismatch / Damage).
                        </p>
                      </div>

                      {/* 6-Hour Timer (Scenarios 2 & 6) */}
                      <div className={`p-3.5 rounded-2xl border ${sla6h.isExpired ? 'bg-slate-50 border-slate-200' : 'bg-blue-50/80 border-blue-200'}`}>
                        <div className="flex items-center justify-between text-xs font-bold mb-1">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            <span>6-Hour Window</span>
                          </span>
                          <span className={`font-mono text-xs ${sla6h.isExpired ? 'text-slate-400' : 'text-blue-800'}`}>
                            {sla6h.formattedRemaining}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Vendor dispatch response & rider delivery verification window.
                        </p>
                      </div>

                      {/* 12-Hour Timer (Scenario 3 Ultimatum) */}
                      <div className={`p-3.5 rounded-2xl border ${sla12h.isExpired ? 'bg-slate-50 border-slate-200' : 'bg-rose-50/80 border-rose-200'}`}>
                        <div className="flex items-center justify-between text-xs font-bold mb-1">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                            <span>12-Hour Ultimatum</span>
                          </span>
                          <span className={`font-mono text-xs ${sla12h.isExpired ? 'text-slate-400' : 'text-rose-800'}`}>
                            {sla12h.formattedRemaining}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Hostage situation ultimatum: code override to vendor if buyer silent.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Resolution Action Footer */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-400">
                    {tx.resolved_at ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Resolved under Scenario {tx.dispute_scenario || 'N/A'}: {tx.resolution_action}</span>
                      </span>
                    ) : (
                      <span>Select a binding policy scenario below to enforce arbitration</span>
                    )}
                  </div>

                  {isDisputed && (
                    <button
                      type="button"
                      onClick={() => handleSelectDispute(tx)}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-600/20 cursor-pointer"
                    >
                      <Scale className="w-4 h-4" />
                      <span>Arbitrate & Resolve Across 8 Scenarios</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Resolution Modal / Drawer */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div 
            className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-6 sticky top-0 z-10 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono font-bold text-rose-400 uppercase tracking-wider block">
                  Binding Arbitration Desk
                </span>
                <h3 className="text-lg font-black text-white">
                  Resolve Dispute: {selectedTx.item_name}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedTx(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="p-6 sm:p-7 space-y-6">
              {/* Order Context Pill */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-medium block">Order Reference:</span>
                  <span className="font-bold text-slate-900 font-mono">{selectedTx.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Vendor:</span>
                  <span className="font-bold text-slate-900">{selectedTx.vendor_handle}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Total Frozen:</span>
                  <span className="text-base font-black text-slate-900 font-mono">
                    {formatNaira(Number(selectedTx.total_amount))}
                  </span>
                </div>
              </div>

              {/* Step 1: Select From the 8 Binding Scenarios */}
              <div className="space-y-3">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                  Step 1: Choose Binding Dispute Scenario (1 to 8):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {DISPUTE_SCENARIOS.map((sc) => {
                    const isSelected = selectedScenario.id === sc.id;
                    return (
                      <div
                        key={sc.id}
                        onClick={() => handleScenarioChange(sc)}
                        className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-rose-50/80 border-rose-500 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                            Scenario {sc.id}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {sc.slaHours}h SLA
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">
                          {sc.name}
                        </h4>
                        <span className="text-[11px] text-rose-600 font-medium block mt-1">
                          {sc.badge}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Policy Rule Details */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">
                    Scenario {selectedScenario.id} Policy Mandate:
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                    {selectedScenario.slaLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Resolution Policy:</strong> {selectedScenario.policyResolution}
                </p>
                <p className="text-[11px] text-slate-500">
                  <strong>Evidence Requirement:</strong> {selectedScenario.evidenceRequired}
                </p>
              </div>

              {/* Step 2: Financial Settlement Split Form */}
              <div className="space-y-4 pt-2 border-t border-slate-200">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                  Step 2: Settlement Distribution (NGN):
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Refund to Buyer (NGN):
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={buyerRefundAmount}
                      onChange={(e) => setBuyerRefundAmount(Number(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Payout to Vendor (NGN):
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={vendorPayoutAmount}
                      onChange={(e) => setVendorPayoutAmount(Number(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Arbitration Notes & Signing */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Arbitrator Identity / Signature:
                  </label>
                  <input
                    type="text"
                    required
                    value={arbitratorName}
                    onChange={(e) => setArbitratorName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Binding Resolution Notes & Evidence Review Summary:
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Binding Confirmation Checkbox */}
              <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-2xl flex items-start gap-3">
                <input
                  type="checkbox"
                  id="confirm-arbitration"
                  checked={isConfirmed}
                  onChange={(e) => setIsConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                />
                <label htmlFor="confirm-arbitration" className="text-xs text-rose-950 font-medium cursor-pointer leading-relaxed">
                  <strong>Binding Arbitration Authorization:</strong> I verify that all evidence for Scenario {selectedScenario.id} ({selectedScenario.name}) has been evaluated under the Relyvora Dispute SLA policy, and I authorize this irreversible financial settlement.
                </label>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-rose-600/30 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Scale className="w-4 h-4" />
                  )}
                  <span>Commit Binding Arbitration Decision</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
