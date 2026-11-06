'use client';

import React from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const shouldReduceMotion = useReducedMotion();

  // If user prefers reduced motion, render immediately without animations
  if (shouldReduceMotion) {
    return <>{children}</>;
  }

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full flex-1 flex flex-col"
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
