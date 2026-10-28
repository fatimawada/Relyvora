'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { CheckCircle2 } from 'lucide-react';

const SLIDES = [
  {
    src: '/hero-1-merchant.jpg',
    alt: 'Confident boutique owner in her shop',
    handle: '@LagosHairPlug',
    caption: 'Verified Social Merchant • Lagos, NG',
    initials: 'LH',
    tag: 'ESCROW LIVE',
  },
  {
    src: '/hero-2-buyer.jpg',
    alt: 'Buyer on a couch deciding whether to risk a payment',
    handle: 'Buyer, Abuja',
    caption: 'Pay safely. Release only on delivery.',
    initials: 'AB',
    tag: 'PROTECTED',
  },
  {
    src: '/hero-3-vendor.jpg',
    alt: 'Electronics vendor packing an order',
    handle: '@NaijaGadgetHub',
    caption: 'Verified Social Merchant • Ikeja, NG',
    initials: 'NG',
    tag: 'PACKING',
  },
  {
    src: '/hero-4-rider.jpg',
    alt: 'Dispatch rider with a delivery box',
    handle: 'Dispatch Rider',
    caption: 'On the way • Code-verified handoff',
    initials: 'DR',
    tag: 'IN TRANSIT',
  },
  {
    src: '/hero-5-unboxing.jpg',
    alt: 'Happy customer unboxing a package at her front door',
    handle: 'Happy Customer',
    caption: 'Delivered • Funds released to vendor',
    initials: 'HC',
    tag: 'DELIVERED',
  },
];

const INTERVAL_MS = 4500;

export function HeroCrossfade() {
  const [failed, setFailed] = useState<string[]>([]);
  const slides = SLIDES.filter((s) => !failed.includes(s.src));
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setActive((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  const current = slides[active % slides.length] ?? SLIDES[0];

  return (
    <div className="relative rounded-3xl overflow-hidden shadow-2xl border-2 border-white/80 bg-[#E7E4DC]">
      <div className="relative aspect-[4/5] sm:aspect-[4/4.5] w-full">
        {slides.map((s, i) => (
          <Image
            key={s.src}
            src={s.src}
            alt={s.alt}
            fill
            priority={i === 0}
            sizes="(max-width: 768px) 100vw, 500px"
            onError={() => setFailed((f) => (f.includes(s.src) ? f : [...f, s.src]))}
            className={`object-cover object-top transition-opacity duration-1000 ease-in-out ${
              i === active % slides.length ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090E1A]/60 via-transparent to-transparent pointer-events-none" />

        {/* Slide indicators */}
        <div className="absolute top-4 right-4 flex gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.src}
              aria-label={`Show image ${i + 1}`}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === active % slides.length ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Caption follows the active image */}
      <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-2xl bg-white/90 backdrop-blur-md border border-white/80 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
            {current.initials}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#090E1A] flex items-center gap-1.5">
              <span className="truncate">{current.handle}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            </div>
            <div className="text-[10px] text-[#64748B] font-mono truncate">{current.caption}</div>
          </div>
        </div>
        <span className="px-2 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
          {current.tag}
        </span>
      </div>
    </div>
  );
}
