'use client';

import React from 'react';

interface FallbackViewProps {
  scrollProgress: number; // 0 to 1
}

export function FallbackView({ scrollProgress }: FallbackViewProps) {
  // Map progress to active section (1, 2, 3, or 4)
  const step = Math.min(Math.floor(scrollProgress * 4) + 1, 4);

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0 flex items-center justify-center overflow-hidden bg-[#0A0A0C]">
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(228,228,231,0.08),transparent_60%)]" />

      {/* SVG Central Display */}
      <div className="relative w-[320px] h-[320px] sm:w-[460px] sm:h-[460px] transition-all duration-700 ease-out flex items-center justify-center">
        {step === 1 && (
          <div className="relative w-full h-full flex items-center justify-center animate-pulse">
            <svg
              viewBox="0 0 200 200"
              className="w-4/5 h-4/5 stroke-[#E4E4E7] fill-none"
              style={{ filter: 'drop-shadow(0 0 25px rgba(228, 228, 231, 0.35))' }}
            >
              <defs>
                <linearGradient id="platGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="50%" stopColor="#E4E4E7" />
                  <stop offset="100%" stopColor="#71717A" />
                </linearGradient>
              </defs>
              {/* Loop 1 */}
              <circle
                cx="80"
                cy="100"
                r="45"
                stroke="url(#platGrad)"
                strokeWidth="12"
                strokeDasharray="220"
                strokeDashoffset="20"
                className="transition-transform duration-1000"
              />
              {/* Loop 2 (Interlocking) */}
              <circle
                cx="120"
                cy="100"
                r="45"
                stroke="url(#platGrad)"
                strokeWidth="12"
                strokeDasharray="220"
                strokeDashoffset="130"
              />
            </svg>
          </div>
        )}

        {step === 2 && (
          <div className="relative w-full h-full flex items-center justify-center">
            <svg
              viewBox="0 0 200 200"
              className="w-4/5 h-4/5 fill-none"
              style={{ filter: 'drop-shadow(0 0 30px rgba(16, 185, 129, 0.3))' }}
            >
              <defs>
                <linearGradient id="vaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="60%" stopColor="#E4E4E7" />
                  <stop offset="100%" stopColor="#3F3F46" />
                </linearGradient>
                <radialGradient id="emeraldCore">
                  <stop offset="0%" stopColor="#34D399" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Heavy Vault Body */}
              <rect
                x="50"
                y="50"
                width="100"
                height="100"
                rx="24"
                stroke="url(#vaultGrad)"
                strokeWidth="10"
              />
              {/* Vault Dial */}
              <circle cx="100" cy="100" r="28" stroke="#E4E4E7" strokeWidth="6" />
              {/* Core Emerald Glow */}
              <circle cx="100" cy="100" r="16" fill="url(#emeraldCore)" />
              <path
                d="M100 88 V96 M100 104 V112 M88 100 H96 M104 100 H112"
                stroke="#10B981"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {step === 3 && (
          <div className="relative w-full h-full flex items-center justify-center">
            <svg
              viewBox="0 0 200 200"
              className="w-4/5 h-4/5 fill-none"
              style={{ filter: 'drop-shadow(0 0 35px rgba(228, 228, 231, 0.4))' }}
            >
              <defs>
                <linearGradient id="boxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="70%" stopColor="#A1A1AA" />
                  <stop offset="100%" stopColor="#27272A" />
                </linearGradient>
              </defs>
              {/* Isometric Unfolding Container */}
              <polygon
                points="100,30 160,65 160,135 100,170 40,135 40,65"
                stroke="url(#boxGrad)"
                strokeWidth="7"
              />
              <line x1="100" y1="170" x2="100" y2="100" stroke="#71717A" strokeWidth="4" />
              <line x1="40" y1="65" x2="100" y2="100" stroke="#71717A" strokeWidth="4" />
              <line x1="160" y1="65" x2="100" y2="100" stroke="#71717A" strokeWidth="4" />
              {/* Inner Glowing Core */}
              <circle cx="100" cy="95" r="18" fill="#10B981" opacity="0.6" />
            </svg>
          </div>
        )}

        {step === 4 && (
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            {/* Upward Payout Light Streak */}
            <div className="absolute top-0 w-1.5 h-full bg-gradient-to-t from-emerald-500 via-white to-transparent opacity-90 animate-pulse" />
            <svg
              viewBox="0 0 200 200"
              className="w-4/5 h-4/5 fill-none relative z-10"
              style={{ filter: 'drop-shadow(0 0 30px rgba(16, 185, 129, 0.6))' }}
            >
              {/* Keypad Outline */}
              <rect
                x="45"
                y="60"
                width="110"
                height="80"
                rx="14"
                stroke="#E4E4E7"
                strokeWidth="4"
              />
              {/* Holographic Keypad Dots */}
              <circle cx="70" cy="85" r="5" fill="#10B981" />
              <circle cx="100" cy="85" r="5" fill="#10B981" />
              <circle cx="130" cy="85" r="5" fill="#10B981" />
              <circle cx="70" cy="115" r="5" fill="#10B981" />
              <circle cx="100" cy="115" r="5" fill="#10B981" />
              <circle cx="130" cy="115" r="5" fill="#10B981" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
