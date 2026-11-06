'use client';

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CanvasWrapper } from '@/components/webgl/CanvasWrapper';
import { Overlay } from '@/components/webgl/Overlay';

export default function CorporateWebGLPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    // Register GSAP ScrollTrigger on client
    gsap.registerPlugin(ScrollTrigger);

    const el = containerRef.current;
    if (!el) return;

    // ScrollTrigger instance tracking total scroll depth (0 to 1)
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      onUpdate: (self) => {
        setScrollProgress(self.progress);
      },
    });

    return () => {
      trigger.kill();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <main
      ref={containerRef}
      className="relative w-full bg-[#0A0A0C] text-white selection:bg-emerald-500 selection:text-black overflow-x-hidden min-h-screen"
    >
      {/* 1. Global Fixed WebGL 3D Canvas Layer (Active Theory Style) */}
      <CanvasWrapper scrollProgress={scrollProgress} />

      {/* 2. Scrollable HTML Typography & Content Layer */}
      <Overlay scrollProgress={scrollProgress} />
    </main>
  );
}
