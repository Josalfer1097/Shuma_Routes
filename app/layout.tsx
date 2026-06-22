import type { Metadata, Viewport } from 'next';
import { Exo_2, DM_Sans } from 'next/font/google';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';
import { FontScaleProvider } from '@/lib/fontScaleContext';
import PrivacyBanner from '@/components/PrivacyBanner';

const exo2 = Exo_2({ subsets: ['latin'], variable: '--font-exo-2' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });

export const metadata: Metadata = {
  title: 'Shuma Rutas · Optimización de Entregas',
  description: 'Sistema interno de optimización de rutas de entrega para Shuma',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x64', type: 'image/x-icon' },
      { url: '/icon-favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
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
        <FontScaleProvider>
          <AuthGuard>
            {children}
            <PrivacyBanner />
          </AuthGuard>
        </FontScaleProvider>
      </body>
    </html>
  );
}
