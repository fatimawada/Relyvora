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
      bg: 'bg-amber-500/10',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-500/20',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
    },
    PARTIALLY_FUNDED: {
      label: 'Partially Funded',
      bg: 'bg-amber-500/10',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-500/20',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
    },
    FUNDS_LOCKED: {
      label: 'Funds Locked in Escrow',
      bg: 'bg-accent/10',
      text: 'text-accent',
      border: 'border-accent/20',
      icon: <Lock className="w-3.5 h-3.5 text-accent" />,
    },
    DISPATCHED: {
      label: 'Dispatched / Rider En Route',
      bg: 'bg-blue-500/10',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-500/20',
      icon: <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />,
    },
    RELEASING: {
      label: 'Settlement in Progress',
      bg: 'bg-indigo-500/10',
      text: 'text-indigo-700 dark:text-indigo-300',
      border: 'border-indigo-500/20',
      icon: <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
    },
    VENDOR_PAID: {
      label: 'Vendor Paid',
      bg: 'bg-accent/10',
      text: 'text-accent',
      border: 'border-accent/20',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-accent" />,
    },
    RELEASED: {
      label: 'Funds Released to Vendor',
      bg: 'bg-accent/10',
      text: 'text-accent',
      border: 'border-accent/20',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-accent" />,
    },
    DISPUTED: {
      label: 'Disputed: Escrow Frozen',
      bg: 'bg-rose-500/10',
      text: 'text-rose-700 dark:text-rose-300',
      border: 'border-rose-500/20',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
    },
    REFUNDED: {
      label: 'Refunded to Buyer',
      bg: 'bg-site',
      text: 'text-muted',
      border: 'border-border',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-muted" />,
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
