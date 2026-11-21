'use client';

import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'flexible';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: (errorCode?: string) => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-api-script';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileWidgetProps {
  siteKey?: string;
  resetKey?: number;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (errorCode?: string) => void;
  className?: string;
}

export function TurnstileWidget({
  siteKey,
  resetKey = 0,
  onVerify,
  onExpire,
  onError,
  className = '',
}: TurnstileWidgetProps) {
  const activeSiteKey = (siteKey ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const prevResetKeyRef = useRef<number>(resetKey);

  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    if (!activeSiteKey || typeof window === 'undefined') return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const mountWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current !== null) return;

      containerRef.current.innerHTML = '';
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: activeSiteKey,
        theme: 'auto',
        callback: (token: string) => {
          if (!cancelled) {
            onVerifyRef.current(token);
          }
        },
        'expired-callback': () => {
          if (!cancelled) {
            onExpireRef.current?.();
          }
        },
        'error-callback': (errorCode?: string) => {
          if (!cancelled) {
            onErrorRef.current?.(errorCode);
          }
        },
      });
    };

    if (window.turnstile) {
      mountWidget();
    } else {
      let scriptEl = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = TURNSTILE_SCRIPT_ID;
        scriptEl.src = TURNSTILE_SCRIPT_SRC;
        scriptEl.async = true;
        scriptEl.defer = true;
        document.head.appendChild(scriptEl);
      }

      const handleLoad = () => {
        mountWidget();
      };
      scriptEl.addEventListener('load', handleLoad);
      pollTimer = setInterval(() => {
        if (window.turnstile) {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          mountWidget();
        }
      }, 100);

      return () => {
        cancelled = true;
        scriptEl?.removeEventListener('load', handleLoad);
        if (pollTimer) clearInterval(pollTimer);
        if (widgetIdRef.current !== null && window.turnstile?.remove) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // ignore removal error on unmounted node
          }
          widgetIdRef.current = null;
        }
      };
    }

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore removal error on unmounted node
        }
        widgetIdRef.current = null;
      }
    };
  }, [activeSiteKey]);

  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      if (widgetIdRef.current !== null && typeof window !== 'undefined' && window.turnstile?.reset) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          // ignore reset error if widget not ready
        }
      }
    }
  }, [resetKey]);

  if (!activeSiteKey) {
    return (
      <p className="text-xs text-rose-600">
        Cloudflare Turnstile site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY) is not configured on this deployment.
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      data-sitekey={activeSiteKey}
      className={`cf-turnstile min-h-[65px] ${className}`.trim()}
    />
  );
}
