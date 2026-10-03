'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { WINDOW_Z_BASE, useWindowManager } from './WindowManager';

interface Geometry { x: number; y: number; w: number; h: number; maximized: boolean }

interface Props {
  /** Identificador estable: con él se recuerda la posición y el tamaño */
  id: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  onClose: () => void;
  /** Botones extra en la barra de título (antes de minimizar) */
  headerExtra?: ReactNode;
  children: ReactNode;
}

const STORAGE_PREFIX = 'shuma_window_';
const TASKBAR_SPACE = 64;   // espacio reservado abajo para la barra de tareas
const MOBILE_MAX = 768;

function clamp(g: Geometry, minW: number, minH: number): Geometry {
  const vw = window.innerWidth;
  const vh = window.innerHeight - TASKBAR_SPACE;
  const w = Math.min(Math.max(g.w, minW), vw - 16);
  const h = Math.min(Math.max(g.h, minH), vh - 16);
  // La barra de título siempre queda visible: nunca se pierde una ventana fuera de la pantalla
  const x = Math.min(Math.max(g.x, 8 - w + 120), vw - 120);
  const y = Math.min(Math.max(g.y, 8), vh - 48);
  return { ...g, x, y, w, h };
}

function loadGeometry(id: string, dw: number, dh: number, minW: number, minH: number): Geometry {
  const fallback: Geometry = {
    w: dw, h: dh,
    x: Math.round((window.innerWidth - dw) / 2),
    y: Math.round(Math.max(16, (window.innerHeight - TASKBAR_SPACE - dh) / 2)),
    maximized: false,
  };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (raw) return clamp({ ...fallback, ...(JSON.parse(raw) as Partial<Geometry>) }, minW, minH);
  } catch {
    // Sin almacenamiento disponible: se usa la posición central
  }
  return clamp(fallback, minW, minH);
}

/**
 * Ventana flotante del despachador: se mueve arrastrando la barra de título, cambia de tamaño
 * desde la esquina inferior derecha (mouse o dedo), se minimiza a la barra de tareas sin perder
 * su estado, se maximiza (también con doble clic en la barra) y recuerda posición y tamaño.
 * En pantallas angostas se abre a pantalla completa.
 */
export default function FloatingWindow({
  id, title, subtitle, icon,
  defaultWidth = 680, defaultHeight = 560, minWidth = 360, minHeight = 260,
  onClose, headerExtra, children,
}: Props) {
  const manager = useWindowManager();
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Geometry } | null>(null);

  // Posición inicial (solo en el navegador) y registro en la barra de tareas
  useEffect(() => {
    setGeo(loadGeometry(id, defaultWidth, defaultHeight, minWidth, minHeight));
    setIsMobile(window.innerWidth < MOBILE_MAX);
  }, [id, defaultWidth, defaultHeight, minWidth, minHeight]);

  useEffect(() => {
    manager?.register(id, title, icon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, title]);

  useEffect(() => {
    return () => manager?.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Si cambia el tamaño de la pantalla, la ventana se reacomoda para no quedar fuera
  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < MOBILE_MAX);
      setGeo(g => (g ? clamp(g, minWidth, minHeight) : g));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [minWidth, minHeight]);

  const save = useCallback((g: Geometry) => {
    try { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(g)); } catch { /* sin almacenamiento */ }
  }, [id]);

  const entry = manager?.windows.find(w => w.id === id);
  const minimized = entry?.minimized ?? false;
  const order = entry?.order ?? 1;
  const isTop = manager ? manager.isTop(id) : true;

  // Esc cierra solo la ventana que está al frente
  useEffect(() => {
    if (!isTop || minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Si hay una vista previa abierta encima, ella atiende el Esc
      if (document.querySelector('[data-overlay-top="true"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isTop, minimized, onClose]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const next = d.mode === 'move'
      ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy }
      : { ...d.start, w: d.start.w + dx, h: d.start.h + dy };
    setGeo(clamp(next, minWidth, minHeight));
  }, [minWidth, minHeight]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.body.style.userSelect = '';
    document.body.classList.remove('window-dragging');
    setGeo(g => { if (g) save(g); return g; });
  }, [onPointerMove, save]);

  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (!geo || geo.maximized || isMobile) return;
    // Los botones de la barra de título no inician arrastre
    if (mode === 'move' && (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, start: geo };
    document.body.style.userSelect = 'none';
    document.body.classList.add('window-dragging');
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  useEffect(() => () => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove, onPointerUp]);

  const toggleMaximize = () => {
    setGeo(g => {
      if (!g) return g;
      const next = { ...g, maximized: !g.maximized };
      save(next);
      return next;
    });
  };

  if (!geo) return null;

  const full = isMobile || geo.maximized;
  const style: React.CSSProperties = full
    ? { left: 8, top: 8, width: 'calc(100vw - 16px)', height: 'calc(100vh - ' + (TASKBAR_SPACE + 8) + 'px)' }
    : { left: geo.x, top: geo.y, width: geo.w, height: geo.h };

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      onPointerDownCapture={() => manager?.focus(id)}
      className={'fixed flex flex-col rounded-xl border bg-slate-950/95 backdrop-blur shadow-2xl overflow-hidden ' +
        (isTop ? 'border-blue-500/40' : 'border-shuma-border')}
      style={{ ...style, zIndex: WINDOW_Z_BASE + order, display: minimized ? 'none' : 'flex', touchAction: 'none' }}
    >
      {/* Barra de título: arrastrar para mover, doble clic para maximizar */}
      <div
        onPointerDown={startDrag('move')}
        onDoubleClick={() => { if (!isMobile) toggleMaximize(); }}
        className={'flex items-center gap-2 px-3 py-2 border-b border-shuma-border select-none shrink-0 ' +
          (full ? '' : 'cursor-move ') + (isTop ? 'bg-slate-900' : 'bg-slate-900/60')}
      >
        {icon && <span className="shrink-0 text-amber-300">{icon}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-shuma-muted truncate">{subtitle}</p>}
        </div>
        {headerExtra}
        {manager && (
          <button onClick={() => manager.setMinimized(id, true)} className="p-1 rounded text-shuma-muted hover:text-white hover:bg-slate-800" aria-label="Minimizar" title="Minimizar">
            <Minus className="w-4 h-4" />
          </button>
        )}
        {!isMobile && (
          <button onClick={toggleMaximize} className="p-1 rounded text-shuma-muted hover:text-white hover:bg-slate-800" aria-label={geo.maximized ? 'Restaurar' : 'Maximizar'} title={geo.maximized ? 'Restaurar' : 'Maximizar'}>
            {geo.maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}
        <button onClick={onClose} className="p-1 rounded text-shuma-muted hover:text-white hover:bg-red-600/60" aria-label="Cerrar" title="Cerrar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto" style={{ touchAction: 'auto' }}>{children}</div>

      {/* Esquina para cambiar el tamaño */}
      {!full && (
        <div
          onPointerDown={startDrag('resize')}
          className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize"
          style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(148,163,184,0.45) 50%)' }}
          aria-hidden="true"
        />
      )}
    </div>,
    document.body
  );
}
