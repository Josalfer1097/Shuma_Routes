"use client";
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ParticleField from '@/components/ParticleField';

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A') {
        window.location.href = '/admin-login';
      }
      if (e.key === 'c' || e.key === 'C') {
        window.location.href = '/driver-login';
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    setReady(true);
    const auth = sessionStorage.getItem('shuma_auth');
    const role = sessionStorage.getItem('shuma_role');
    if (auth === '1' && role) {
      if (role === 'driver') {
        router.push('/driver');
      } else {
        router.push('/dispatcher');
      }
    }
  }, []);

  if (!ready) return (
    <div style={{ position: 'fixed', inset: 0, background: '#050C1A', zIndex: 99998 }} />
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-shuma-bg px-4">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradientes de fondo */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl" />

        <ParticleField />

        {/* SVG de rutas animadas */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.07]"
          viewBox="0 0 1200 800"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <style>{`
              .route-path {
                fill: none;
                stroke: #2196F3;
                stroke-width: 1.5;
                stroke-dasharray: 800;
                stroke-dashoffset: 800;
              }
              .route-path-amber {
                fill: none;
                stroke: #F59E0B;
                stroke-width: 1.5;
                stroke-dasharray: 600;
                stroke-dashoffset: 600;
              }
              .rp1 { animation: draw-route 4s ease-in-out 0.2s infinite alternate; }
              .rp2 { animation: draw-route 5s ease-in-out 0.8s infinite alternate; }
              .rp3 { animation: draw-route 4.5s ease-in-out 1.4s infinite alternate; }
              .rp4 { animation: draw-route-amber 3.5s ease-in-out 0.5s infinite alternate; }
              .rp5 { animation: draw-route-amber 4.8s ease-in-out 1.1s infinite alternate; }
              @keyframes draw-route {
                0%   { stroke-dashoffset: 800; opacity: 0; }
                10%  { opacity: 1; }
                80%  { stroke-dashoffset: 0; opacity: 0.8; }
                100% { stroke-dashoffset: 0; opacity: 0.3; }
              }
              @keyframes draw-route-amber {
                0%   { stroke-dashoffset: 600; opacity: 0; }
                10%  { opacity: 1; }
                80%  { stroke-dashoffset: 0; opacity: 0.6; }
                100% { stroke-dashoffset: 0; opacity: 0.2; }
              }
              .depot-dot { fill: #2196F3; animation: pulse-dot 2s ease-in-out infinite; }
              .stop-dot  { fill: #F59E0B; animation: pulse-dot 2s ease-in-out 0.5s infinite; }
              @keyframes pulse-dot {
                0%,100% { r: 4; opacity: 0.8; }
                50%      { r: 6; opacity: 0.4; }
              }
              @keyframes logo-glow-pulse {
                0%, 100% { filter: drop-shadow(0 0 12px rgba(33,150,243,0.4)); }
                50%      { filter: drop-shadow(0 0 20px rgba(33,150,243,0.65)); }
              }
            `}</style>
          </defs>

          {/* Rutas azules — vehículo 1 */}
          <path className="route-path rp1" d="M 600 400 L 450 320 L 300 280 L 180 350 L 120 420 L 200 500 L 350 530" />
          <path className="route-path rp2" d="M 600 400 L 680 300 L 820 260 L 950 310 L 1020 400 L 980 500 L 880 550" />
          <path className="route-path rp3" d="M 600 400 L 560 520 L 480 620 L 380 650 L 260 620 L 200 560" />

          {/* Rutas ámbar — vehículo 2 */}
          <path className="route-path-amber rp4" d="M 600 400 L 700 480 L 820 510 L 900 580 L 860 660 L 740 690" />
          <path className="route-path-amber rp5" d="M 600 400 L 500 460 L 400 440 L 300 480 L 240 560 L 300 630" />

          {/* Puntos depot */}
          <circle className="depot-dot" cx="600" cy="400" r="6" />

          {/* Puntos de parada */}
          <circle className="stop-dot" cx="180" cy="350" r="4" style={{ animationDelay: '1s' }} />
          <circle className="stop-dot" cx="950" cy="310" r="4" style={{ animationDelay: '1.5s' }} />
          <circle className="stop-dot" cx="480" cy="620" r="4" style={{ animationDelay: '2s' }} />
          <circle className="stop-dot" cx="820" cy="510" r="4" style={{ animationDelay: '0.7s' }} />
          <circle className="stop-dot" cx="300" cy="280" r="4" style={{ animationDelay: '2.5s' }} />
          <circle className="stop-dot" cx="860" cy="660" r="4" style={{ animationDelay: '1.2s' }} />
        </svg>
      </div>
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5">
            <Image
              src="/shuma_logo.png"
              alt="Shuma Logo"
              width={320}
              height={100}
              priority
              style={{ animation: 'logo-glow-pulse 2s ease-in-out infinite' }}
            />
          </div>
          <h1 className="text-3xl font-exo mb-2">
            <span className="font-bold text-shuma-text">Rutas</span>
            {' '}
            <span className="font-medium text-gradient">Logística</span>
          </h1>
          <p className="text-shuma-muted text-sm">
            Sistema de optimización de rutas de entrega
          </p>
        </div>
        {/* Selector de rol */}
        <div className="space-y-3">
          <p className="text-center text-xs font-medium text-slate-500 uppercase tracking-widest mb-5">
            Selecciona tu rol
          </p>
          <Link
            href="/admin-login"
            className="relative group flex items-center gap-4 w-full p-6 rounded-2xl
                       bg-shuma-surface hover:bg-shuma-border border border-shuma-border
                       hover:border-shuma-accent transition-all duration-300 hover:shadow-lg
                       hover:shadow-[0_0_15px_rgba(33,150,243,0.15)] hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0
                            bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors duration-300">
              <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <h2 className="font-semibold text-shuma-text group-hover:text-shuma-accent transition-colors">
                Soy Administrador
              </h2>
              <p className="text-sm text-shuma-muted mt-0.5">
                Gestión de rutas, choferes y operaciones
              </p>
            </div>
            <svg className="w-5 h-5 text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1
                            transition-all duration-300"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div style={{
              position: 'absolute', bottom: 8, right: 48,
              fontSize: 18, opacity: 0,
              transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
              className="group-hover:opacity-60 group-hover:scale-110 group-hover:translate-x-2"
            >🗺️</div>
            <span className="absolute top-2 right-2 text-[9px] font-mono bg-white/10 text-white/40 px-1.5 py-0.5 rounded border border-white/10">
              A
            </span>
          </Link>
          <Link
            href="/driver-login"
            className="relative group flex items-center gap-4 w-full p-6 rounded-2xl
                       bg-shuma-surface hover:bg-shuma-border border border-shuma-border
                       hover:border-shuma-warning transition-all duration-300 hover:shadow-lg
                       hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0
                            bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors duration-300">
              <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <h2 className="font-semibold text-shuma-text group-hover:text-shuma-warning transition-colors">
                Soy Chofer
              </h2>
              <p className="text-sm text-shuma-muted mt-0.5">
                Ver mi ruta y marcar entregas completadas
              </p>
            </div>
            <svg className="w-5 h-5 text-slate-600 group-hover:text-amber-400 group-hover:translate-x-1
                            transition-all duration-300"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div style={{
              position: 'absolute', bottom: 8, right: 48,
              fontSize: 18, opacity: 0,
              transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
              className="group-hover:opacity-60 group-hover:scale-110 group-hover:translate-x-2"
            >🚛</div>
            <span className="absolute top-2 right-2 text-[9px] font-mono bg-white/10 text-white/40 px-1.5 py-0.5 rounded border border-white/10">
              C
            </span>
          </Link>
        </div>
        {/* Footer RGB */}
        <p style={{
          textAlign: 'center',
          fontSize: 14,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginTop: 32,
          background: 'linear-gradient(90deg, #ff0000, #ff6600, #ffff00, #00ff00, #00ffff, #0066ff, #cc00ff, #ff0000)',
          backgroundSize: '400% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'rgbRoll 5s linear infinite',
          opacity: 0.8
        }}>
          Design &amp; Developed by Shuma Sistemas IT
        </p>
        <p style={{
          textAlign: 'center', fontSize: 10, color: '#3B5270',
          marginTop: 6, fontFamily: "'DM Sans', sans-serif",
          letterSpacing: '0.04em',
        }}>
          v7.23.6
        </p>
        <style>{`
          @keyframes rgbRoll {
            from { background-position: 0% center; }
            to   { background-position: 400% center; }
          }
        `}</style>
      </div>
    </main>
  );
}
