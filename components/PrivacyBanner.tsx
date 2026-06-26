'use client';
import { useState, useEffect } from 'react';

export default function PrivacyBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Usar localStorage en lugar de sessionStorage
    // para que no reaparezca en cada nueva pestaña/sesión
    try {
      const consent = localStorage.getItem('shuma_privacy_consent');
      if (!consent) setVisible(true);
      else {
        // Re-mostrar si han pasado más de 180 días
        const ts = parseInt(consent);
        const daysSince = (Date.now() - ts) / (1000 * 60 * 60 * 24);
        if (daysSince > 30) {
          localStorage.removeItem('shuma_privacy_consent');
          setVisible(true);
        }
      }
    } catch {
      // Si localStorage no está disponible, no mostrar
      setVisible(false);
    }
  }, []);

  const accept = (type: 'all' | 'essential') => {
    try {
      localStorage.setItem('shuma_privacy_consent', String(Date.now()));
      // Registrar en audit_log de forma silenciosa
      fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: type === 'all' ? 'Cookies aceptadas (todas)' : 'Cookies aceptadas (esenciales)',
          entity: 'privacy',
          entity_id: null,
          user_name: 'anonymous',
          user_role: 'unknown',
          module: 'Privacidad',
          metadata: { consent_type: type, timestamp: new Date().toISOString() },
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de privacidad"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 9998,
        background: 'rgba(10,22,40,0.97)',
        borderTop: '1px solid rgba(33,150,243,0.2)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center',
        gap: 16, flexWrap: 'wrap' as const,
        animation: 'bannerSlideUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
      }}
    >
      <style>{`
        @keyframes bannerSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Ícono escudo */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: 'rgba(33,150,243,0.1)',
        border: '1px solid rgba(33,150,243,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="rgba(33,150,243,0.8)" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>

      <p style={{
        flex: 1, minWidth: 220, margin: 0,
        fontSize: 12, lineHeight: 1.5,
        color: '#A8BFE0',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Este sistema usa datos de sesión para autenticación y registro operativo.{' '}
        <button
          onClick={() => {
            // Modal informativo simple
            alert(
              'Shuma Rutas registra:\n\n' +
              '• Sesión de usuario (autenticación)\n' +
              '• Rutas y entregas realizadas\n' +
              '• Evidencia fotográfica de entregas\n' +
              '• Bitácora de acciones (audit log)\n\n' +
              'Conforme a políticas internas de Grupo Shuma.\n' +
              'Los datos no se comparten con terceros.'
            );
          }}
          style={{
            color: '#2196F3', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 12, padding: 0,
            textDecoration: 'underline', fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Ver política completa
        </button>
      </p>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => accept('essential')}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && accept('essential')}
          tabIndex={0}
          style={{
            padding: '7px 14px', borderRadius: 9,
            background: 'transparent',
            border: '1px solid rgba(91,123,160,0.35)',
            color: '#5B7BA0', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12, fontWeight: 500,
          }}
        >
          Solo esenciales
        </button>
        <button
          onClick={() => accept('all')}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && accept('all')}
          tabIndex={0}
          style={{
            padding: '7px 18px', borderRadius: 9,
            background: 'linear-gradient(135deg, #1565C0, #2196F3)',
            border: 'none', color: 'white', cursor: 'pointer',
            fontFamily: "'Exo 2', sans-serif",
            fontSize: 12, fontWeight: 600,
          }}
        >
          Aceptar todo
        </button>
      </div>
    </div>
  );
}
