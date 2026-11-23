import React from 'react';
import { TransactionStatus } from '@/lib/types';
import {
  Clock,
  Lock,
  Truck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
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
      icon: <Clock className="w-3.5 h-3.5 text-amber-700" />,
    },
    PARTIALLY_FUNDED: {
      label: 'Part Payment Received',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      icon: <Clock className="w-3.5 h-3.5 text-amber-700" />,
    },
    FUNDS_LOCKED: {
      label: 'Paid into Escrow',
      bg: 'bg-accent/10',
      text: 'text-accent',
      border: 'border-accent/20',
      icon: <Lock className="w-3.5 h-3.5 text-accent" />,
    },
    DISPATCHED: {
      label: 'Dispatched',
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      border: 'border-blue-200',
      icon: <Truck className="w-3.5 h-3.5 text-blue-700" />,
    },
    RELEASING: {
      label: 'Payout in Progress',
      bg: 'bg-indigo-50',
      text: 'text-indigo-800',
      border: 'border-indigo-200',
      icon: <Clock className="w-3.5 h-3.5 text-indigo-700" />,
    },
    VENDOR_PAID: {
      label: 'Vendor Paid',
      bg: 'bg-accent/10',
      text: 'text-accent',
      border: 'border-accent/20',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-accent" />,
    },
    RELEASED: {
      label: 'Completed & Released',
      bg: 'bg-accent/10',
      text: 'text-accent',
      border: 'border-accent/20',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-accent" />,
    },
    DISPUTED: {
      label: 'Disputed: Held',
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-200',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />,
    },
    RESOLVING: {
      label: 'Dispute Settlement Running',
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-200',
      icon: <Clock className="w-3.5 h-3.5 text-rose-700" />,
    },
    REFUNDED: {
      label: 'Refunded to Buyer',
      bg: 'bg-site',
      text: 'text-muted',
      border: 'border-border',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-muted" />,
    },
    EXPIRED: {
      label: 'Payment Link Expired',
      bg: 'bg-site',
      text: 'text-muted',
      border: 'border-border',
      icon: <Clock className="w-3.5 h-3.5 text-muted" />,
    },
    CANCELLED: {
      label: 'Order Cancelled',
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-200',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-700" />,
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
      className={`inline-flex items-center font-medium rounded-full border shadow-xs ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}`}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
}
