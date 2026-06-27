'use client';

import type { Stop, Route } from '@/types';
import DeliveryCard from './DeliveryCard';
import { formatDuration, formatDistance } from '@/lib/osrm';

interface Props {
  route: Route;
  stops: Stop[];
  onComplete: (addressId: string) => void;
}

export default function StopList({ route, stops, onComplete }: Props) {
  const completedCount = stops.filter((s) => s.status === 'completed').length;
  const totalCount = stops.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allDone = completedCount === totalCount;

  return (
    <div className="space-y-4">
      {/* Header de progreso */}
      <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Tu ruta</p>
            <h2 className="text-lg font-bold text-white mt-0.5">{route.driverName}</h2>
          </div>
          <div className="text-right">
            <p
              className="text-3xl font-bold"
              style={{ color: route.color }}
            >
              {completedCount}
              <span className="text-lg text-slate-500">/{totalCount}</span>
            </p>
            <p className="text-xs text-slate-500">entregas</p>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%`, backgroundColor: route.color }}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {route.totalDistance && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              <span className="text-sm text-slate-300">{formatDistance(route.totalDistance)}</span>
            </div>
          )}
          {route.totalDuration && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-slate-300">{formatDuration(route.totalDuration)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Mensaje de completado */}
      {allDone && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="text-lg font-bold text-emerald-400">¡Ruta completada!</h3>
          <p className="text-sm text-slate-400 mt-1">
            Todas las entregas han sido marcadas
          </p>
        </div>
      )}

      {/* Lista de entregas */}
      <div className="space-y-3">
        {stops.map((stop) => (
          <DeliveryCard
            key={stop.address.id}
            stop={stop}
            routeColor={route.color}
            onComplete={onComplete}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="py-4 text-center">
        <p className="text-xs text-slate-600">Shuma Rutas · Optimizado con Google Maps</p>
      </div>
    </div>
  );
}
