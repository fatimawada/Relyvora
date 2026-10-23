'use client';

import React, { useState } from 'react';
import { 
  X, 
  CreditCard, 
  Building2, 
  PhoneCall, 
  ShieldCheck, 
  Lock, 
  CheckCircle,
  Copy,
  Check
} from 'lucide-react';
import { formatNaira } from '@/lib/pricing';

interface SimulatedPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmPayment: (method: string) => Promise<void>;
  totalAmount: number;
  itemName: string;
}

export function SimulatedPaymentModal({
  isOpen,
  onClose,
  onConfirmPayment,
  totalAmount,
  itemName,
}: SimulatedPaymentModalProps) {
  const [activeTab, setActiveTab] = useState<'card' | 'transfer' | 'ussd'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Card form mock state
  const [cardNumber, setCardNumber] = useState('5399 4100 1234 5678');
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('888');

  if (!isOpen) return null;

  const handleCopyAccount = () => {
    navigator.clipboard.writeText('0248819203');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePay = async () => {
    setIsProcessing(true);
    try {
      // Simulate network latency for realistic feel
      await new Promise(resolve => setTimeout(resolve, 1200));
      await onConfirmPayment(activeTab.toUpperCase());
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Simulated Escrow Gateway</span>
            </div>
            <h3 className="text-xl font-bold text-white tracking-tight">
              Pay {formatNaira(totalAmount)}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[280px]">
              Item: {itemName}
            </p>
          </div>
          <button 
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-400 hover:text-white p-1 rounded-full transition-colors relative z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Background subtle decoration */}
          <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl" />
        </div>

        {/* Tab selection */}
        <div className="grid grid-cols-3 bg-slate-100 p-1 border-b border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('card')}
            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'card'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Card</span>
          </button>
          <button
            onClick={() => setActiveTab('transfer')}
            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'transfer'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Bank Transfer</span>
          </button>
          <button
            onClick={() => setActiveTab('ussd')}
            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'ussd'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>USSD</span>
          </button>
        </div>

        {/* Tab content */}
        <div className="p-5 sm:p-6 space-y-4">
          {activeTab === 'card' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Card Number (Simulated)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="absolute right-3 top-3 text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                    TEST CARD
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Valid Thru
                  </label>
                  <input
                    type="text"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    CVV
                  </label>
                  <input
                    type="text"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transfer' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Bank Name</span>
                <span className="font-bold text-slate-900">Providus Bank (Demo)</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Beneficiary Name</span>
                <span className="font-bold text-slate-900">Relyvora Escrow / Trust</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase">Dedicated Virtual Account</span>
                  <span className="text-lg font-mono font-bold text-slate-900">0248819203</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyAccount}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 italic">
                Simulated transfers auto-confirm in this demo sandbox.
              </p>
            </div>
          )}

          {activeTab === 'ussd' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-center">
              <span className="text-xs font-medium text-slate-500">Dial on your phone:</span>
              <div className="text-xl font-mono font-black text-slate-900 tracking-wider">
                *737*000*45000#
              </div>
              <p className="text-[11px] text-slate-500">
                Supported for GTBank, Zenith, Access, and UBA simulation.
              </p>
            </div>
          )}

          {/* Sandbox assurance disclaimer */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-left">
            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 leading-tight">
              <strong>Demo Environment:</strong> Clicking the button below simulates instant payment settlement. Your funds will be marked as safely locked in escrow without real money movement.
            </p>
          </div>

          {/* Action button */}
          <button
            type="button"
            onClick={handlePay}
            disabled={isProcessing}
            className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all transform active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Simulating Payment Settlement...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-emerald-200" />
                <span>Confirm Simulated Payment ({formatNaira(totalAmount)})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
