"use client";
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ParticleField from '@/components/ParticleField';
import { useEasterEgg } from '@/hooks/useEasterEgg';
import EasterEggOverlay from '@/components/EasterEggOverlay';

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pulsingCard, setPulsingCard] = useState<'admin' | 'driver' | null>(null);
  type ServiceStatus = { ok: boolean; label: string; error: string | null };
  type SysStatus = 'checking' | 'ok' | 'degraded' | 'error';

  const easterEgg = useEasterEgg();
  const [sysStatus, setSysStatus] = useState<SysStatus>('checking');
  const [sysServices, setSysServices] = useState<Record<string, ServiceStatus> | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelog, setChangelog] = useState<{
    updated: string;
    items: Array<{ type: string; text: string }>;
  } | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(j => {
        if (j.services) {
          setSysServices(j.services);
          const services = Object.values(j.services) as ServiceStatus[];
          const allOk = services.every(s => s.ok);
          const someOk = services.some(s => s.ok);
          setSysStatus(allOk ? 'ok' : someOk ? 'degraded' : 'error');
        } else {
          setSysStatus(j.ok ? 'ok' : 'error');
        }
      })
      .catch(() => setSysStatus('error'));
  }, []);

  useEffect(() => {
    fetch('/changelog.json')
      .then(r => r.json())
      .then(setChangelog)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A') {
        setPulsingCard('admin');
        setTimeout(() => {
          setLeaving(true);
          setTimeout(() => router.push('/admin-login'), 280);
        }, 200);
      }
      if (e.key === 'c' || e.key === 'C') {
        setPulsingCard('driver');
        setTimeout(() => {
          setLeaving(true);
          setTimeout(() => router.push('/driver-login'), 280);
        }, 200);
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
    <main
      className="min-h-screen flex items-center justify-center bg-shuma-bg px-4"
      style={leaving ? { animation: 'pageFadeOut 0.3s ease forwards' } : undefined}
    >
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
          <div
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 12,
              marginBottom: 4,
              cursor: sysServices ? 'pointer' : 'default',
            }}
            onMouseEnter={() => sysServices && setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div className={`w-2 h-2 rounded-full transition-colors ${
              sysStatus === 'ok'       ? 'bg-emerald-400 animate-pulse' :
              sysStatus === 'degraded' ? 'bg-amber-400 animate-pulse' :
              sysStatus === 'error'    ? 'bg-red-400' :
                                         'bg-slate-600 animate-pulse'
            }`} />
            <span style={{
              fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              color:
                sysStatus === 'ok'       ? '#34d399' :
                sysStatus === 'degraded' ? '#fbbf24' :
                sysStatus === 'error'    ? '#f87171' :
                                           '#3B5270',
              fontFamily: "'Exo 2', sans-serif",
            }}>
              {sysStatus === 'ok'       ? 'Sistemas en línea' :
               sysStatus === 'degraded' ? 'Servicio degradado' :
               sysStatus === 'error'    ? 'Sin conexión' :
                                         'Verificando...'}
            </span>

            {showTooltip && sysServices && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100,
                background: 'linear-gradient(160deg, #0D1E38, #0A1628)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: '10px 14px',
                minWidth: 210,
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                pointerEvents: 'none',
              }}>
                {/* Flechita */}
                <div style={{
                  position: 'absolute',
                  top: -5,
                  left: '50%',
                  marginLeft: -4,
                  width: 8,
                  height: 8,
                  background: '#0D1E38',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderBottom: 'none',
                  borderRight: 'none',
                  transform: 'rotate(45deg)',
                }} />
                <p style={{
                  fontSize: 9,
                  fontFamily: "'Exo 2', sans-serif",
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#3B5270',
                  margin: '0 0 8px 0',
                }}>
                  Estado de servicios
                </p>
                {Object.values(sysServices).map((svc) => (
                  <div key={svc.label} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 6,
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      backgroundColor: svc.ok ? '#34d399' : '#f87171',
                      flexShrink: 0, marginTop: 3,
                    }} />
                    <div style={{ flex: 1 }}>
                      <span style={{
                        fontSize: 11,
                        fontFamily: "'DM Sans', sans-serif",
                        color: '#A8BFE0',
                        display: 'block',
                      }}>
                        {svc.label}
                      </span>
                      {!svc.ok && svc.error && (
                        <span style={{
                          fontSize: 10,
                          fontFamily: "'DM Sans', sans-serif",
                          color: '#f87171',
                          display: 'block',
                          marginTop: 1,
                        }}>
                          {svc.error}
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 9,
                      fontFamily: "'Exo 2', sans-serif",
                      letterSpacing: '0.08em',
                      color: svc.ok ? '#34d399' : '#f87171',
                      flexShrink: 0,
                    }}>
                      {svc.ok ? 'OK' : 'ERROR'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Selector de rol */}
        <div className="space-y-3">
          <p className="text-center text-xs font-medium text-slate-500 uppercase tracking-widest mb-5">
            Selecciona tu rol
          </p>
          <button
            onClick={() => {
              setLeaving(true); setTimeout(() => router.push('/admin-login'), 280);
            }}
            className="relative group flex items-center gap-4 w-full p-6 rounded-2xl
                       bg-shuma-surface hover:bg-shuma-border border border-shuma-border
                       hover:border-shuma-accent transition-all duration-300 hover:shadow-lg
                       hover:shadow-[0_0_15px_rgba(33,150,243,0.15)] hover:-translate-y-0.5"
            style={{
              animation: pulsingCard === 'admin'
                ? 'cardKeyPress 0.2s ease forwards'
                : 'cardSlideUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.1s both',
            }}
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
          </button>
          <button
            onClick={() => {
              setLeaving(true); setTimeout(() => router.push('/driver-login'), 280);
            }}
            className="relative group flex items-center gap-4 w-full p-6 rounded-2xl
                       bg-shuma-surface hover:bg-shuma-border border border-shuma-border
                       hover:border-shuma-warning transition-all duration-300 hover:shadow-lg
                       hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:-translate-y-0.5"
            style={{
              animation: pulsingCard === 'driver'
                ? 'cardKeyPressAmber 0.2s ease forwards'
                : 'cardSlideUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.22s both',
            }}
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
          </button>
        </div>
        {/* Footer RGB */}
        <p
          onClick={easterEgg.registerClick}
          style={{
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
            opacity: 0.8,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          Design &amp; Developed by Shuma Sistemas IT
        </p>
        <button
          onClick={() => changelog && setShowChangelog(true)}
          style={{
            display: 'block', margin: '6px auto 0',
            background: changelog ? 'rgba(33,150,243,0.08)' : 'transparent',
            border: changelog ? '1px solid rgba(33,150,243,0.2)' : '1px solid transparent',
            borderRadius: 99, padding: '3px 12px',
            fontSize: 10, color: '#2196F3',
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: '0.04em',
            cursor: changelog ? 'pointer' : 'default',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            if (!changelog) return;
            e.currentTarget.style.background = 'rgba(33,150,243,0.15)';
            e.currentTarget.style.borderColor = 'rgba(33,150,243,0.4)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = changelog ? 'rgba(33,150,243,0.08)' : 'transparent';
            e.currentTarget.style.borderColor = changelog ? 'rgba(33,150,243,0.2)' : 'transparent';
          }}
        >
          v7.29.6{changelog ? ' · Ver novedades  ' : ''}
        </button>
        <style>{`
          @keyframes rgbRoll {
            from { background-position: 0% center; }
            to   { background-position: 400% center; }
          }
          @keyframes cardSlideUp {
            from { opacity: 0; transform: translateY(24px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes pageFadeOut {
            from { opacity: 1; transform: scale(1); }
            to   { opacity: 0; transform: scale(0.98); }
          }
          @keyframes cardKeyPress {
            0%   { transform: scale(1); box-shadow: none; }
            40%  { transform: scale(0.97); box-shadow: 0 0 0 3px rgba(33,150,243,0.4); }
            100% { transform: scale(1); box-shadow: none; }
          }
          @keyframes cardKeyPressAmber {
            0%   { transform: scale(1); box-shadow: none; }
            40%  { transform: scale(0.97); box-shadow: 0 0 0 3px rgba(245,158,11,0.4); }
            100% { transform: scale(1); box-shadow: none; }
          }
        `}</style>
      </div>

      {/* ── Modal de changelog ── */}
      {showChangelog && changelog && (
        <div
          onClick={() => setShowChangelog(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(5,12,28,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(160deg, #0D1E38, #0A1628)',
              border: '1px solid rgba(33,150,243,0.2)',
              borderRadius: 20, width: '100%', maxWidth: 480,
              maxHeight: '80vh', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              animation: 'cardSlideUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            }}>
              <div>
                <h2 style={{
                  fontSize: 16, fontWeight: 700, color: '#E8EFF8',
                  fontFamily: "'Exo 2', sans-serif", margin: 0,
                }}>
                  🌟 Novedades v7.29.6
                </h2>
                <p style={{
                  fontSize: 11, color: '#5B7BA0', margin: '4px 0 0',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Actualizado:{' '}
                  {new Date(changelog.updated + 'T12:00:00').toLocaleDateString('es-MX', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              </div>
              <button
                onClick={() => setShowChangelog(false)}
                style={{
                  background: 'none', border: 'none', color: '#5B7BA0',
                  cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
                }}
              >✕</button>
            </div>

            {/* Lista de cambios */}
            <div style={{ overflowY: 'auto', padding: '16px 24px', flex: 1 }}>
              {changelog.items.map((item, i) => {
                const cfgMap: Record<string, {
                  color: string; bg: string; border: string; icon: string; label: string;
                }> = {
                  new:     { color: '#34d399', bg: 'rgba(16,185,129,0.08)',
                             border: 'rgba(16,185,129,0.2)',  icon: '✨', label: 'Nuevo' },
                  improve: { color: '#fbbf24', bg: 'rgba(245,158,11,0.08)',
                             border: 'rgba(245,158,11,0.2)',  icon: '⚡', label: 'Mejora' },
                  fix:     { color: '#60a5fa', bg: 'rgba(33,150,243,0.08)',
                             border: 'rgba(33,150,243,0.2)',  icon: '🔧', label: 'Fix' },
                  bug:     { color: '#f87171', bg: 'rgba(239,68,68,0.08)',
                             border: 'rgba(239,68,68,0.2)',   icon: '🐛', label: 'Bug' },
                };
                const c = cfgMap[item.type] || {
                  color: '#5B7BA0', bg: 'transparent',
                  border: 'rgba(255,255,255,0.06)', icon: '•', label: '',
                };
                return (
                  <div key={i} style={{
                    display: 'flex', gap: 10, marginBottom: 8,
                    padding: '8px 12px',
                    background: c.bg, border: `1px solid ${c.border}`,
                    borderRadius: 10,
                  }}>
                    <span style={{ flexShrink: 0, fontSize: 14 }}>{c.icon}</span>
                    <div>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: c.color,
                        fontFamily: "'Exo 2', sans-serif",
                      }}>
                        {c.label}
                      </span>
                      <p style={{
                        fontSize: 12, color: '#A8BFE0', margin: '2px 0 0',
                        fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
                      }}>
                        {item.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 24px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              textAlign: 'center',
            }}>
              <button
                onClick={() => setShowChangelog(false)}
                style={{
                  background: 'rgba(33,150,243,0.1)',
                  border: '1px solid rgba(33,150,243,0.2)',
                  borderRadius: 10, padding: '8px 24px',
                  color: '#60a5fa', fontSize: 12, cursor: 'pointer',
                  fontFamily: "'Exo 2', sans-serif", fontWeight: 600,
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {easterEgg.isActive && <EasterEggOverlay onClose={easterEgg.deactivate} />}
    </main>
  );
}
