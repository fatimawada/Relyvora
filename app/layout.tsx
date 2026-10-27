import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Relyvora — The Trust Layer for African Social Commerce',
  description: 'Neutral transaction protocol and escrow infrastructure bridging buyers, merchants, and delivery couriers across African markets.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased min-h-screen flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
