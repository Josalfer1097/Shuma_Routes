'use client';

import { useEffect, useState } from 'react';
import type { Route, Stop } from '@/types';
import { formatDuration, formatDistance } from '@/lib/osrm';

interface Props {
  routes: Route[];
  onShareRoute: (vehicleId: string) => void;
}

export default function RoutePanel({ routes, onShareRoute }: Props) {
  const [expandedRoute, setExpandedRoute] = useState<string | null>(
    routes[0]?.vehicleId ?? null
  );

  // Auto-expand first route when routes change
  useEffect(() => {
    if (routes.length > 0 && !expandedRoute) {
      setExpandedRoute(routes[0].vehicleId);
    }
  }, [routes, expandedRoute]);

  if (routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">Las rutas optimizadas aparecerán aquí</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-slate-700/50 px-3 py-2 text-center">
          <p className="text-xl font-bold text-blue-400">{routes.length}</p>
          <p className="text-xs text-slate-500">rutas</p>
        </div>
        <div className="rounded-lg bg-slate-700/50 px-3 py-2 text-center">
          <p className="text-xl font-bold text-amber-400">
            {routes.reduce((acc, r) => acc + r.stops.length, 0)}
          </p>
          <p className="text-xs text-slate-500">paradas</p>
        </div>
      </div>

      {/* Lista de rutas por chofer */}
      <ul className="space-y-2">
        {routes.map((route) => {
          const isExpanded = expandedRoute === route.vehicleId;
          const completed = route.stops.filter((s) => s.status === 'completed').length;

          return (
            <li key={route.vehicleId} className="rounded-xl border border-slate-700 overflow-hidden">
              {/* Header del chofer */}
              <button
                onClick={() =>
                  setExpandedRoute(isExpanded ? null : route.vehicleId)
                }
                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-slate-700/40
                           transition-colors duration-150"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: route.color }}
                />
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-200">{route.driverName}</p>
                    {route.zoneName && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-300 border border-slate-600/50">
                        {route.zoneName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {route.stops.length} paradas
                    {route.totalDistance && ` · ${formatDistance(route.totalDistance)}`}
                    {route.totalDuration && ` · ${formatDuration(route.totalDuration)}`}
                  </p>
                </div>
                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(completed / route.stops.length) * 100}%`,
                        backgroundColor: route.color,
                      }}
                    />
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Paradas */}
              {isExpanded && (
                <div className="border-t border-slate-700">
                  <ul className="divide-y divide-slate-700/50">
                    {route.stops.map((stop: Stop) => (
                      <li
                        key={stop.address.id}
                        className="flex items-center gap-2 px-3 py-2.5"
                      >
                        <span
                          className="flex items-center justify-center w-5 h-5 rounded-full text-xs
                                     font-bold shrink-0"
                          style={{ backgroundColor: route.color + '33', color: route.color }}
                        >
                          {stop.sequence}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-300 truncate">
                            {stop.address.name}
                          </p>
                          <p className="text-xs text-slate-600 truncate">{stop.address.raw}</p>
                        </div>
                        {stop.status === 'completed' && (
                          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Botón compartir */}
                  <div className="p-2 border-t border-slate-700">
                    <button
                      onClick={() => onShareRoute(route.vehicleId)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                                 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10
                                 border border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-200"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                      </svg>
                      Compartir link con chofer
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
