import React from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * Lightweight page enter transition (250ms fade + 8px rise).
 * Pure CSS so server and client markup are identical (no hydration branch),
 * no transform is left behind after the animation (keeps fixed/sticky children working),
 * and it is disabled automatically under prefers-reduced-motion (see globals.css).
 */
export function PageTransition({ children }: PageTransitionProps) {
  return <div className="page-enter w-full flex-1 flex flex-col">{children}</div>;
}
