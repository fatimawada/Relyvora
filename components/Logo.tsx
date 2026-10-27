import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  withLink?: boolean;
}

export function Logo({ className = '', size = 'md', withLink = true }: LogoProps) {
  const dimensions = {
    sm: { height: 28, width: 112, className: 'h-7' },
    md: { height: 34, width: 136, className: 'h-[34px]' },
    lg: { height: 42, width: 168, className: 'h-[42px]' },
  };

  const current = dimensions[size];

  const content = (
    <div className={`inline-flex items-center select-none group ${className}`}>
      <Image
        alt="Relyvora Logo"
        height={current.height}
        width={current.width}
        src="/relyvora-logo.png"
        priority
        className={`${current.className} w-auto object-contain transition-transform group-hover:scale-[1.02]`}
      />
    </div>
  );

  if (withLink) {
    return (
      <Link href="/" className="inline-block focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg">
        {content}
      </Link>
    );
  }

  return content;
}
