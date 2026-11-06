import React from 'react';
import Link from 'next/link';

export interface LogoProps {
  className?: string;
  variant?: 'full' | 'symbol';
  height?: number;
  size?: 'sm' | 'md' | 'lg' | string;
  withLink?: boolean;
}

export function Logo({
  className = '',
  variant = 'full',
  height,
  size,
  withLink = true,
}: LogoProps) {
  let effectiveHeight = height || 36;
  if (size === 'sm') effectiveHeight = 28;
  else if (size === 'md') effectiveHeight = 34;
  else if (size === 'lg') effectiveHeight = 44;

  // Full horizontal logo with wordmark
  if (variant === 'full') {
    // Aspect ratio: 579.09 / 160.93 ≈ 3.598
    const width = Math.round(effectiveHeight * 3.598);

    const svg = (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="7.61 -8.39 579.09 160.93"
        width={width}
        height={effectiveHeight}
        className={`inline-block ${className}`}
        role="img"
        aria-label="Relyvora"
      >
        <title>Relyvora</title>
        {/* Primary Color Elements (Three blocks + Wordmark letters) */}
        <g id="primary" fill="var(--logo-1)" fillRule="evenodd">
          {/* Symbol Block 1 */}
          <path d="M24 8L52 8L52 38L24 38Z" />
          {/* Symbol Block 2 */}
          <path d="M24 42L52 42L52 72L24 72Z" />
          {/* Symbol Block 3 */}
          <path d="M24 76L52 76L52 106L24 106Z" />
          {/* e */}
          <path d="M180.82 74.59A31.41 31.41 0 1 0 171.62 96.8L160.96 86.14A16.33 16.33 0 1 1 165.74 74.59Z" />
          <path d="M125.54 67.05L179.9 67.05A31.41 31.41 0 0 1 179.9 82.13L125.54 82.13Z" />
          {/* l */}
          <path d="M193.38 8L208.46 8L208.46 106L193.38 106Z" />
          {/* y */}
          <path d="M273.2 43.18L289.47 43.18L251.78 136.15L235.51 136.15Z" />
          <path d="M222.77 43.18L239.39 43.18L266.21 100.97L249.59 100.97Z" />
          {/* v */}
          <path d="M303.37 43.18L319.61 43.18L344.73 106L328.5 106Z" />
          <path d="M353.62 43.18L369.86 43.18L344.73 106L328.5 106Z" />
          {/* o */}
          <path d="M443.41 74.59A31.41 31.41 0 1 0 380.59 74.59A31.41 31.41 0 1 0 443.41 74.59ZM428.33 74.59A16.33 16.33 0 1 0 395.67 74.59A16.33 16.33 0 1 0 428.33 74.59Z" />
          {/* r */}
          <path d="M454.72 43.18L469.79 43.18L469.79 106L454.72 106Z" />
          <path d="M454.72 78.36A35.18 35.18 0 0 1 489.9 43.18L489.9 58.26A20.1 20.1 0 0 0 469.79 78.36Z" />
          <path d="M489.9 43.18L497.44 43.18L497.44 58.26L489.9 58.26Z" />
          {/* a */}
          <path d="M570.31 74.59A31.41 31.41 0 1 0 507.49 74.59A31.41 31.41 0 1 0 570.31 74.59ZM555.23 74.59A16.33 16.33 0 1 0 522.56 74.59A16.33 16.33 0 1 0 555.23 74.59Z" />
          <path d="M555.23 43.18L570.31 43.18L570.31 106L555.23 106Z" />
        </g>
        {/* Accent Color Element (Leg polygon) */}
        <g id="accent" fill="var(--logo-3)" fillRule="evenodd">
          <path d="M58 56L80 56L106 106L84 106Z" />
        </g>
        {/* Mid-Tone Green Color Element (Bowl) */}
        <g id="mid" fill="var(--logo-2)" fillRule="evenodd">
          <path d="M58 8L76 8C93 8 105 20 105 35C105 50 93 63 76 63L66 63C61 63 58 60 58 56L58 45L76 45C83 45 87 41 87 35C87 29 83 26 76 26L58 26Z" />
        </g>
      </svg>
    );

    if (withLink) {
      return (
        <Link href="/" className="inline-flex items-center shrink-0" aria-label="Relyvora home">
          {svg}
        </Link>
      );
    }
    return svg;
  }

  // Symbol-only mark
  const symbolWidth = Math.round((effectiveHeight * 86) / 100);
  const symbolSvg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="20 4 90 106"
      width={symbolWidth}
      height={effectiveHeight}
      className={`inline-block ${className}`}
      role="img"
      aria-label="Relyvora mark"
    >
      <title>Relyvora mark</title>
      <g fill="var(--logo-1)" fillRule="evenodd">
        <path d="M24 8L52 8L52 38L24 38Z" />
        <path d="M24 42L52 42L52 72L24 72Z" />
        <path d="M24 76L52 76L52 106L24 106Z" />
      </g>
      <g fill="var(--logo-3)" fillRule="evenodd">
        <path d="M58 56L80 56L106 106L84 106Z" />
      </g>
      <g fill="var(--logo-2)" fillRule="evenodd">
        <path d="M58 8L76 8C93 8 105 20 105 35C105 50 93 63 76 63L66 63C61 63 58 60 58 56L58 45L76 45C83 45 87 41 87 35C87 29 83 26 76 26L58 26Z" />
      </g>
    </svg>
  );

  if (withLink) {
    return (
      <Link href="/" className="inline-flex items-center shrink-0" aria-label="Relyvora home">
        {symbolSvg}
      </Link>
    );
  }
  return symbolSvg;
}
