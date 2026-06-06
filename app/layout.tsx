import type { Metadata, Viewport } from 'next';
import { Exo_2, DM_Sans } from 'next/font/google';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';

const exo2 = Exo_2({ subsets: ['latin'], variable: '--font-exo-2' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });

export const metadata: Metadata = {
  title: 'Shuma Rutas · Optimización de Entregas',
  description: 'Sistema interno de optimización de rutas de entrega para Shuma',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F172A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${exo2.variable} ${dmSans.variable}`}>
      <body className="antialiased font-sans">
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}
