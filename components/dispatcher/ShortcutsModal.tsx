'use client';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Esc', description: 'Cerrar menús, búsqueda de mapa o el panel de nueva ruta' },
  { keys: 'F1 / Ctrl+F', description: 'Abrir/cerrar el buscador del mapa' },
  { keys: '?', description: 'Mostrar esta ventana de atajos' },
];

export default function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(5,12,26,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0A1628',
          border: '1px solid #112040',
          borderRadius: 12,
          padding: '20px 24px',
          minWidth: 320,
          maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          fontFamily: "'Exo 2', sans-serif",
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, color: '#E8EFF8', fontWeight: 700, margin: 0 }}>
            ⌨️ Atajos de teclado
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#5B7BA0', cursor: 'pointer', fontSize: 18 }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SHORTCUTS.map(s => (
            <div key={s.keys} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <kbd style={{
                background: 'rgba(33,150,243,0.1)',
                border: '1px solid rgba(33,150,243,0.3)',
                borderRadius: 6, padding: '3px 8px',
                fontSize: 12, color: '#5B9BD5', fontFamily: 'monospace',
                minWidth: 90, textAlign: 'center',
              }}>
                {s.keys}
              </kbd>
              <span style={{ fontSize: 12.5, color: '#9AAAC0' }}>{s.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
