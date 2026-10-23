import type { Metadata } from 'next';
import './globals.css';
import { DemoBanner } from '@/components/DemoBanner';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Relyvora — Safe Social Commerce Escrow & Buyer Protection',
  description: 'Instant buyer trust and transaction protection for Instagram and WhatsApp vendors in Nigeria.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen flex flex-col">
        {/* Persistent, Non-dismissible Sandbox Compliance Banner */}
        <DemoBanner />

        {/* Global Navigation */}
        <Navbar />

        {/* Main Content Area */}
        <main className="flex-1 w-full flex flex-col">
          {children}
        </main>

        {/* Subtle Footer */}
        <footer className="w-full border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
          <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">Relyvora</span>
              <span>•</span>
              <span>Social Commerce Trust Layer (Nigeria)</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Simulated Escrow Sandbox • Powered by Supabase
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
