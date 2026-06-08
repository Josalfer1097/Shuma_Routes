"use client";
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return (
    <div style={{ position: 'fixed', inset: 0, background: '#050C1A', zIndex: 99998 }} />
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-shuma-bg px-4">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl" />
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
              style={{ filter: 'drop-shadow(0 0 12px rgba(33,150,243,0.4))' }}
            />
          </div>
          <h1 className="text-3xl font-exo font-bold text-shuma-text mb-2">
            Rutas y <span className="text-gradient">Despachos</span>
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
            href="/dispatcher"
            className="group flex items-center gap-4 w-full p-5 rounded-2xl
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
                Soy Despachador
              </h2>
              <p className="text-sm text-shuma-muted mt-0.5">
                Carga CSV, asigna choferes y optimiza rutas
              </p>
            </div>
            <svg className="w-5 h-5 text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1
                            transition-all duration-300"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/driver"
            className="group flex items-center gap-4 w-full p-5 rounded-2xl
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
          </Link>
        </div>
        {/* Footer RGB */}
        <p style={{
          textAlign: 'center',
          fontSize: 13,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginTop: 32,
          background: 'linear-gradient(90deg, #ff0000, #ff6600, #ffff00, #00ff00, #00ffff, #0066ff, #cc00ff, #ff0000)',
          backgroundSize: '400% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'rgbRoll 5s linear infinite',
          opacity: 0.75
        }}>
          Design &amp; Developed by Shuma Sistemas IT
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
