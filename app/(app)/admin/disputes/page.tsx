'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Scale,
  Clock,
  AlertOctagon,
  CheckCircle2,
  ArrowLeft,
  FileText,
  AlertTriangle,
  RefreshCw,
  Search,
  X,
  ShieldCheck,
  KeyRound,
  ExternalLink,
  Settings,
  Users,
  Landmark,
  BookOpen,
  Ban,
  RotateCcw,
  Phone,
} from 'lucide-react';
import { formatNaira } from '@/lib/pricing';
import { DISPUTE_SCENARIOS, DisputeScenario, calculateSlaCountdown } from '@/lib/disputeScenarios';
import { Transaction } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { ProductFooter } from '@/components/ProductFooter';
import { supabase } from '@/lib/supabase';

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

interface RiskFlagItem {
  id: string;
  transaction_id?: string | null;
  vendor_id?: string | null;
  flag_type: string;
  severity: string;
  score: number;
  status: string;
  details?: Record<string, any> | null;
  created_at: string;
}

interface AdminAuditItem {
  id: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata?: Record<string, any> | null;
  created_at: string;
}

interface IncidentSwitchesState {
  checkout_enabled: boolean;
  payouts_enabled: boolean;
  vendor_allowlist_mode: boolean;
}

type QueueTab =
  | 'openDisputes'
  | 'overdueDispatch'
  | 'reviewHolds'
  | 'stuckSettlements'
  | 'failedWhatsapp'
  | 'unmatchedDeposits'
  | 'riskFlags'
  | 'vendors'
  | 'settings'
  | 'ledger';

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<(Transaction & Record<string, any>)[]>([]);
  const [heldTransactions, setHeldTransactions] = useState<Transaction[]>([]);
  const [riskFlags, setRiskFlags] = useState<RiskFlagItem[]>([]);
  const [queues, setQueues] = useState<{
    openDisputes: any[];
    overdueDispatch: any[];
    reviewHolds: any[];
    stuckSettlements: any[];
    failedWhatsappDeliveries: any[];
    unmatchedOrExcessDeposits: any[];
    riskFlags: any[];
  }>({
    openDisputes: [],
    overdueDispatch: [],
    reviewHolds: [],
    stuckSettlements: [],
    failedWhatsappDeliveries: [],
    unmatchedOrExcessDeposits: [],
    riskFlags: [],
  });
  const [searchMatches, setSearchMatches] = useState<any[]>([]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any[]>([]);
  const [recentLedger, setRecentLedger] = useState<any[]>([]);
  const [recentAdminActions, setRecentAdminActions] = useState<AdminAuditItem[]>([]);
  const [incidentSwitches, setIncidentSwitches] = useState<IncidentSwitchesState>({
    checkout_enabled: true,
    payouts_enabled: true,
    vendor_allowlist_mode: false,
  });
  const [isTogglingSwitch, setIsTogglingSwitch] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<DisputeResolution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<QueueTab>('openDisputes');
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('active');
  const [searchQuery, setSearchQuery] = useState('');

  // Order Recovery / Admin Action state
  const [actionTxId, setActionTxId] = useState('');
  const [actionPhone, setActionPhone] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  // Settings editor
  const [editSettingKey, setEditSettingKey] = useState('');
  const [editSettingJson, setEditSettingJson] = useState('');
  const [editSettingReason, setEditSettingReason] = useState('');

  // Selected dispute for arbitration
  const [selectedTx, setSelectedTx] = useState<(Transaction & Record<string, any>) | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<DisputeScenario>(DISPUTE_SCENARIOS[0]);
  const [resolutionAction, setResolutionAction] = useState<string>('FULL_REFUND_BUYER');
  const [buyerRefundAmount, setBuyerRefundAmount] = useState<number>(0);
  const [vendorPayoutAmount, setVendorPayoutAmount] = useState<number>(0);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [arbitratorName, setArbitratorName] = useState('Senior Arbitrator');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [typedConfirmError, setTypedConfirmError] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clear Risk Hold modal state
  const [clearHoldTxId, setClearHoldTxId] = useState<string | null>(null);
  const [clearHoldBlocked, setClearHoldBlocked] = useState<boolean>(false);
  const [clearHoldReason, setClearHoldReason] = useState<string>('');
  const [clearHoldError, setClearHoldError] = useState<string | null>(null);
  const [isClearingHold, setIsClearingHold] = useState<boolean>(false);
  const clearDialogRef = useRef<HTMLDialogElement | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean>(false);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const getAdminHeaders = async (withJson = false): Promise<Record<string, string>> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const headers: Record<string, string> = {};
    if (withJson) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const loadData = async (qParam = searchQuery) => {
    setIsLoading(true);
    setAuthError(null);
    setAuthCode(null);
    try {
      const headers = await getAdminHeaders();
      const qs = qParam.trim() ? `?q=${encodeURIComponent(qParam.trim())}` : '';
      const res = await fetch(`/api/admin/disputes/list${qs}`, {
        credentials: 'include',
        headers,
      });
      const json = await res.json();
      if (res.status === 401 || res.status === 403) {
        setAuthCode(json.code || null);
        setMfaEnrolled(Boolean(json.mfaEnrolled));
        setAuthError(json.error || 'Administrator AAL2 session required. Please sign in and verify MFA.');
        return;
      }
      if (json.success) {
        setDisputes(json.disputes || []);
        setHeldTransactions(json.heldTransactions || []);
        setRiskFlags(json.riskFlags || []);
        if (json.queues) setQueues(json.queues);
        setSearchMatches(json.searchMatches || []);
        setVendorsList(json.vendors || []);
        setSystemSettings(json.systemSettings || []);
        setRecentLedger(json.recentLedger || []);
        setRecentAdminActions(json.recentAdminActions || []);
        if (json.incidentSwitches) setIncidentSwitches(json.incidentSwitches);
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

  useEffect(() => {
    const dialog = clearDialogRef.current;
    if (!dialog) return;
    if (clearHoldTxId && !dialog.open) {
      dialog.showModal?.();
    } else if (!clearHoldTxId && dialog.open) {
      dialog.close?.();
    }
  }, [clearHoldTxId]);

  const callAdminAction = async (payload: Record<string, unknown>) => {
    setActionBusy(true);
    try {
      const headers = await getAdminHeaders(true);
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.status === 401 || res.status === 403) {
        setAuthCode(json.code || null);
        setMfaEnrolled(Boolean(json.mfaEnrolled));
        setAuthError(json.error || 'Administrator AAL2 session required.');
        return null;
      }
      if (!json.success) {
        alert(json.error || 'Admin action failed.');
        return json;
      }
      return json;
    } catch (err: any) {
      alert(err?.message || 'Network error executing admin action.');
      return null;
    } finally {
      setActionBusy(false);
    }
  };

  const handleViewEvidenceSignedUrl = async (txId: string, fileId: string) => {
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(
        `/api/escrow/evidence/signed-url?transactionId=${encodeURIComponent(txId)}&fileId=${encodeURIComponent(fileId)}`,
        { credentials: 'include', headers }
      );
      const json = await res.json();
      if (json.success && json.signedUrl) {
        window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        alert(json.error || 'Could not sign evidence URL.');
      }
    } catch (err: any) {
      alert(err?.message || 'Network error generating signed URL.');
    }
  };

  const handleToggleSwitch = async (key: keyof IncidentSwitchesState, nextValue: boolean) => {
    setIsTogglingSwitch(key);
    try {
      const headers = await getAdminHeaders(true);
      const res = await fetch('/api/admin/incident-switch', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          settingKey: key,
          enabled: nextValue,
          reason: `Admin dashboard incident switch toggle (${key} -> ${nextValue})`,
        }),
      });
      const json = await res.json();
      if (res.status === 401 || res.status === 403) {
        setAuthCode(json.code || null);
        setMfaEnrolled(Boolean(json.mfaEnrolled));
        setAuthError(json.error || 'Administrator AAL2 session required.');
        return;
      }
      if (json.success) {
        setIncidentSwitches((prev) => ({ ...prev, [key]: nextValue }));
        setSuccessMessage(json.message);
        await loadData();
      } else {
        alert(json.error || 'Failed to update incident switch.');
      }
    } catch (err: any) {
      alert(`Network error toggling ${key}: ${err?.message}`);
    } finally {
      setIsTogglingSwitch(null);
    }
  };

  const handleClearRiskHoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clearHoldTxId) return;
    if (clearHoldReason.trim().length < 3) {
      setClearHoldError('Please provide a clear reason (at least 3 characters) to clear the hold.');
      return;
    }

    setIsClearingHold(true);
    setClearHoldError(null);
    try {
      const headers = await getAdminHeaders(true);
      const res = await fetch('/api/admin/risk-flags/clear', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          transactionId: clearHoldTxId,
          reason: clearHoldReason.trim(),
          unblock: clearHoldBlocked,
        }),
      });
      const json = await res.json();
      if (res.status === 401 || res.status === 403) {
        setAuthCode(json.code || null);
        setMfaEnrolled(Boolean(json.mfaEnrolled));
        setAuthError(json.error || 'Administrator AAL2 session required.');
        setClearHoldTxId(null);
        return;
      }
      if (json.success) {
        setSuccessMessage(json.message || 'Risk review hold cleared.');
        setClearHoldTxId(null);
        setClearHoldReason('');
        setClearHoldBlocked(false);
        await loadData();
      } else {
        setClearHoldError(json.error || 'Failed to clear risk hold.');
      }
    } catch (err: any) {
      setClearHoldError(err?.message || 'Network error clearing hold.');
    } finally {
      setIsClearingHold(false);
    }
  };

  const handleSelectDispute = (tx: Transaction & Record<string, any>) => {
    setSelectedTx(tx);
    const total = Number(tx.total_amount) || 0;
    const initialScenario =
      DISPUTE_SCENARIOS.find((s) => s.id === Number(tx.dispute_scenario)) || DISPUTE_SCENARIOS[0];
    setSelectedScenario(initialScenario);
    setResolutionAction('FULL_REFUND_BUYER');
    setBuyerRefundAmount(total);
    setVendorPayoutAmount(0);
    setResolutionNotes(`Verified evidence for ${tx.item_name}. Binding arbitration decision.`);
    setTypedConfirmation('');
    setTypedConfirmError(null);
    setIsConfirmed(false);
  };

  const handleScenarioChange = (scenario: DisputeScenario) => {
    setSelectedScenario(scenario);
    if (!selectedTx) return;

    const total = Number(selectedTx.total_amount) || 0;
    const fee = Number(selectedTx.protection_fee) || 500;
    const itemPrice = Number(selectedTx.item_price) || total - fee;
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

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTx) return;

    if ((resolutionAction === 'FULL_REFUND_BUYER' || resolutionAction === 'FULL_PAYOUT_VENDOR') && !isConfirmed) {
      alert(`Executing ${resolutionAction} is irreversible and requires checking the authorization box.`);
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage(null);
    setTypedConfirmError(null);
    try {
      const headers = await getAdminHeaders(true);
      const res = await fetch('/api/admin/disputes/resolve', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          transactionId: selectedTx.id,
          scenarioId: selectedScenario.id,
          scenarioNumber: selectedScenario.id,
          resolutionAction,
          resolutionNotes,
          overrideReason: selectedScenario.id === 5 ? resolutionNotes || 'Partial acceptance split agreement' : undefined,
          overrideConfirmed: isConfirmed,
          overrideBuyerRefund: buyerRefundAmount,
          overrideVendorPayout: vendorPayoutAmount,
          confirmed: isConfirmed,
          typedConfirmation: typedConfirmation.trim(),
        }),
      });

      const json = await res.json();
      if (res.status === 401 || res.status === 403) {
        setAuthCode(json.code || null);
        setMfaEnrolled(Boolean(json.mfaEnrolled));
        setAuthError(json.error || 'Administrator AAL2 session required.');
        setSelectedTx(null);
        return;
      }
      if (json.code === 'TYPED_CONFIRMATION_REQUIRED') {
        setTypedConfirmError(
          json.expectedPhrase
            ? `${json.error} (Enter exact phrase: ${json.expectedPhrase})`
            : json.error || 'Typed confirmation required.'
        );
        return;
      }
      if (json.success) {
        setSuccessMessage(json.message);
        setTypedConfirmation('');
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

  const activeDisputes = disputes.filter((d) => d.status === 'DISPUTED' || d.status === 'RESOLVING');
  const resolvedDisputes = disputes.filter((d) => d.status !== 'DISPUTED' && (d.resolved_at || d.status === 'RELEASED'));
  const totalValueAtRisk = activeDisputes.reduce((acc, d) => acc + (Number(d.total_amount) || 0), 0);

  const filteredDisputes = disputes.filter((tx) => {
    if (filter === 'active' && tx.status !== 'DISPUTED' && tx.status !== 'RESOLVING') return false;
    if (filter === 'resolved' && (tx.status === 'DISPUTED' || tx.status === 'RESOLVING')) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        tx.item_name?.toLowerCase().includes(q) ||
        tx.vendor_handle?.toLowerCase().includes(q) ||
        tx.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const queueTabButtons: Array<{ key: QueueTab; label: string; count?: number }> = [
    { key: 'openDisputes', label: '1. Disputes', count: queues.openDisputes.length || activeDisputes.length },
    { key: 'overdueDispatch', label: '2. Overdue Dispatch', count: queues.overdueDispatch.length },
    { key: 'reviewHolds', label: '3. Review Holds', count: queues.reviewHolds.length },
    { key: 'stuckSettlements', label: '4. Stuck Settlements', count: queues.stuckSettlements.length },
    { key: 'failedWhatsapp', label: '5. Failed WhatsApp', count: queues.failedWhatsappDeliveries.length },
    { key: 'unmatchedDeposits', label: '6. Unmatched / Excess', count: queues.unmatchedOrExcessDeposits.length },
    { key: 'riskFlags', label: '7. Risk Flags', count: queues.riskFlags.length },
    { key: 'vendors', label: 'Vendors & Strikes', count: vendorsList.length },
    { key: 'settings', label: 'System Settings', count: systemSettings.length },
    { key: 'ledger', label: 'Ledger & Audit' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 w-full font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-sans font-bold bg-rose-100 text-rose-800 border border-rose-200 uppercase">
              Admin Ops • AAL2 Enforced
            </span>
            <span className="text-xs text-slate-400">Unified Operations Console</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Scale className="w-7 h-7 text-rose-600" />
            <span>Relyvora Trust, Safety &amp; Operations Desk</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            7 Operational Queues, Signed-URL Evidence Viewer, Vendor Compliance Strikes, Order Recovery &amp; Financial Ledger.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/security"
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin MFA</span>
          </Link>
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/vendor"
            className="px-4 py-2 rounded-xl bg-surface hover:bg-site border border-border text-main text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Seller Dashboard</span>
          </Link>
        </div>
      </div>

      {authError && (
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-4">
          <div className="flex items-start gap-3">
            {authCode === 'MFA_NOT_ENROLLED' || authCode === 'MFA_AAL2_REQUIRED' ? (
              <KeyRound className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <AlertOctagon className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 flex-1">
              <h2 className="text-base font-bold">
                {authCode === 'MFA_NOT_ENROLLED'
                  ? 'TOTP Multi-Factor Authentication Not Enrolled'
                  : authCode === 'MFA_AAL2_REQUIRED'
                    ? 'AAL2 MFA Verification Required'
                    : 'Administrator AAL2 Session Required'}
              </h2>
              <p className="text-xs sm:text-sm text-rose-800">{authError}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/security"
              className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {authCode === 'MFA_NOT_ENROLLED'
                  ? 'Enroll TOTP Authenticator'
                  : mfaEnrolled
                    ? 'Verify TOTP Code (AAL2)'
                    : 'Go to Admin Security & MFA'}
              </span>
            </Link>
          </div>
        </div>
      )}

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

      {!authError && (
        <>
          {/* Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Open Disputes</span>
              <div className="text-2xl font-black text-rose-600 font-heading tabular-nums">{activeDisputes.length}</div>
              <span className="text-[11px] text-slate-500">Funds frozen in custody</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Value at Risk</span>
              <div className="text-2xl font-black text-slate-900 font-heading tabular-nums">{formatNaira(totalValueAtRisk)}</div>
              <span className="text-[11px] text-slate-500">Pending binding split/refund</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Overdue / Stuck</span>
              <div className="text-2xl font-black text-amber-600 font-heading tabular-nums">
                {queues.overdueDispatch.length + queues.stuckSettlements.length}
              </div>
              <span className="text-[11px] text-slate-500">Dispatch or settlement retry needed</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Resolved Cases</span>
              <div className="text-2xl font-black text-emerald-600 font-heading tabular-nums">{resolutions.length}</div>
              <span className="text-[11px] text-slate-500">Immutable ledger signed</span>
            </div>
          </div>

          {/* Search Bar & Order Recovery Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Search className="w-4 h-4 text-slate-700" />
                <span>Global Order Search (Order ID, Buyer Phone Hash, Vendor)</span>
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loadData(searchQuery);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Enter order UUID, buyer phone (+234...), or @vendor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 text-white text-xs font-bold cursor-pointer"
                >
                  Search DB
                </button>
              </form>
              {searchMatches.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                  {searchMatches.map((m) => (
                    <div
                      key={m.id}
                      className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between gap-2"
                    >
                      <div className="truncate">
                        <span className="font-bold text-slate-900">{m.item_name}</span> • {m.vendor_handle} • {m.id.slice(0, 8)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setActionTxId(m.id)}
                        className="px-2 py-1 rounded bg-slate-200 text-slate-900 font-bold text-[10px] shrink-0 cursor-pointer"
                      >
                        Select for Action
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Order Recovery Quick Actions */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-slate-700" />
                <span>Order Recovery Actions (Audit Logged)</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Transaction UUID..."
                  value={actionTxId}
                  onChange={(e) => setActionTxId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900"
                />
                <input
                  type="text"
                  placeholder="New Phone (for change phone)"
                  value={actionPhone}
                  onChange={(e) => setActionPhone(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900"
                />
                <input
                  type="text"
                  placeholder="Mandatory reason..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={actionBusy || !actionTxId.trim()}
                  onClick={async () => {
                    const r = await callAdminAction({
                      action: 'reissue_code',
                      transactionId: actionTxId.trim(),
                      reason: actionReason.trim() || 'Admin recovery reissue',
                    });
                    if (r?.success) {
                      setSuccessMessage(`Release code reissued to ${r.maskedBuyerPhone}`);
                      await loadData();
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-accent hover:opacity-90 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                >
                  Reissue Release Code
                </button>
                <button
                  type="button"
                  disabled={actionBusy || !actionTxId.trim() || !actionPhone.trim()}
                  onClick={async () => {
                    const r = await callAdminAction({
                      action: 'change_buyer_phone',
                      transactionId: actionTxId.trim(),
                      newBuyerPhone: actionPhone.trim(),
                      reason: actionReason.trim() || 'Verified buyer phone update',
                    });
                    if (r?.success) {
                      setSuccessMessage(`Buyer phone updated (${r.newPhoneMasked}) and support@relyvora.com alerted.`);
                      await loadData();
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                >
                  Change Buyer Phone
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={async () => {
                    const r = await callAdminAction({
                      action: 'retry_transfer_leg',
                      transactionId: actionTxId.trim() || undefined,
                      reason: actionReason.trim() || 'Manual admin stuck leg retry',
                    });
                    if (r?.success) {
                      setSuccessMessage(`Stuck settlement retry ran: checked=${r.report?.checked ?? 0}, recovered=${r.report?.recovered ?? 0}`);
                      await loadData();
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                >
                  Retry Stuck Transfer Legs
                </button>
              </div>
            </div>
          </div>

          {/* Incident Kill Switches & Held Orders / Audit Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Incident Kill Switches</span>
                </h2>
                <span className="text-[10px] font-bold text-slate-400">Live Overrides</span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-900">Checkout Enabled</p>
                    <p className="text-[11px] text-slate-500">New buyer links &amp; payments</p>
                  </div>
                  <button
                    type="button"
                    disabled={isTogglingSwitch === 'checkout_enabled'}
                    onClick={() => handleToggleSwitch('checkout_enabled', !incidentSwitches.checkout_enabled)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                      incidentSwitches.checkout_enabled ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    {incidentSwitches.checkout_enabled ? 'ON • Pause' : 'OFF • Enable'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-900">Payouts Enabled</p>
                    <p className="text-[11px] text-slate-500">Vendor release &amp; NIP transfers</p>
                  </div>
                  <button
                    type="button"
                    disabled={isTogglingSwitch === 'payouts_enabled'}
                    onClick={() => handleToggleSwitch('payouts_enabled', !incidentSwitches.payouts_enabled)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                      incidentSwitches.payouts_enabled ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    {incidentSwitches.payouts_enabled ? 'ON • Freeze' : 'OFF • Resume'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-900">Vendor Allowlist Mode</p>
                    <p className="text-[11px] text-slate-500">Restrict onboarding to invite-only</p>
                  </div>
                  <button
                    type="button"
                    disabled={isTogglingSwitch === 'vendor_allowlist_mode'}
                    onClick={() => handleToggleSwitch('vendor_allowlist_mode', !incidentSwitches.vendor_allowlist_mode)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                      incidentSwitches.vendor_allowlist_mode ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {incidentSwitches.vendor_allowlist_mode ? 'INVITE-ONLY' : 'OPEN SIGNUP'}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Risk Holds ({heldTransactions.length})</span>
                </h2>
                <span className="text-[10px] font-bold text-slate-400">{riskFlags.length} flags</span>
              </div>
              {heldTransactions.length === 0 && riskFlags.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No active risk holds or open flags.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {heldTransactions.map((tx: any) => (
                    <div
                      key={tx.id}
                      className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">
                          {tx.item_name} ({tx.id.slice(0, 8)})
                        </p>
                        <p className="text-[11px] text-amber-900 truncate">
                          Score: {tx.risk_score ?? 0} • {tx.order_blocked ? 'BLOCKED' : 'REVIEW HOLD'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setClearHoldTxId(tx.id);
                          setClearHoldBlocked(Boolean(tx.order_blocked));
                          setClearHoldReason('');
                          setClearHoldError(null);
                        }}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg bg-accent hover:opacity-90 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Clear Hold
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-700" />
                  <span>Recent Admin Actions</span>
                </h2>
                <span className="text-[10px] font-bold text-slate-400">Audit Trail</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {recentAdminActions.slice(0, 12).map((act) => (
                  <div key={act.id} className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 truncate">{act.action}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {new Date(act.created_at).toLocaleTimeString('en-NG')}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 truncate">
                      {act.admin_email} → {act.target_type}:{String(act.target_id || '').slice(0, 12)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 7 Queues + Admin Operations Tab Switcher */}
          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-2xl">
            {queueTabButtons.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === t.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
                {t.count !== undefined ? ` (${t.count})` : ''}
              </button>
            ))}
          </div>

          {/* TAB CONTENT: 1. OPEN DISPUTES */}
          {activeTab === 'openDisputes' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start w-fit">
                <button
                  onClick={() => setFilter('active')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    filter === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Active Disputes ({activeDisputes.length})
                </button>
                <button
                  onClick={() => setFilter('resolved')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    filter === 'resolved' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Resolved Cases ({resolvedDisputes.length})
                </button>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    filter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  All History ({disputes.length})
                </button>
              </div>

              {filteredDisputes.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h3 className="text-base font-bold text-slate-900">Zero Pending Disputes</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    All transactions are healthy or fully resolved.
                  </p>
                </div>
              ) : (
                filteredDisputes.map((tx) => {
                  const isDisputed = tx.status === 'DISPUTED' || tx.status === 'RESOLVING';
                  const disputedAt = tx.disputed_at || tx.updated_at || tx.created_at;
                  const sla2h = calculateSlaCountdown(disputedAt, 2);
                  const sla6h = calculateSlaCountdown(disputedAt, 6);
                  const sla12h = calculateSlaCountdown(disputedAt, 12);
                  const evFiles: any[] = Array.isArray(tx.evidence_files) ? tx.evidence_files : [];

                  return (
                    <div
                      key={tx.id}
                      className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-heading tabular-nums text-slate-400">
                              REF: {tx.id.slice(0, 8)}...
                            </span>
                            <StatusBadge status={tx.status} size="sm" />
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              Refund Dest: {tx.refund_destination_verified ? `Verified (${tx.refund_destination_masked})` : 'Unverified'}
                            </span>
                          </div>
                          <h2 className="text-lg font-black text-slate-900 tracking-tight mt-1">{tx.item_name}</h2>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            <span className="font-semibold text-slate-700">Vendor: {tx.vendor_handle}</span>
                            <span>•</span>
                            <span>Opened By: {tx.dispute_raised_by || 'BUYER'}</span>
                          </div>
                        </div>

                        <div className="text-left sm:text-right">
                          <span className="text-2xl font-black text-slate-900 font-heading tabular-nums block">
                            {formatNaira(Number(tx.total_amount))}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Item: {formatNaira(Number(tx.item_price))} • Fee: {formatNaira(Number(tx.protection_fee))}
                          </span>
                        </div>
                      </div>

                      <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-rose-900 font-bold text-xs uppercase">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          <span>Dispute Claim</span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-800 font-medium">
                          &quot;{tx.dispute_reason || 'Dispute opened.'}&quot;
                        </p>
                        {tx.counterparty_response_text && (
                          <p className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-rose-200 mt-2">
                            {tx.counterparty_response_text}
                          </p>
                        )}
                      </div>

                      {/* Admin Signed-URL Evidence Viewer */}
                      {evFiles.length > 0 && (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                          <span className="text-[11px] font-bold uppercase text-slate-600 block">
                            Private Evidence &amp; Dispatch Proof Files ({evFiles.length})
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {evFiles.map((ef: any) => (
                              <div
                                key={ef.id}
                                className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200 text-xs"
                              >
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900 truncate">
                                    [{ef.uploaded_by_role}] {ef.original_filename || ef.evidence_category}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    {ef.evidence_category} • {ef.mime_type}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleViewEvidenceSignedUrl(tx.id, ef.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-accent hover:opacity-90 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  <span>Signed URL</span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {isDisputed && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="p-3 rounded-xl border bg-amber-50/70 border-amber-200 flex justify-between">
                            <span className="font-bold text-slate-700">2h Window</span>
                            <span className="font-heading tabular-nums font-bold text-amber-800">{sla2h.formattedRemaining}</span>
                          </div>
                          <div className="p-3 rounded-xl border bg-blue-50/70 border-blue-200 flex justify-between">
                            <span className="font-bold text-slate-700">6h Window</span>
                            <span className="font-heading tabular-nums font-bold text-blue-800">{sla6h.formattedRemaining}</span>
                          </div>
                          <div className="p-3 rounded-xl border bg-rose-50/70 border-rose-200 flex justify-between">
                            <span className="font-bold text-slate-700">12h Ultimatum</span>
                            <span className="font-heading tabular-nums font-bold text-rose-800">{sla12h.formattedRemaining}</span>
                          </div>
                        </div>
                      )}

                      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-xs text-slate-400">
                          {tx.resolved_at
                            ? `Resolved: Scenario ${tx.dispute_scenario || 'N/A'} (${tx.resolution_action})`
                            : 'Select scenario to execute binding settlement'}
                        </div>
                        {isDisputed && (
                          <button
                            type="button"
                            onClick={() => handleSelectDispute(tx)}
                            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
                          >
                            <Scale className="w-4 h-4" />
                            <span>Arbitrate &amp; Resolve</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2-7 QUEUES */}
          {activeTab === 'overdueDispatch' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
              <h2 className="text-base font-black text-slate-900">2. Overdue Dispatch Orders ({queues.overdueDispatch.length})</h2>
              {queues.overdueDispatch.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No overdue dispatch orders.</p>
              ) : (
                queues.overdueDispatch.map((tx: any) => (
                  <div key={tx.id} className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{tx.item_name} — {tx.vendor_handle}</p>
                      <p className="text-slate-600">Paid: {tx.paid_at || tx.created_at} • Deadline: {tx.dispatch_deadline_at || 'Expired'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectDispute(tx)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                    >
                      Open Arbitration
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'reviewHolds' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
              <h2 className="text-base font-black text-slate-900">3. Security Review Holds ({queues.reviewHolds.length})</h2>
              {queues.reviewHolds.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No orders currently held for security review.</p>
              ) : (
                queues.reviewHolds.map((tx: any) => (
                  <div key={tx.id} className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{tx.item_name} ({tx.id.slice(0, 8)})</p>
                      <p className="text-slate-600">{tx.order_block_reason || tx.review_hold_reason || 'Flagged'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setClearHoldTxId(tx.id);
                        setClearHoldBlocked(Boolean(tx.order_blocked));
                      }}
                      className="px-3 py-1.5 rounded-lg bg-accent hover:opacity-90 text-white font-bold cursor-pointer"
                    >
                      Clear Hold
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'stuckSettlements' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-slate-900">4. Stuck Settlement Legs ({queues.stuckSettlements.length})</h2>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={async () => {
                    const r = await callAdminAction({ action: 'retry_transfer_leg', reason: 'Admin queue retry' });
                    if (r?.success) {
                      setSuccessMessage(`Retried stuck settlements: recovered=${r.report?.recovered ?? 0}`);
                      await loadData();
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  Retry Stuck Legs Now
                </button>
              </div>
              {queues.stuckSettlements.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Zero stuck settlement legs.</p>
              ) : (
                queues.stuckSettlements.map((tx: any) => (
                  <div key={tx.id} className="p-3 rounded-xl border border-rose-200 bg-rose-50/50 text-xs flex justify-between">
                    <span className="font-bold">{tx.id} • {tx.status}</span>
                    <span>{formatNaira(Number(tx.total_amount))}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'failedWhatsapp' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
              <h2 className="text-base font-black text-slate-900">5. Failed / Blocked WhatsApp Deliveries ({queues.failedWhatsappDeliveries.length})</h2>
              {queues.failedWhatsappDeliveries.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No failed WhatsApp deliveries logged.</p>
              ) : (
                queues.failedWhatsappDeliveries.map((w: any, idx: number) => (
                  <div key={w.id || w.message_id || idx} className="p-3 rounded-xl border border-slate-200 text-xs flex justify-between">
                    <span>
                      <strong>{w.template_name}</strong> → {w.masked_number} ({w.error_code || w.status})
                    </span>
                    <span className="text-slate-500">{w.transaction_id?.slice(0, 8) || 'n/a'}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'unmatchedDeposits' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
              <h2 className="text-base font-black text-slate-900">6. Unmatched / Late / Excess Deposits ({queues.unmatchedOrExcessDeposits.length})</h2>
              {queues.unmatchedOrExcessDeposits.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Zero unmatched or excess deposits.</p>
              ) : (
                queues.unmatchedOrExcessDeposits.map((d: any) => (
                  <div key={d.id} className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 text-xs flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{d.status} • {formatNaira(Number(d.amount_naira || 0))}</p>
                      <p className="text-slate-600">Tx: {d.transaction_id || 'UNMATCHED'} • Sender: {d.sender_name || 'Unknown'}</p>
                    </div>
                    {d.transaction_id && (
                      <button
                        type="button"
                        onClick={async () => {
                          const typed = window.prompt(
                            `Enter typed confirmation phrase "CONFIRM REFUND ${String(d.transaction_id).slice(0, 8).toUpperCase()} ${Math.round(Number(d.amount_naira || 0))}"`
                          );
                          if (!typed) return;
                          const r = await callAdminAction({
                            action: 'refund_excess_or_partial',
                            transactionId: d.transaction_id,
                            amountNgn: Number(d.amount_naira || 0),
                            reasonTag: d.status === 'EXCESS' ? 'EXCESS_DEPOSIT_REFUND' : 'LATE_DEPOSIT_REFUND',
                            typedConfirmation: typed,
                            reason: `Verified admin refund for ${d.status} deposit`,
                          });
                          if (r?.success) {
                            setSuccessMessage(`Refund executed (${r.transferId}).`);
                            await loadData();
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-accent hover:opacity-90 text-white font-bold cursor-pointer"
                      >
                        Execute Verified Refund
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'riskFlags' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-3">
              <h2 className="text-base font-black text-slate-900">7. Automated Risk Flags ({queues.riskFlags.length})</h2>
              {queues.riskFlags.map((rf: any) => (
                <div key={rf.id} className="p-3 rounded-xl border border-slate-200 text-xs flex justify-between">
                  <span>
                    <strong>{rf.flag_type}</strong> ({rf.severity}) • {rf.status} • Tx: {rf.transaction_id?.slice(0, 8) || 'n/a'}
                  </span>
                  <span className="font-heading tabular-nums font-bold">+{rf.score}</span>
                </div>
              ))}
            </div>
          )}

          {/* TAB 8: VENDORS & STRIKES */}
          {activeTab === 'vendors' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-700" />
                <span>Vendors, Compliance Strikes &amp; Suspension Gate</span>
              </h2>
              <div className="space-y-2.5">
                {vendorsList.map((v: any) => (
                  <div key={v.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">
                        {v.store_name} ({v.tier}) • KYC: {v.kyc_status} • Strikes: {v.compliance_strikes ?? 0}
                      </p>
                      <p className="text-slate-500">
                        {v.is_suspended ? `SUSPENDED: ${v.suspension_reason || 'Compliance hold'}` : 'Active Account'} • Sales: {v.successful_sales_count ?? 0}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={async () => {
                          const reason = window.prompt(`Record compliance strike against ${v.store_name}:`, 'Policy breach / delayed dispatch');
                          if (!reason) return;
                          const r = await callAdminAction({ action: 'add_compliance_strike', vendorId: v.id, reason });
                          if (r?.success) {
                            setSuccessMessage(`Strike recorded (${r.complianceStrikes}/3).`);
                            await loadData();
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold cursor-pointer"
                      >
                        Record Strike
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={async () => {
                          const reason = window.prompt(
                            v.is_suspended ? `Restore ${v.store_name}:` : `Suspend ${v.store_name}:`,
                            v.is_suspended ? 'Compliance review cleared' : 'Risk & compliance suspension'
                          );
                          if (!reason) return;
                          const r = await callAdminAction({
                            action: v.is_suspended ? 'restore_vendor' : 'suspend_vendor',
                            vendorId: v.id,
                            reason,
                          });
                          if (r?.success) {
                            setSuccessMessage(`Vendor ${v.is_suspended ? 'restored' : 'suspended'}.`);
                            await loadData();
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-white font-bold inline-flex items-center gap-1 cursor-pointer ${
                          v.is_suspended ? 'bg-emerald-700' : 'bg-rose-700'
                        }`}
                      >
                        {v.is_suspended ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                        <span>{v.is_suspended ? 'Restore Vendor' : 'Suspend Vendor'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 9: SYSTEM SETTINGS EDITOR */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-700" />
                <span>Live system_settings Editor (Audit Logged)</span>
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  let parsedVal: unknown;
                  try {
                    parsedVal = JSON.parse(editSettingJson);
                  } catch {
                    alert('Setting value must be valid JSON (e.g. true, 2500000, or {...}).');
                    return;
                  }
                  const r = await callAdminAction({
                    action: 'update_system_setting',
                    key: editSettingKey.trim(),
                    value: parsedVal,
                    reason: editSettingReason.trim(),
                  });
                  if (r?.success) {
                    setSuccessMessage(`Updated system_settings.${editSettingKey}`);
                    await loadData();
                  }
                }}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Setting key..."
                    value={editSettingKey}
                    onChange={(e) => setEditSettingKey(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                  />
                  <input
                    type="text"
                    required
                    placeholder="JSON value..."
                    value={editSettingJson}
                    onChange={(e) => setEditSettingJson(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Audit reason..."
                    value={editSettingReason}
                    onChange={(e) => setEditSettingReason(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                  />
                </div>
                <button type="submit" disabled={actionBusy} className="px-4 py-2 rounded-lg bg-accent hover:opacity-90 text-white font-bold cursor-pointer">
                  Save Setting Update
                </button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {systemSettings.map((s: any) => (
                  <div
                    key={s.key}
                    onClick={() => {
                      setEditSettingKey(s.key);
                      setEditSettingJson(JSON.stringify(s.value));
                    }}
                    className="p-3 rounded-xl border border-slate-200 hover:border-slate-400 cursor-pointer space-y-1"
                  >
                    <p className="font-bold text-slate-900">{s.key}</p>
                    <p className="text-[11px] text-slate-600 break-all">{JSON.stringify(s.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 10: LEDGER & AUDIT VIEWER */}
          {activeTab === 'ledger' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-slate-700" />
                <span>Immutable Financial Ledger (Latest 50 Entries)</span>
              </h2>
              <div className="space-y-2 text-xs">
                {recentLedger.map((l: any) => (
                  <div key={l.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{l.entry_type}</span> • {l.from_account} → {l.to_account}
                      <p className="text-[10px] text-slate-500">Tx: {l.transaction_id} • Key: {l.idempotency_key}</p>
                    </div>
                    <span className="font-heading tabular-nums font-bold text-slate-900">
                      {formatNaira(Number(l.amount || 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolution Modal */}
          {selectedTx && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs overflow-y-auto">
              <div
                className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 my-8"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-surface text-main border-b border-border p-6 sticky top-0 z-10 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-sans font-bold text-rose-600 uppercase tracking-wider block">
                      Binding Arbitration Desk
                    </span>
                    <h3 className="text-lg font-black text-main">Resolve Dispute: {selectedTx.item_name}</h3>
                  </div>
                  <button onClick={() => setSelectedTx(null)} className="text-muted hover:text-main p-1 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleResolveSubmit} className="p-6 sm:p-7 space-y-6">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 font-medium block">Order Reference:</span>
                      <span className="font-bold text-slate-900 font-sans">{selectedTx.id}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block">Refund Destination:</span>
                      <span className="font-bold text-slate-900">
                        {selectedTx.refund_destination_verified
                          ? `Verified (${selectedTx.refund_destination_masked})`
                          : 'Unverified — Refund Blocked Until Confirmed'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block">Total Frozen:</span>
                      <span className="text-base font-black text-slate-900 font-heading tabular-nums">
                        {formatNaira(Number(selectedTx.total_amount))}
                      </span>
                    </div>
                  </div>

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
                              isSelected ? 'bg-rose-50/80 border-rose-500 shadow-xs' : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-sans font-bold text-slate-500 uppercase">Scenario {sc.id}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                {sc.slaHours}h SLA
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">{sc.name}</h4>
                            <span className="text-[11px] text-rose-600 font-medium block mt-1">{sc.badge}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">Scenario {selectedScenario.id} Policy Mandate:</span>
                      <span className="text-[11px] font-heading tabular-nums px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                        {selectedScenario.slaLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <strong>Resolution Policy:</strong> {selectedScenario.policyResolution}
                    </p>
                  </div>

                  <div className="space-y-4 pt-2 border-t border-slate-200">
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                      Step 2: Settlement Distribution (NGN):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Refund to Buyer (NGN):</label>
                        <input
                          type="number"
                          min={0}
                          value={buyerRefundAmount}
                          onChange={(e) => setBuyerRefundAmount(Number(e.target.value) || 0)}
                          className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm font-heading tabular-nums font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Payout to Vendor (NGN):</label>
                        <input
                          type="number"
                          min={0}
                          value={vendorPayoutAmount}
                          onChange={(e) => setVendorPayoutAmount(Number(e.target.value) || 0)}
                          className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm font-heading tabular-nums font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Arbitrator Identity:</label>
                      <input
                        type="text"
                        required
                        value={arbitratorName}
                        onChange={(e) => setArbitratorName(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                        Binding Resolution Notes:
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  {(() => {
                    const actionVerb =
                      resolutionAction === 'FULL_REFUND_BUYER'
                        ? 'REFUND'
                        : resolutionAction === 'FULL_PAYOUT_VENDOR'
                          ? 'RELEASE'
                          : 'SPLIT';
                    const feeVal = Number(selectedTx.protection_fee) || 0;
                    const netEscrowAmt = Math.max(0, (Number(selectedTx.total_amount) || 0) - feeVal);
                    const previewAmt =
                      selectedScenario.id === 5
                        ? Number(buyerRefundAmount || 0) + Number(vendorPayoutAmount || 0)
                        : netEscrowAmt;
                    const suggestedPhrase = `CONFIRM ${actionVerb} ${selectedTx.id.slice(0, 8).toUpperCase()} ${Math.round(previewAmt)}`;
                    return (
                      <div className="space-y-1.5 pt-1">
                        <label htmlFor="admin-typed-confirmation" className="block text-xs font-bold text-slate-700 uppercase">
                          Typed Confirmation Phrase:
                        </label>
                        <p className="text-[11px] text-slate-600">
                          Type <code className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-slate-900">{suggestedPhrase}</code>
                        </p>
                        <input
                          id="admin-typed-confirmation"
                          type="text"
                          required
                          placeholder={suggestedPhrase}
                          value={typedConfirmation}
                          onChange={(e) => {
                            setTypedConfirmation(e.target.value);
                            setTypedConfirmError(null);
                          }}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs font-heading text-slate-900"
                        />
                        {typedConfirmError && <p className="text-xs font-semibold text-rose-700">{typedConfirmError}</p>}
                      </div>
                    );
                  })()}

                  <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-2xl flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="confirm-arbitration"
                      checked={isConfirmed}
                      onChange={(e) => setIsConfirmed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 cursor-pointer"
                    />
                    <label htmlFor="confirm-arbitration" className="text-xs text-rose-950 font-medium cursor-pointer leading-relaxed">
                      <strong>Binding Arbitration Authorization:</strong> Authorize irreversible financial settlement under Scenario {selectedScenario.id}.
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                    <button type="button" onClick={() => setSelectedTx(null)} className="px-4 py-2.5 text-xs font-bold text-slate-600">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <Scale className="w-4 h-4" />
                      <span>{isSubmitting ? 'Settling...' : 'Commit Binding Arbitration Decision'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Clear Risk Hold Modal */}
          <dialog
            ref={clearDialogRef}
            aria-labelledby="clear-hold-dialog-title"
            onCancel={(e) => {
              e.preventDefault();
              setClearHoldTxId(null);
            }}
            className="m-auto rounded-3xl border border-slate-200 bg-white p-0 shadow-2xl max-w-md w-full"
          >
            <div className="bg-surface text-main border-b border-border p-5 flex items-center justify-between rounded-t-3xl">
              <h3 id="clear-hold-dialog-title" className="text-base font-black text-main">Clear Security Risk Hold</h3>
              <button type="button" onClick={() => setClearHoldTxId(null)} className="text-muted hover:text-main p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleClearRiskHoldSubmit} className="p-5 space-y-4">
              <textarea
                rows={3}
                required
                value={clearHoldReason}
                onChange={(e) => {
                  setClearHoldReason(e.target.value);
                  setClearHoldError(null);
                }}
                placeholder="Explain why the risk signal was cleared..."
                className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900"
              />
              {clearHoldBlocked && (
                <label className="flex items-center gap-2 text-xs font-semibold text-rose-800 cursor-pointer">
                  <input type="checkbox" checked={clearHoldBlocked} onChange={(e) => setClearHoldBlocked(e.target.checked)} />
                  <span>Also lift ORDER BLOCK status</span>
                </label>
              )}
              {clearHoldError && <p className="text-xs font-semibold text-rose-700">{clearHoldError}</p>}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setClearHoldTxId(null)} className="px-4 py-2 rounded-xl border text-xs font-bold">
                  Cancel
                </button>
                <button type="submit" disabled={isClearingHold} className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 text-white text-xs font-bold">
                  {isClearingHold ? 'Clearing...' : 'Confirm & Clear Hold'}
                </button>
              </div>
            </form>
          </dialog>
        </>
      )}

      <ProductFooter />
    </div>
  );
}
