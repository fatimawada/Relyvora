'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Pause, Play } from 'lucide-react';
import type { HeroTheme } from './EscrowObjects3D';

const EscrowObjects3D = dynamic(() => import('./EscrowObjects3D'), { ssr: false });

export const HERO_STEPS = ['Order placed', 'Money held', 'Order confirmed', 'Payment released'] as const;

const ADVANCE_MS = 6000;

type Mode = 'pending' | '3d' | 'posters' | 'still' | 'capture';

const posterSrc = (index: number, theme: HeroTheme) => `/hero/step-${index + 1}-${theme}.webp`;

/** Decide whether this device should run the WebGL scene. Returns a reason when it should not. */
function checkCapability(): { ok: true } | { ok: false; reason: string } {
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2')) return { ok: false, reason: 'WebGL2 is not available' };

    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
      deviceMemory?: number;
    };
    if (nav.connection?.saveData) return { ok: false, reason: 'Save-Data is enabled' };
    if (nav.connection?.effectiveType && /(^|-)2g$/.test(nav.connection.effectiveType)) {
      return { ok: false, reason: `slow network (${nav.connection.effectiveType})` };
    }
    if (window.innerWidth < 768) return { ok: false, reason: 'small screen (phone layout)' };
    const cores = navigator.hardwareConcurrency || 4;
    if (cores < 4) return { ok: false, reason: `only ${cores} CPU cores` };
    const memory = nav.deviceMemory ?? 4;
    if (memory < 4) return { ok: false, reason: `only ${memory} GB device memory` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `capability check failed: ${(err as Error).message}` };
  }
}

export function HeroStage() {
  const [mode, setMode] = useState<Mode>('pending');
  const [step, setStep] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [requested, setRequested] = useState<Set<number>>(() => new Set([0]));
  const [capture, setCapture] = useState<{ step: number; theme: HeroTheme } | null>(null);

  // Decide rendering mode on the client
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('3d');

    if (override === 'poster') {
      const s = clamp(parseInt(params.get('step') || '1', 10) - 1, 0, 3);
      setCapture({ step: s, theme: params.get('theme') === 'dark' ? 'dark' : 'light' });
      setMode('capture');
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced && override !== 'on') {
      console.info('[Relyvora hero] Showing still posters: prefers-reduced-motion is set.');
      setMode('still');
      return;
    }
    if (override === 'on') {
      console.info('[Relyvora hero] 3D forced on by ?3d=on override.');
      setMode('3d');
      return;
    }
    if (override === 'off') {
      console.info('[Relyvora hero] Poster fallback forced by ?3d=off override.');
      setMode('posters');
      return;
    }
    const result = checkCapability();
    if (result.ok) {
      setMode('3d');
    } else {
      console.info(`[Relyvora hero] Poster fallback: ${result.reason}.`);
      setMode('posters');
    }
  }, []);

  // Once in poster or still mode on the client, load all four posters for smooth CSS crossfade
  useEffect(() => {
    if (mode === 'posters' || mode === 'still') {
      setRequested(new Set([0, 1, 2, 3]));
    }
  }, [mode]);

  const autoAdvance = (mode === '3d' || mode === 'posters') && !userPaused && !hovered && !focused;

  useEffect(() => {
    if (!autoAdvance) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % HERO_STEPS.length), ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [autoAdvance, step]);

  const onCanvasError = useCallback((reason: string) => {
    console.info(`[Relyvora hero] Poster fallback: ${reason}.`);
    setMode('posters');
  }, []);
  const onCanvasReady = useCallback(() => setCanvasReady(true), []);

  /* ---------- QA-only poster capture view (?3d=poster&step=N&theme=light|dark) ---------- */
  if (mode === 'capture' && capture) {
    return (
      <div className="relative mx-auto" style={{ width: 560, height: 560 }}>
        <EscrowObjects3D step={capture.step} posterMode forcedTheme={capture.theme} />
      </div>
    );
  }

  const showCanvas = mode === '3d';
  const postersVisible = !showCanvas || !canvasReady;
  const canAutoPlay = mode === '3d' || mode === 'posters';

  return (
    <div
      className="w-full max-w-[480px] mx-auto flex flex-col items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {/* Visual: floats on the page background with a soft emerald glow */}
      <div className="relative w-full aspect-square">
        <div className="hero-glow absolute inset-0 pointer-events-none" aria-hidden="true" />

        {/* Posters (server-rendered first frame, phone crossfade, reduced-motion still) */}
        <div
          className={`absolute inset-0 ${postersVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          aria-hidden="true"
        >
          {HERO_STEPS.map((_, i) =>
            requested.has(i) ? (
              <div
                key={i}
                className={`absolute inset-0 transition-opacity duration-700 ease-in-out motion-reduce:transition-none ${
                  i === step ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={posterSrc(i, 'light')}
                  alt=""
                  width={560}
                  height={560}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : 'auto'}
                  decoding="async"
                  className="w-full h-full object-contain dark:hidden"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={posterSrc(i, 'dark')}
                  alt=""
                  width={560}
                  height={560}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="w-full h-full object-contain hidden dark:block"
                />
              </div>
            ) : null
          )}
        </div>

        {showCanvas && (
          <div className={`absolute inset-0 ${canvasReady ? 'opacity-100' : 'opacity-0'}`}>
            <EscrowObjects3D step={step} onReady={onCanvasReady} onError={onCanvasError} />
          </div>
        )}
      </div>

      {/* Step caption + controls (small, unboxed) */}
      <div className="mt-2 flex flex-col items-center gap-3">
        <p
          className="text-sm font-medium text-muted"
          aria-live={canAutoPlay && autoAdvance ? 'off' : 'polite'}
        >
          <span className="text-accent font-semibold">Step {step + 1}</span>
          <span className="mx-1.5" aria-hidden="true">·</span>
          {HERO_STEPS[step]}
        </p>

        <div className="flex items-center gap-1">
          <div role="group" aria-label="Escrow steps" className="flex items-center">
            {HERO_STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Show step ${i + 1}: ${label}`}
                aria-current={i === step ? 'step' : undefined}
                className="w-8 h-8 inline-flex items-center justify-center rounded-full group"
              >
                <span
                  className={`block rounded-full transition-all duration-300 ${
                    i === step ? 'w-5 h-2 bg-accent' : 'w-2 h-2 bg-border group-hover:bg-muted'
                  }`}
                />
              </button>
            ))}
          </div>

          {canAutoPlay && (
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? 'Play step animation' : 'Pause step animation'}
              className="ml-1 w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:text-main hover:bg-surface transition-colors"
            >
              {userPaused ? <Play className="w-3.5 h-3.5" aria-hidden="true" /> : <Pause className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Number.isNaN(v) ? min : Math.min(max, Math.max(min, v));
}
