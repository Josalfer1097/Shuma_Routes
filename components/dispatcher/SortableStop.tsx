import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Stop } from '@/types';

interface Props {
  stop: Stop;
  routeColor: string;
  isEditing: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  merchandiseValue?: number;
}

export default function SortableStop({ 
  stop, 
  routeColor, 
  isEditing,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  merchandiseValue
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: stop.address.id,
    data: { stop }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 px-3 py-2.5 ${isEditing ? 'bg-shuma-surface/30' : ''} ${isDragging ? 'shadow-xl bg-shuma-surface ring-2 ring-blue-500' : ''} rounded-lg`}
    >
      <div 
        {...attributes} 
        {...listeners}
        className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold shrink-0 mt-0.5 ${isEditing ? 'cursor-grab active:cursor-grabbing hover:scale-110 transition-transform' : ''}`}
        style={{ backgroundColor: routeColor + '33', color: routeColor }}
      >
        {isEditing ? '≡' : stop.sequence}
      </div>
      <div className="flex-1 min-w-0 pointer-events-none">
        <p className="text-xs font-medium text-shuma-text truncate">
          {stop.address.clientName 
            ? stop.address.clientName 
            : stop.address.invoice 
              ? `Factura: ${stop.address.invoice}` 
              : (stop.address.name && stop.address.name !== 'Sin nombre' 
                ? stop.address.name 
                : stop.address.raw.substring(0, 30) + '...')}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-shuma-muted truncate">{stop.address.raw}</p>
          {merchandiseValue !== undefined && merchandiseValue >= 10000 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
              💰 ALTO
            </span>
          )}
          {merchandiseValue !== undefined && merchandiseValue >= 5000 && merchandiseValue < 10000 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">
              💰 MED
            </span>
          )}
        </div>
      </div>

      {!isEditing && stop.status === 'completed' && (
        <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )}

      {isEditing && (
        <div className="flex flex-col gap-1 ml-2">
           <button 
             onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
             disabled={isFirst}
             className="text-[10px] text-shuma-muted hover:text-white disabled:opacity-30"
           >
             ▲
           </button>
           <button 
             onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
             disabled={isLast}
             className="text-[10px] text-shuma-muted hover:text-white disabled:opacity-30"
           >
             ▼
           </button>
        </div>
      )}
    </li>
  );
}
