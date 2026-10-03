'use client';

import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import FloatingWindow from './FloatingWindow';

/**
 * Ventana que contiene una página completa del sistema (Pendientes, Histórico, Dashboard).
 * La página se carga en un marco del mismo sitio: comparte la sesión y funciona igual que
 * abierta sola, sin reescribirla. El botón ↗ la abre en una pestaña aparte.
 */
export default function PageWindow({
  id, title, icon, src, onClose,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  src: string;
  onClose: () => void;
}) {
  return (
    <FloatingWindow
      id={id}
      title={title}
      icon={icon}
      defaultWidth={1000}
      defaultHeight={680}
      minWidth={420}
      onClose={onClose}
      headerExtra={
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded text-shuma-muted hover:text-white hover:bg-slate-800"
          title="Abrir en otra pestaña"
          aria-label="Abrir en otra pestaña"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      }
    >
      <iframe src={src} title={title} className="w-full h-full border-0 bg-shuma-bg block" />
    </FloatingWindow>
  );
}
