import React from 'react';
import { Star } from 'lucide-react';

const REVIEWS = [
  {
    quote: 'Relyvora eliminated my fake transfer anxiety completely.',
    label: 'Fashion Vendor, Lagos',
    initials: 'AO',
    tone: 'bg-emerald-100 text-emerald-700',
  },
  {
    quote: 'My customers pay without fear now. I ship, they confirm, I get paid. Simple.',
    label: 'Gadget Reseller, Abuja',
    initials: 'CE',
    tone: 'bg-amber-100 text-amber-700',
  },
  {
    quote: 'I almost got scammed on Instagram before. Now I only buy through a Relyvora link.',
    label: 'Online Shopper, Port Harcourt',
    initials: 'TB',
    tone: 'bg-sky-100 text-sky-700',
  },
];

export function Testimonials() {
  return (
    <section
      id="testimonials"
      className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-b border-[#E7E4DC] bg-[#FAF8F5]"
    >
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="max-w-2xl space-y-3">
          <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#047857]">
            Social Proof
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#090E1A]">
            Built for the Hustle
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {REVIEWS.map((r) => (
            <figure
              key={r.label}
              className="p-7 rounded-3xl bg-white border border-[#E7E4DC] shadow-sm space-y-5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${r.tone}`}
                >
                  {r.initials}
                </div>
                <div className="flex gap-0.5" aria-label="5 out of 5 stars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
              </div>
              <blockquote className="text-lg font-semibold leading-snug text-[#090E1A]">
                “{r.quote}”
              </blockquote>
              <figcaption className="text-sm text-[#64748B] font-medium">{r.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
