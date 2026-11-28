import React from 'react';
import Link from 'next/link';

export interface LogoProps {
  className?: string;
  variant?: 'full' | 'symbol' | 'wordmark';
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

  // Full horizontal logo with tightened wordmark spacing
  if (variant === 'full') {
    // Aspect ratio: 498.41 / 140.15 ≈ 3.55626
    const width = Math.round(effectiveHeight * (498.41 / 140.15));

    const svg = (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="18 2 498.41 140.15"
        width={width}
        height={effectiveHeight}
        className={`inline-block ${className}`}
        role="img"
        aria-label="Relyvora"
      >
        <title>Relyvora</title>
        {/* Primary Color Elements (Three blocks + Tightened wordmark letters) */}
        <g id="primary" fill="var(--logo-1)" fillRule="evenodd">
          {/* Symbol Block 1 */}
          <path d="M24 8L52 8L52 38L24 38Z" />
          {/* Symbol Block 2 */}
          <path d="M24 42L52 42L52 72L24 72Z" />
          {/* Symbol Block 3 */}
          <path d="M24 76L52 76L52 106L24 106Z" />
          {/* e */}
          <path d="M116 67.05L170.36 67.05A31.41 31.41 0 0 1 170.36 82.13L116 82.13Z" />
          <path d="M171.28 74.59A31.41 31.41 0 1 0 162.08 96.8L151.42 86.14A16.33 16.33 0 1 1 156.2 74.59Z" />
          {/* l */}
          <path d="M175.78 8L190.86 8L190.86 106L175.78 106Z" />
          {/* y */}
          <path d="M194.86 43.18L211.48 43.18L238.3 100.97L221.68 100.97Z" />
          <path d="M245.29 43.18L261.56 43.18L223.87 136.15L207.6 136.15Z" />
          {/* v */}
          <path d="M264.06 43.18L280.3 43.18L305.42 106L289.19 106Z" />
          <path d="M314.31 43.18L330.55 43.18L305.42 106L289.19 106Z" />
          {/* o */}
          <path d="M396.87 74.59A31.41 31.41 0 1 0 334.05 74.59A31.41 31.41 0 1 0 396.87 74.59ZM381.79 74.59A16.33 16.33 0 1 0 349.13 74.59A16.33 16.33 0 1 0 381.79 74.59Z" />
          {/* r */}
          <path d="M400.87 43.18L415.94 43.18L415.94 106L400.87 106Z" />
          <path d="M400.87 78.36A35.18 35.18 0 0 1 436.05 43.18L436.05 58.26A20.1 20.1 0 0 0 415.94 78.36Z" />
          <path d="M436.05 43.18L443.59 43.18L443.59 58.26L436.05 58.26Z" />
          {/* a */}
          <path d="M510.41 74.59A31.41 31.41 0 1 0 447.59 74.59A31.41 31.41 0 1 0 510.41 74.59ZM495.33 74.59A16.33 16.33 0 1 0 462.66 74.59A16.33 16.33 0 1 0 495.33 74.59Z" />
          <path d="M495.33 43.18L510.41 43.18L510.41 106L495.33 106Z" />
        </g>
        {/* Mid-Tone Green Color Element (Bowl) */}
        <g id="mid" fill="var(--logo-2)" fillRule="evenodd">
          <path d="M60 8L78 8C95 8 107 20 107 35C107 50 95 63 78 63L68 63C63 63 60 60 60 56L60 45L78 45C85 45 89 41 89 35C89 29 85 26 78 26L60 26Z" />
        </g>
        {/* Accent Color Element (Leg polygon — rendered on top of bowl to match new symbol) */}
        <g id="accent" fill="var(--logo-3)" fillRule="evenodd">
          <path d="M60 56L82 56L108 106L86 106Z" />
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

  // Wordmark-only variant
  if (variant === 'wordmark') {
    const wordmarkWidth = Math.round(effectiveHeight * (474.41 / 140.15));
    const wordmarkSvg = (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-6 2 474.41 140.15"
        width={wordmarkWidth}
        height={effectiveHeight}
        className={`inline-block ${className}`}
        role="img"
        aria-label="Relyvora"
      >
        <title>Relyvora</title>
        <g fill="var(--logo-1)" fillRule="evenodd">
          <path d="M0 28L12 28L12 106L0 106Z" />
          <path d="M0 28L28 28A22 22 0 0 1 28 72L0 72ZM0 40L28 40A10 10 0 0 1 28 60L0 60Z" />
          <path d="M29 66L43 66L62 106L48 106Z" />
          <path d="M68 67.05L122.36 67.05A31.41 31.41 0 0 1 122.36 82.13L68 82.13Z" />
          <path d="M123.28 74.59A31.41 31.41 0 1 0 114.08 96.8L103.42 86.14A16.33 16.33 0 1 1 108.2 74.59Z" />
          <path d="M127.78 8L142.86 8L142.86 106L127.78 106Z" />
          <path d="M146.86 43.18L163.48 43.18L190.3 100.97L173.68 100.97Z" />
          <path d="M197.29 43.18L213.56 43.18L175.87 136.15L159.6 136.15Z" />
          <path d="M216.06 43.18L232.3 43.18L257.42 106L241.19 106Z" />
          <path d="M266.31 43.18L282.55 43.18L257.42 106L241.19 106Z" />
          <path d="M348.87 74.59A31.41 31.41 0 1 0 286.05 74.59A31.41 31.41 0 1 0 348.87 74.59ZM333.79 74.59A16.33 16.33 0 1 0 301.13 74.59A16.33 16.33 0 1 0 333.79 74.59Z" />
          <path d="M352.87 43.18L367.94 43.18L367.94 106L352.87 106Z" />
          <path d="M352.87 78.36A35.18 35.18 0 0 1 388.05 43.18L388.05 58.26A20.1 20.1 0 0 0 367.94 78.36Z" />
          <path d="M388.05 43.18L395.59 43.18L395.59 58.26L388.05 58.26Z" />
          <path d="M462.41 74.59A31.41 31.41 0 1 0 399.59 74.59A31.41 31.41 0 1 0 462.41 74.59ZM447.33 74.59A16.33 16.33 0 1 0 414.66 74.59A16.33 16.33 0 1 0 447.33 74.59Z" />
          <path d="M447.33 43.18L462.41 43.18L462.41 106L447.33 106Z" />
        </g>
      </svg>
    );

    if (withLink) {
      return (
        <Link href="/" className="inline-flex items-center shrink-0" aria-label="Relyvora home">
          {wordmarkSvg}
        </Link>
      );
    }
    return wordmarkSvg;
  }

  // Symbol-only mark
  const symbolWidth = Math.round((effectiveHeight * 92) / 106);
  const symbolSvg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="20 4 92 106"
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
      <g fill="var(--logo-2)" fillRule="evenodd">
        <path d="M60 8L78 8C95 8 107 20 107 35C107 50 95 63 78 63L68 63C63 63 60 60 60 56L60 45L78 45C85 45 89 41 89 35C89 29 85 26 78 26L60 26Z" />
      </g>
      <g fill="var(--logo-3)" fillRule="evenodd">
        <path d="M60 56L82 56L108 106L86 106Z" />
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
