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
  if (status === 'FUNDS_LOCKED' || status === 'PARTIALLY_FUNDED') currentStep = 2;
  if (status === 'DISPATCHED') currentStep = 3;
  if (status === 'RELEASING' || status === 'VENDOR_PAID' || status === 'RELEASED') currentStep = 4;

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
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 sm:p-5 shadow-xs text-main transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0 border border-rose-500/40 text-rose-600 dark:text-rose-400">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-heading font-semibold text-rose-700 dark:text-rose-400">Escrow Frozen: Dispute Under Investigation</h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                Action Paused
              </span>
            </div>
            <p className="text-xs sm:text-sm text-main/80 dark:text-muted mt-1 leading-relaxed">
              The buyer flagged an issue with this order. Funds are securely locked in Relyvora escrow.
              Delivery release codes and payouts are suspended until resolution is completed by Relyvora support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-surface rounded-card p-4 sm:p-6 border border-border shadow-xs transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs sm:text-sm font-heading font-bold uppercase tracking-wider text-muted">
          Escrow Protection Progress
        </h3>
        <span className="text-xs font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-full border border-accent/20">
          {status === 'RELEASED' ? 'Transaction Complete' : 'Protected Escrow Active'}
        </span>
      </div>

      <div className="relative">
        {/* Progress Bar background */}
        <div className="hidden sm:block absolute top-5 left-6 right-6 h-1 bg-border -z-0">
          <div 
            className="h-full bg-accent transition-all duration-500 rounded-full"
            style={{ 
              width: `${status === 'AWAITING_PAYMENT' ? 0 : (status === 'FUNDS_LOCKED' || status === 'PARTIALLY_FUNDED') ? 33 : status === 'DISPATCHED' ? 66 : 100}%` 
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
                      ? 'bg-accent text-[#071229] ring-4 ring-accent/20' 
                      : isCurrent 
                        ? 'bg-accent text-[#071229] ring-4 ring-accent/30 ring-offset-2' 
                        : 'bg-site text-muted border border-border'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>

                <div className="sm:mt-1">
                  <p className={`text-xs sm:text-sm font-semibold ${isCurrent || isCompleted ? 'text-main' : 'text-muted'}`}>
                    {step.title}
                  </p>
                  <p className="text-[11px] text-muted hidden sm:block max-w-[140px] mx-auto mt-0.5 leading-snug">
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
