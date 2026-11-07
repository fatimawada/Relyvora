'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { SupportedCountry } from '@/components/flags/FlagIcon';

interface MarketWaitlistFormProps {
  countryCode: SupportedCountry;
  countryName: string;
}

export function MarketWaitlistForm({ countryCode, countryName }: MarketWaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;

    const trimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) {
      setStatus('error');
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setStatus('loading');
    try {
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, market: countryCode }),
      });
      setStatus('success');
    } catch {
      setStatus('success');
    }
  };

  if (status === 'success') {
    return (
      <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-xs text-accent flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Thank you. We will email you when Relyvora launches in {countryName}.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="hidden" aria-hidden="true">
        <input
          type="text"
          name="phone_check"
          tabIndex={-1}
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="flex gap-2">
        <input
          type="email"
          aria-label={`Email address for ${countryName} updates`}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder="Enter your email"
          required
          className="flex-1 h-11 px-3.5 rounded-xl border border-border bg-site text-main text-xs focus:border-accent focus:outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-4 h-11 rounded-xl bg-main text-site dark:bg-accent dark:text-[#071229] text-xs font-semibold hover:opacity-90 transition-opacity shrink-0 inline-flex items-center gap-1"
        >
          <span>Notify me</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {status === 'error' && (
        <p className="text-[11px] text-red-500 font-medium">{errorMessage}</p>
      )}

      <p className="text-[11px] text-muted leading-tight">
        No spam. Read our{' '}
        <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-main">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
