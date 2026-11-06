'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { detectDeviceCapability, DeviceCapability } from '@/lib/webglDetection';
import { FallbackView } from './FallbackView';

// Dynamically import Three.js Scene to prevent any SSR hydration conflicts
const DynamicScene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => null,
});

interface CanvasWrapperProps {
  scrollProgress: number;
}

export function CanvasWrapper({ scrollProgress }: CanvasWrapperProps) {
  const [capability, setCapability] = useState<DeviceCapability | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setCapability(detectDeviceCapability());
  }, []);

  if (!isMounted) return null;

  // Gracefully degrade to SVG vector illustrations for low-end mobile / slow networks
  if (capability?.shouldUseFallback) {
    return <FallbackView scrollProgress={scrollProgress} />;
  }

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
      <DynamicScene scrollProgress={scrollProgress} />
    </div>
  );
}
