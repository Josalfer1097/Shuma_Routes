'use client';

import { useWindowManager } from './WindowManager';

/**
 * Barra de tareas: un botón por ventana abierta.
 * Clic en una ventana minimizada o al fondo → la trae al frente; clic en la del frente → la minimiza.
 */
export default function Taskbar() {
  const manager = useWindowManager();
  if (!manager || manager.windows.length === 0) return null;

  const ordered = [...manager.windows].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <nav
      aria-label="Ventanas abiertas"
      // Abajo a la izquierda, sobre el mapa: al centro tapaba los botones del pie del panel lateral
      className="fixed bottom-3 left-3 flex items-center gap-1.5 px-2 py-1.5 rounded-2xl border border-shuma-border bg-slate-950/90 backdrop-blur shadow-2xl max-w-[calc(100vw-1.5rem)] overflow-x-auto"
      style={{ zIndex: 9960 }}
    >
      {ordered.map(w => {
        const active = !w.minimized && manager.isTop(w.id);
        return (
          <button
            key={w.id}
            onClick={() => {
              if (active) manager.setMinimized(w.id, true);
              else manager.focus(w.id);
            }}
            title={w.minimized ? 'Restaurar ' + w.title : active ? 'Minimizar ' + w.title : 'Traer al frente ' + w.title}
            className={'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-colors ' +
              (active
                ? 'bg-blue-600/30 text-white border border-blue-500/50'
                : w.minimized
                  ? 'text-shuma-muted hover:text-white hover:bg-slate-800 border border-transparent'
                  : 'text-slate-200 hover:bg-slate-800 border border-transparent')}
          >
            {w.icon && <span className="shrink-0">{w.icon}</span>}
            <span className="max-w-[140px] truncate">{w.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
