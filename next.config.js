/** @type {import('next').NextConfig} */

// Política de seguridad de contenido (CSP): lista de orígenes que el navegador puede usar.
// Va en modo SOLO REPORTAR (Content-Security-Policy-Report-Only): no bloquea nada, solo avisa
// a /api/csp-report cuando algo viola la política. Tras unos días sin reportes inesperados,
// se cambia el encabezado a "Content-Security-Policy" para que bloquee de verdad.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseWs = supabaseUrl.replace(/^https:/, 'wss:');

const csp = [
  "default-src 'self'",
  // Next.js usa scripts en línea; Google Maps carga su SDK desde sus dominios
  "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com https://vercel.live",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Mapas, imágenes estáticas, íconos del clima y fotos privadas (ligas temporales de Supabase)
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.ggpht.com https://*.google.com https://openweathermap.org " + supabaseUrl,
  // Llamadas del navegador: Google (mapas, rutas, lugares), Supabase (subida directa) y la barra de Vercel
  "connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://vercel.live " + supabaseUrl + ' ' + supabaseWs,
  "worker-src 'self' blob:",
  "frame-src 'self' https://vercel.live",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'report-uri /api/csp-report',
].join('; ');

const nextConfig = {
  // Headers de seguridad básicos
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: csp,
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
