import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Shuma Rutas',
    short_name: 'Shuma Rutas',
    description: 'Sistema de optimización de rutas de entrega',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A1628',
    theme_color: '#2196F3',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
