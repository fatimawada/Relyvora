import React from 'react';
import { TransactionStatus } from '@/lib/types';
import { Check, ShieldCheck, Lock, Truck, KeyRound, AlertOctagon } from 'lucide-react';

interface EscrowStepperProps {
  status: TransactionStatus;
}

export function EscrowStepper({ status }: EscrowStepperProps) {
  const isDisputed = status === 'DISPUTED';

  // Step indices:
  // 1: Created / Awaiting Payment
  // 2: Funds Locked in Escrow
  // 3: Dispatched
  // 4: Released to Vendor
  let currentStep = 1;
  if (status === 'FUNDS_LOCKED') currentStep = 2;
  if (status === 'DISPATCHED') currentStep = 3;
  if (status === 'RELEASED') currentStep = 4;

  const steps = [
    {
      num: 1,
      title: 'Payment & Lock',
      desc: 'Buyer pays, money locked in escrow',
      icon: Lock,
    },
    {
      num: 2,
      title: 'Dispatched',
      desc: 'Vendor ships via dispatch rider',
      icon: Truck,
    },
    {
      num: 3,
      title: 'Inspection & Release',
      desc: 'Buyer inspects, vendor enters 6-digit code',
      icon: KeyRound,
    },
    {
      num: 4,
      title: 'Settled',
      desc: 'Funds released to vendor payout balance',
      icon: ShieldCheck,
    },
  ];

  if (isDisputed) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 shadow-sm text-slate-900">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 border border-rose-300">
            <AlertOctagon className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-rose-900">Escrow Frozen — Dispute Under Investigation</h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-200 text-rose-800">
                Action Paused
              </span>
            </div>
            <p className="text-xs sm:text-sm text-rose-700 mt-1">
              The buyer flagged an issue with this order. Funds are securely locked in Relyvora escrow.
              Delivery release codes and payouts are suspended until resolution is completed by Relyvora support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Escrow Protection Progress
        </h3>
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          {status === 'RELEASED' ? 'Transaction Complete' : 'Protected Escrow Active'}
        </span>
      </div>

      <div className="relative">
        {/* Progress Bar background */}
        <div className="hidden sm:block absolute top-5 left-6 right-6 h-1 bg-slate-100 -z-0">
          <div 
            className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
            style={{ 
              width: `${status === 'AWAITING_PAYMENT' ? 0 : status === 'FUNDS_LOCKED' ? 33 : status === 'DISPATCHED' ? 66 : 100}%` 
            }}
          />
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-2 relative z-10">
          {steps.map((step) => {
            const isCompleted = currentStep > step.num;
            const isCurrent = currentStep === step.num;
            const Icon = step.icon;

            return (
              <div key={step.num} className="flex sm:flex-col items-center sm:text-center gap-3 sm:gap-2">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm transition-all shadow-xs ${
                    isCompleted 
                      ? 'bg-emerald-600 text-white ring-4 ring-emerald-50' 
                      : isCurrent 
                        ? 'bg-emerald-500 text-white ring-4 ring-emerald-100 ring-offset-2' 
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>

                <div className="sm:mt-1">
                  <p className={`text-xs sm:text-sm font-bold ${isCurrent || isCompleted ? 'text-slate-900' : 'text-slate-400'}`}>
                    {step.title}
                  </p>
                  <p className="text-[11px] text-slate-500 hidden sm:block max-w-[140px] mx-auto mt-0.5 leading-snug">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
