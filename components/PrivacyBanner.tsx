'use client';
import { useState, useEffect } from 'react';

export default function PrivacyBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('shuma_privacy_ack');
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem('shuma_privacy_ack', '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      zIndex: 9998,
      background: 'rgba(10,22,40,0.97)',
      borderTop: '0.5px solid rgba(33,150,243,0.25)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      padding: '14px 20px',
      display: 'flex', alignItems: 'center',
      gap: 16, flexWrap: 'wrap',
    }}>
      <p style={{
        flex: 1, minWidth: 240, margin: 0,
        fontSize: 12.5, lineHeight: 1.55,
        color: '#A8BFE0',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Este sistema utiliza datos de sesión para mantenerte
        autenticado y registrar la actividad operativa
        (entregas, rutas, evidencia fotográfica) conforme a
        las políticas internas de Grupo Shuma.
      </p>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={dismiss}
          style={{
            padding: '7px 20px', borderRadius: 9,
            background: 'linear-gradient(135deg, #1565C0, #2196F3)',
            border: 'none', color: 'white', cursor: 'pointer',
            fontFamily: "'Exo 2', sans-serif",
            fontSize: 12.5, fontWeight: 600,
          }}
        >
          Aceptar
        </button>
        <button
          onClick={dismiss}
          style={{
            padding: '7px 12px', borderRadius: 9,
            background: 'transparent',
            border: '0.5px solid rgba(91,123,160,0.4)',
            color: '#5B7BA0', cursor: 'pointer', fontSize: 13,
            lineHeight: 1,
          }}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
