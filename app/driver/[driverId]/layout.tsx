import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mi Ruta · Shuma Rutas',
  description: 'Vista del chofer con la ruta de entrega optimizada',
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
