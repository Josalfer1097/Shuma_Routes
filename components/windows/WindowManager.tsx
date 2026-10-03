'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Administrador de ventanas flotantes del despachador.
 * Lleva el registro de qué ventanas están abiertas, cuál está al frente y cuáles
 * están minimizadas. La barra de tareas lee este registro.
 */
export interface WindowEntry {
  id: string;
  title: string;
  icon?: ReactNode;
  minimized: boolean;
  /** Orden de apilado: la más alta está al frente */
  order: number;
}

interface WindowManagerApi {
  windows: WindowEntry[];
  register: (id: string, title: string, icon?: ReactNode) => void;
  unregister: (id: string) => void;
  focus: (id: string) => void;
  setMinimized: (id: string, minimized: boolean) => void;
  isTop: (id: string) => boolean;
}

const WindowManagerContext = createContext<WindowManagerApi | null>(null);

export function useWindowManager(): WindowManagerApi | null {
  return useContext(WindowManagerContext);
}

/** Capa base de las ventanas: encima de paneles y mapa, debajo de vistas previas, avisos y cargas. */
export const WINDOW_Z_BASE = 9000;

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<WindowEntry[]>([]);

  const nextOrder = (list: WindowEntry[]) => list.reduce((m, w) => Math.max(m, w.order), 0) + 1;

  const register = useCallback((id: string, title: string, icon?: ReactNode) => {
    setWindows(prev => {
      const existing = prev.find(w => w.id === id);
      if (existing) {
        // Ya abierta: actualiza título y la trae al frente, restaurada
        return prev.map(w => (w.id === id ? { ...w, title, icon, minimized: false, order: nextOrder(prev) } : w));
      }
      return [...prev, { id, title, icon, minimized: false, order: nextOrder(prev) }];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  const focus = useCallback((id: string) => {
    setWindows(prev => {
      const top = prev.reduce((m, w) => Math.max(m, w.order), 0);
      const target = prev.find(w => w.id === id);
      if (!target || (target.order === top && !target.minimized)) return prev;
      return prev.map(w => (w.id === id ? { ...w, minimized: false, order: top + 1 } : w));
    });
  }, []);

  const setMinimized = useCallback((id: string, minimized: boolean) => {
    setWindows(prev => {
      const top = prev.reduce((m, w) => Math.max(m, w.order), 0);
      return prev.map(w => (w.id === id ? { ...w, minimized, order: minimized ? w.order : top + 1 } : w));
    });
  }, []);

  const isTop = useCallback((id: string) => {
    const visible = windows.filter(w => !w.minimized);
    if (visible.length === 0) return false;
    return visible.reduce((a, b) => (a.order > b.order ? a : b)).id === id;
  }, [windows]);

  const api = useMemo(() => ({ windows, register, unregister, focus, setMinimized, isTop }), [windows, register, unregister, focus, setMinimized, isTop]);

  return <WindowManagerContext.Provider value={api}>{children}</WindowManagerContext.Provider>;
}
