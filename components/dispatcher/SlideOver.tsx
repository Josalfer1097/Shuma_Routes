'use client';

import { useEffect, useRef } from 'react';

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Panel width on desktop. Defaults to 500. Mobile always 100vw. */
  width?: number;
  allowMapInteraction?: boolean;
}

export default function SlideOver({
  isOpen,
  onClose,
  title,
  children,
  footer,
  width = 880,
  allowMapInteraction = false,
}: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* ── Overlay ───────────────────────────────────── */}
      <div
        onClick={allowMapInteraction ? undefined : onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: allowMapInteraction ? 'transparent' : 'rgba(5,12,26,0.7)',
          backdropFilter: allowMapInteraction ? 'none' : 'blur(2px)',
          WebkitBackdropFilter: allowMapInteraction ? 'none' : 'blur(2px)',
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen && !allowMapInteraction ? 'auto' : 'none',
          transition: 'opacity 0.3s ease, background 0.3s ease',
        }}
      />

      {/* ── Panel (Liquid Glass) ────────────────────────── */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100vw' : typeof window !== 'undefined' && window.innerWidth <= 1200 ? `min(90vw, ${width}px)` : `${width}px`,
          maxWidth: '100vw',
          background: 'rgba(10,22,40,0.55)',
          backdropFilter: 'blur(28px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
          borderLeft: '1px solid rgba(33,150,243,0.18)',
          zIndex: 41,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
        }}
      >
        {/* ── Top glow line ── */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: 'linear-gradient(90deg,transparent,rgba(33,150,243,0.6),rgba(100,180,255,0.4),transparent)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* ── Panel header ── */}
        <div
          style={{
            padding: '18px 22px',
            background: 'rgba(5,12,26,0.2)',
            borderBottom: '1px solid rgba(33,150,243,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Exo 2', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: '#E8EFF8',
              letterSpacing: '0.06em',
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 28,
              height: 28,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 7,
              color: '#5B7BA0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)';
              e.currentTarget.style.color = '#EF4444';
              e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = '#5B7BA0';
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Panel body (scrollable) ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'scroll',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(33,150,243,0.35) rgba(255,255,255,0.03)',
            padding: 20,
          }}
          className="so-body"
        >
          {children}
        </div>

        {/* ── Panel footer (optional) ── */}
        {footer && (
          <div
            style={{
              padding: '16px 20px',
              background: 'rgba(5,12,26,0.3)',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>

      {/* ── Scoped styles ── */}
      <style jsx global>{`
        .so-body::-webkit-scrollbar {
          width: 6px;
        }
        .so-body::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.03);
          border-radius: 999px;
        }
        .so-body::-webkit-scrollbar-thumb {
          background: rgba(33,150,243,0.35);
          border-radius: 999px;
          border: 1px solid rgba(33,150,243,0.1);
        }
        .so-body::-webkit-scrollbar-thumb:hover {
          background: rgba(33,150,243,0.55);
        }

        /* ── Section titles inside slide-over ── */
        .so-section {
          margin-bottom: 24px;
        }
        .so-section-title {
          font-family: 'Exo 2', sans-serif;
          font-size: calc(9px * var(--font-scale, 1));
          letter-spacing: 0.2em;
          color: rgba(33,150,243,0.5);
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        /* ── Field styles ── */
        .so-label {
          font-size: calc(11px * var(--font-scale, 1));
          color: rgba(255,255,255,0.45);
          margin-bottom: 5px;
          display: block;
        }
        .so-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 9px;
          padding: 9px 12px;
          color: #E8EFF8;
          font-size: calc(13px * var(--font-scale, 1));
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: all 0.2s;
        }
        .so-input:focus {
          border-color: rgba(33,150,243,0.45);
          background: rgba(33,150,243,0.06);
          box-shadow: 0 0 0 3px rgba(33,150,243,0.08);
        }
        .so-select {
          width: 100%;
          background: #0D1E38;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 9px;
          padding: 9px 12px;
          padding-right: 32px;
          color: #E8EFF8;
          font-size: calc(13px * var(--font-scale, 1));
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: all 0.2s;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%235B7BA0' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          cursor: pointer;
        }
        .so-select:focus {
          border-color: rgba(33,150,243,0.45);
          background-color: #0D1E38;
          box-shadow: 0 0 0 3px rgba(33,150,243,0.08);
        }
        .so-select option {
          background: #0D1E38;
          color: #E8EFF8;
        }
        .so-select option:disabled {
          color: #3B5270;
        }
        .so-select optgroup {
          background: #0A1628;
          color: #5B7BA0;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        /* ── Card styles inside slide-over ── */
        .so-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 11px;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        /* ── Add driver button ── */
        .so-btn-add {
          background: rgba(33,150,243,0.06);
          border: 1px dashed rgba(33,150,243,0.25);
          color: rgba(33,150,243,0.7);
          border-radius: 9px;
          padding: 10px;
          width: 100%;
          cursor: pointer;
          font-family: 'Exo 2', sans-serif;
          font-size: calc(12px * var(--font-scale, 1));
          transition: all 0.2s;
        }
        .so-btn-add:hover {
          background: rgba(33,150,243,0.1);
          border-color: rgba(33,150,243,0.45);
        }

        /* ── Footer button styles ── */
        .so-btn-primary {
          flex: 1;
          padding: 10px;
          background: rgba(0,71,171,0.8);
          border: 1px solid rgba(33,150,243,0.3);
          border-radius: 8px;
          color: #fff;
          font-family: 'Exo 2', sans-serif;
          font-size: calc(11px * var(--font-scale, 1));
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: all 0.2s;
        }
        .so-btn-primary:hover {
          background: rgba(21,101,192,0.9);
          box-shadow: 0 4px 20px rgba(0,71,171,0.3);
        }
        .so-btn-primary:disabled {
          background: rgba(26,39,68,0.6);
          color: rgba(91,123,160,0.6);
          cursor: not-allowed;
          border-color: rgba(255,255,255,0.05);
          box-shadow: none;
        }
        .so-btn-ghost {
          padding: 10px 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          color: rgba(255,255,255,0.45);
          font-family: 'Exo 2', sans-serif;
          font-size: calc(11px * var(--font-scale, 1));
          cursor: pointer;
          transition: all 0.2s;
        }
        .so-btn-ghost:hover {
          background: rgba(255,255,255,0.06);
          color: #E8EFF8;
        }
        .so-btn-danger {
          padding: 10px 14px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          color: #f87171;
          font-family: 'Exo 2', sans-serif;
          font-size: calc(11px * var(--font-scale, 1));
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
        }
        .so-btn-danger:hover {
          background: rgba(239,68,68,0.16);
          border-color: rgba(239,68,68,0.5);
        }
        .so-btn-success {
          flex: 1;
          padding: 10px;
          background: rgba(16,185,129,0.15);
          border: 1px solid rgba(16,185,129,0.35);
          border-radius: 8px;
          color: #34d399;
          font-family: 'Exo 2', sans-serif;
          font-size: calc(11px * var(--font-scale, 1));
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
        }
        .so-btn-success:hover {
          background: rgba(16,185,129,0.25);
        }
        .so-btn-success:disabled {
          background: rgba(26,39,68,0.6);
          color: rgba(91,123,160,0.6);
          cursor: not-allowed;
          border-color: rgba(255,255,255,0.05);
        }
        .so-btn-warn {
          width: 100%;
          padding: 10px;
          background: rgba(245,158,11,0.08);
          border: 1px solid rgba(245,158,11,0.3);
          border-radius: 10px;
          color: #fbbf24;
          font-family: 'Exo 2', sans-serif;
          font-size: calc(11px * var(--font-scale, 1));
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
        }
        .so-btn-warn:hover {
          background: rgba(245,158,11,0.16);
          border-color: rgba(245,158,11,0.5);
        }

        @media (max-width: 767px) {
          .so-body {
            padding: 16px !important;
          }
        }
      `}</style>
    </>
  );
}
