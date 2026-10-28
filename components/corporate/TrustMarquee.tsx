import React from 'react';
import { MessageCircle, Camera, Music2 } from 'lucide-react';

const ITEMS: { icon?: React.ReactNode; text: string }[] = [
  { icon: <MessageCircle className="w-5 h-5" />, text: 'WhatsApp' },
  { text: 'Trusted by 1,200+ Social Merchants' },
  { icon: <Camera className="w-5 h-5" />, text: 'Instagram' },
  { text: 'Zero Payment-on-Delivery Losses' },
  { icon: <Music2 className="w-5 h-5" />, text: 'TikTok' },
  { text: 'Instant Settlement' },
  { text: '100% Escrow Protection' },
];

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={hidden || undefined}>
      {ITEMS.map((item, i) => (
        <li
          key={i}
          className={`flex items-center gap-2.5 whitespace-nowrap text-sm font-semibold ${
            item.icon ? 'text-slate-400 grayscale' : 'text-[#090E1A]'
          }`}
        >
          {item.icon}
          <span className={item.icon ? 'tracking-wide' : ''}>{item.text}</span>
          <span className="ml-10 text-emerald-600">•</span>
        </li>
      ))}
    </ul>
  );
}

export function TrustMarquee() {
  return (
    <div
      className="relative w-full overflow-hidden border-b border-[#E7E4DC] bg-white py-4 group"
      aria-label="Trust highlights"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />
      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
        <Row />
        <Row hidden />
      </div>
    </div>
  );
}
