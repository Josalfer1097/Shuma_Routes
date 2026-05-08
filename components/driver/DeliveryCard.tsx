'use client';

import type { Stop } from '@/types';
import { formatDuration, formatDistance } from '@/lib/osrm';

interface Props {
  stop: Stop;
  routeColor: string;
  onComplete: (addressId: string) => void;
}

export default function DeliveryCard({ stop, routeColor, onComplete }: Props) {
  const isCompleted = stop.status === 'completed';

  const mapsUrl = stop.address.lat && stop.address.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${stop.address.lat},${stop.address.lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent(stop.address.raw)}`;

  return (
    <div
      className={`
        rounded-2xl border transition-all duration-300
        ${isCompleted
          ? 'bg-slate-800/30 border-slate-700/50 opacity-60'
          : 'bg-slate-800 border-slate-700 shadow-lg shadow-black/20'
        }
      `}
    >
      {/* Header con número de parada */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl text-sm font-bold shrink-0"
          style={{
            backgroundColor: isCompleted ? '#334155' : routeColor + '22',
            color: isCompleted ? '#64748b' : routeColor,
          }}
        >
          {isCompleted ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            stop.sequence
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold truncate ${isCompleted ? 'text-slate-500 line-through' : 'text-white'}`}>
            {stop.address.name}
          </h3>
          <p className="text-sm text-slate-400 truncate mt-0.5">{stop.address.raw}</p>
        </div>
      </div>

      {/* Meta info */}
      {(stop.eta !== undefined || stop.distance !== undefined) && (
        <div className="flex gap-3 px-4 pb-3">
          {stop.eta !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDuration(stop.eta)}
            </div>
          )}
          {stop.distance !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {formatDistance(stop.distance)}
            </div>
          )}
        </div>
      )}

      {/* Acciones */}
      {!isCompleted && (
        <div className="flex gap-2 p-4 pt-0">
          {/* Navegar */}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 flex-1 px-3 py-3 rounded-xl
                       bg-slate-700/50 hover:bg-slate-700 border border-slate-600
                       text-sm font-medium text-slate-300 transition-all duration-200 active:scale-95"
          >
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Navegar
          </a>

          {/* Marcar completado */}
          <button
            id={`btn-complete-${stop.address.id}`}
            onClick={() => onComplete(stop.address.id)}
            className="flex items-center justify-center gap-2 flex-1 px-3 py-3 rounded-xl
                       font-medium text-sm text-white transition-all duration-200 active:scale-95"
            style={{ backgroundColor: routeColor }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5 13l4 4L19 7" />
            </svg>
            Entregado
          </button>
        </div>
      )}

      {/* Badge completado */}
      {isCompleted && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-emerald-400 font-medium">Entrega completada</span>
          </div>
        </div>
      )}
    </div>
  );
}
