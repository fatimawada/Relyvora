import React from 'react';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  withLink?: boolean;
}

export function Logo({ className = '', size = 'md', withLink = true }: LogoProps) {
  const iconSizes = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  const content = (
    <div className={`inline-flex items-center gap-2 select-none group ${className}`}>
      <div className="relative flex items-center justify-center p-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 shadow-sm transition-transform group-hover:scale-105">
        <ShieldCheck className={`${iconSizes[size]} text-emerald-600 stroke-[2.5]`} />
      </div>
      <div className="flex flex-col">
        <span className={`${textSizes[size]} font-bold tracking-tight text-slate-900 font-sans`}>
          Relyvora
        </span>
      </div>
    </div>
  );

  if (withLink) {
    return (
      <Link href="/" className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg">
        {content}
      </Link>
    );
  }

  return content;
}
