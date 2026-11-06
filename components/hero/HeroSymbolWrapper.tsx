'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Logo } from '@/components/brand/Logo';

// Dynamically load 3D Symbol after page is interactive
const DynamicHeroSymbol3D = dynamic(() => import('./HeroSymbol3D'), {
  ssr: false,
  loading: () => <StaticSymbolFallback />,
});

function StaticSymbolFallback({ animate = false }: { animate?: boolean }) {
  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <div className={`w-44 h-44 sm:w-56 sm:h-56 flex items-center justify-center transition-all ${animate ? 'animate-fadeIn' : ''}`}>
        <Logo variant="symbol" height={160} withLink={false} />
      </div>
    </div>
  );
}

export function HeroSymbolWrapper() {
  const [canUse3D, setCanUse3D] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      // 1. WebGL2 Check
      const canvas = document.createElement('canvas');
      const gl2 = canvas.getContext('webgl2');
      if (!gl2) {
        setCanUse3D(false);
        return;
      }

      // 2. Save-Data Network Check
      const nav = navigator as unknown as {
        connection?: {
          saveData?: boolean;
          effectiveType?: string;
        };
        deviceMemory?: number;
      };

      if (nav.connection?.saveData) {
        setCanUse3D(false);
        return;
      }

      // 3. Screen & Device Capability Check (Mobile / Low-End -> Fallback to CSS/SVG)
      const isMobile = window.innerWidth < 768;
      const cores = navigator.hardwareConcurrency || 4;
      const memory = nav.deviceMemory || 4;

      if (isMobile || cores < 4 || memory < 4) {
        setCanUse3D(false);
        return;
      }

      // Capable desktop environment confirmed
      setCanUse3D(true);
    } catch (err) {
      console.warn('Hero 3D capability check error, falling back to vector SVG:', err);
      setCanUse3D(false);
    }
  }, []);

  // Server & Initial hydration: Render static SVG with zero layout shift
  if (canUse3D === null) {
    return <StaticSymbolFallback animate={false} />;
  }

  // Capable desktops: Render interactive 3D Extruded Three.js canvas
  if (canUse3D) {
    return <DynamicHeroSymbol3D />;
  }

  // Mobile & low-end fallback: Animated CSS/SVG entrance
  return <StaticSymbolFallback animate={true} />;
}
