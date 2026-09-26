'use client';

import { RefreshCw } from 'lucide-react';

/**
 * Ventana de carga que bloquea la pantalla durante una acción larga.
 * Mismo estilo que la del despachador al optimizar, para que todo el
 * sistema se sienta igual.
 */
export default function LoadingOverlay({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(5, 12, 26, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'all',
      }}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: 16,
          padding: '20px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <RefreshCw size={18} className="animate-spin" style={{ color: '#60a5fa', flexShrink: 0 }} />
        <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 500 }}>{message}</span>
      </div>
    </div>
  );
}
