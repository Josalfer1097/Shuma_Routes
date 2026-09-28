'use client';

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';

/**
 * Lista de paradas de un chofer que acepta paradas arrastradas desde otra ruta.
 *
 * Antes cada ruta se registraba como destino de arrastre sin ningún elemento en pantalla
 * que la representara: solo funcionaba soltando la parada exactamente sobre otra parada.
 * Con esto, soltarla en cualquier parte de la lista del otro chofer la mueve al final.
 */
export default function DroppableRouteList({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <ul
      ref={setNodeRef}
      className={`${className ?? ''} ${isOver && !disabled ? 'ring-2 ring-inset ring-blue-500/60 bg-blue-500/5' : ''}`}
    >
      {children}
    </ul>
  );
}
