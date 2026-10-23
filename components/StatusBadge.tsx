import React from 'react';
import { TransactionStatus } from '@/lib/types';
import { 
  Clock, 
  Lock, 
  Truck, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';

interface StatusBadgeProps {
  status: TransactionStatus;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const configs: Record<TransactionStatus, {
    label: string;
    bg: string;
    text: string;
    border: string;
    icon: React.ReactNode;
  }> = {
    AWAITING_PAYMENT: {
      label: 'Awaiting Payment',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
    },
    FUNDS_LOCKED: {
      label: 'Funds Locked in Escrow',
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      border: 'border-emerald-300',
      icon: <Lock className="w-3.5 h-3.5 text-emerald-600" />,
    },
    DISPATCHED: {
      label: 'Dispatched / Rider En Route',
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      border: 'border-blue-200',
      icon: <Truck className="w-3.5 h-3.5 text-blue-600" />,
    },
    RELEASED: {
      label: 'Funds Released to Vendor',
      bg: 'bg-teal-50',
      text: 'text-teal-900',
      border: 'border-teal-300',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />,
    },
    DISPUTED: {
      label: 'Disputed — Escrow Frozen',
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-300',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />,
    },
  };

  const config = configs[status] || configs.AWAITING_PAYMENT;
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs sm:text-sm gap-1.5',
    lg: 'px-3 py-1.5 text-sm sm:text-base gap-2 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border shadow-xs transition-colors ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}`}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
}
