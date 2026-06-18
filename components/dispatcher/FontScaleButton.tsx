'use client';

import { useState, useRef, useEffect } from 'react';
import { useFontScale } from '@/lib/fontScaleContext';

const SCALE_OPTIONS = [
  { label: 'Normal',     value: 1    as const, desc: 'Predeterminado' },
  { label: 'Grande',     value: 1.15 as const, desc: 'Un poco más' },
  { label: 'Más grande', value: 1.3  as const, desc: 'Fácil lectura' },
  { label: 'Accesible',  value: 1.5  as const, desc: 'Máximo tamaño' },
];

export default function FontScaleButton() {
  const { scale, setScale } = useFontScale();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const isActive = scale !== 1;
  const BLUE = '#2196F3';

  // Estilo consistente con los otros botones del header de Rutas
  const NAV_BTN_STYLE = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '5px 10px',
    background: open || isActive ? 'rgba(33,150,243,0.10)' : 'transparent',
    border: `1px solid ${open || isActive ? BLUE : '#112040'}`,
    borderRadius: 6,
    color: open || isActive ? BLUE : '#5B7BA0',
    fontSize: 11,
    fontFamily: "'Exo 2', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as const;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Botón Aa */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Tamaño de texto"
        style={NAV_BTN_STYLE}
        onMouseEnter={e => {
          if (!open && !isActive) {
            e.currentTarget.style.borderColor = BLUE;
            e.currentTarget.style.color = BLUE;
            e.currentTarget.style.background = 'rgba(33,150,243,0.06)';
          }
        }}
        onMouseLeave={e => {
          if (!open && !isActive) {
            e.currentTarget.style.borderColor = '#112040';
            e.currentTarget.style.color = '#5B7BA0';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, lineHeight: 1 }}>
          <span style={{ fontSize: 9 }}>A</span>
          <span style={{ fontSize: 13 }}>a</span>
        </span>
        <span className="hidden-mobile" style={{ fontSize: 11 }}>Texto</span>
      </button>

      {/* Popover desktop */}
      {open && !isMobile && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          zIndex: 9000,
          width: 220,
          background: '#0A1628',
          border: '1px solid #112040',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          padding: 14,
          animation: 'fontScaleFadeIn 0.15s ease-out',
        }}>
          <style>{`
            @keyframes fontScaleFadeIn {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          <p style={{ fontSize: 11, color: '#5B7BA0', marginBottom: 10,
            fontFamily: "'Exo 2', sans-serif", display: 'flex', alignItems: 'center', gap: 5 }}>
            🔠 Tamaño de texto
          </p>

          {/* Grid 2x2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
            {SCALE_OPTIONS.map(opt => {
              const active = scale === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setScale(opt.value)}
                  style={{
                    height: 38, borderRadius: 8,
                    background: active ? 'rgba(33,150,243,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? BLUE : '#112040'}`,
                    color: active ? '#E8EFF8' : '#5B7BA0',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 8px',
                    fontFamily: "'Exo 2', sans-serif",
                    fontSize: 10,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      e.currentTarget.style.background = 'rgba(33,150,243,0.08)';
                      e.currentTarget.style.color = '#E8EFF8';
                      e.currentTarget.style.borderColor = '#1E3A5F';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      e.currentTarget.style.color = '#5B7BA0';
                      e.currentTarget.style.borderColor = '#112040';
                    }
                  }}
                >
                  <span>{opt.label}</span>
                  {active && <span style={{ color: BLUE, fontSize: 11 }}>✓</span>}
                </button>
              );
            })}
          </div>

          {/* Separador */}
          <div style={{ height: 1, background: '#112040', marginBottom: 8 }} />

          {/* Vista previa */}
          <p style={{ fontSize: 9, color: '#3B5270', marginBottom: 3,
            fontFamily: "'Exo 2', sans-serif" }}>Vista previa:</p>
          <p className="text-scale-base" style={{ color: '#94A3B8',
            fontFamily: "'Exo 2', sans-serif" }}>
            Rutas optimizadas.
          </p>

          {/* Restablecer */}
          {scale !== 1 && (
            <button
              onClick={() => setScale(1)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#3B5270', fontSize: 9, marginTop: 8, padding: 0,
                fontFamily: "'Exo 2', sans-serif", transition: 'color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#5B7BA0'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#3B5270'; }}
            >
              Restablecer
            </button>
          )}
        </div>
      )}

      {/* Bottom sheet mobile */}
      {open && isMobile && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 8999, background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            zIndex: 9000,
            background: '#0A1628',
            border: '1px solid #112040',
            borderBottom: 'none',
            borderRadius: '16px 16px 0 0',
            padding: '12px 16px 32px',
            animation: 'slideUpFont 0.2s ease-out',
          }}>
            <style>{`
              @keyframes slideUpFont {
                from { transform: translateY(100%); }
                to   { transform: translateY(0); }
              }
            `}</style>
            <div style={{ width: 32, height: 3, borderRadius: 2, background: '#112040',
              margin: '0 auto 12px' }} />
            <p style={{ fontSize: 11, color: '#5B7BA0', marginBottom: 12, textAlign: 'center',
              fontFamily: "'Exo 2', sans-serif" }}>
              🔠 Tamaño de texto
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {SCALE_OPTIONS.map(opt => {
                const active = scale === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setScale(opt.value)}
                    style={{
                      height: 48, borderRadius: 10, width: '100%',
                      background: active ? 'rgba(33,150,243,0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? BLUE : '#112040'}`,
                      color: active ? '#E8EFF8' : '#5B7BA0',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 14px',
                      fontFamily: "'Exo 2', sans-serif",
                    }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 12, fontWeight: active ? 600 : 400 }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: '#3B5270' }}>{opt.desc}</div>
                    </div>
                    {active && <span style={{ color: BLUE, fontSize: 14 }}>✓</span>}
                  </button>
                );
              })}
            </div>
            {scale !== 1 && (
              <button
                onClick={() => setScale(1)}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  color: '#3B5270', fontSize: 10, padding: '6px 0',
                  fontFamily: "'Exo 2', sans-serif" }}
              >
                Restablecer
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
