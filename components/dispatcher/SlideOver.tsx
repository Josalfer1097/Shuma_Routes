'use client';

import { useEffect, useRef } from 'react';

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Panel width on desktop. Defaults to 440. Mobile always 100vw. */
  width?: number;
}

export default function SlideOver({
  isOpen,
  onClose,
  title,
  children,
  footer,
  width = 440,
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
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5,12,26,0.7)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* ── Panel ─────────────────────────────────────── */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100vw' : `${width}px`,
          maxWidth: '100vw',
          background: '#0A1628',
          borderLeft: '1px solid #112040',
          zIndex: 41,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* ── Panel header ── */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #112040',
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
              background: 'transparent',
              border: '1px solid #112040',
              borderRadius: 6,
              color: '#5B7BA0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'border-color 0.2s, color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#EF4444';
              e.currentTarget.style.color = '#EF4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#112040';
              e.currentTarget.style.color = '#5B7BA0';
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
            overflowY: 'auto',
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
              borderTop: '1px solid #112040',
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
          width: 4px;
        }
        .so-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .so-body::-webkit-scrollbar-thumb {
          background: #112040;
          border-radius: 999px;
        }

        /* ── Section titles inside slide-over ── */
        .so-section {
          margin-bottom: 24px;
        }
        .so-section-title {
          font-family: 'Exo 2', sans-serif;
          font-size: 10px;
          letter-spacing: 0.16em;
          color: #2a4060;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        /* ── Field styles ── */
        .so-label {
          font-size: 11px;
          color: #5B7BA0;
          margin-bottom: 5px;
          display: block;
        }
        .so-input {
          width: 100%;
          background: #060F1D;
          border: 1px solid #0d1f3a;
          border-radius: 8px;
          padding: 9px 12px;
          color: #E8EFF8;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.2s;
        }
        .so-input:focus {
          border-color: #2196F3;
        }
        .so-select {
          width: 100%;
          background: #060F1D;
          border: 1px solid #0d1f3a;
          border-radius: 8px;
          padding: 9px 12px;
          color: #E8EFF8;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.2s;
          appearance: none;
        }
        .so-select:focus {
          border-color: #2196F3;
        }

        /* ── Footer button styles ── */
        .so-btn-primary {
          flex: 1;
          padding: 10px;
          background: #0047AB;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-family: 'Exo 2', sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s;
        }
        .so-btn-primary:hover {
          background: #1565C0;
        }
        .so-btn-primary:disabled {
          background: #1a2744;
          color: #5B7BA0;
          cursor: not-allowed;
        }
        .so-btn-ghost {
          padding: 10px 14px;
          background: transparent;
          border: 1px solid #112040;
          border-radius: 8px;
          color: #5B7BA0;
          font-family: 'Exo 2', sans-serif;
          font-size: 11px;
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .so-btn-ghost:hover {
          border-color: #5B7BA0;
          color: #E8EFF8;
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
