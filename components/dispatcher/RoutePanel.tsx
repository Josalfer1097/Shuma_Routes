'use client';

import { useEffect, useState } from 'react';
import type { Route, Stop, Vehicle } from '@/types';
import { formatDuration, formatDistance } from '@/lib/osrm';

interface Props {
  routes: Route[];
  onShareRoute: (vehicleId: string) => void;
  onReoptimize?: (manualRoutes: Route[]) => void;
  allVehicles?: Vehicle[];
  hiddenRouteIds?: string[];
  onToggleRouteVisibility?: (vehicleId: string) => void;
}

function getHaversineDistance(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function RoutePanel({ 
  routes, 
  onShareRoute, 
  onReoptimize, 
  allVehicles,
  hiddenRouteIds = [],
  onToggleRouteVisibility 
}: Props) {
  const [expandedRoute, setExpandedRoute] = useState<string | null>(routes[0]?.vehicleId ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedRoutes, setEditedRoutes] = useState<Route[]>([]);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);

  // Auto-expand first route when routes change
  useEffect(() => {
    if (!isEditing && routes.length > 0) {
      // Deep copy to allow editing without mutating original
      setEditedRoutes(JSON.parse(JSON.stringify(routes)));
      if (!expandedRoute) {
        setExpandedRoute(routes[0].vehicleId);
      }
    }
  }, [routes, isEditing]);

  const displayRoutes = isEditing ? editedRoutes : routes;

  const handleMoveStop = (routeId: string, stopIndex: number, direction: 'up' | 'down') => {
    const newRoutes = [...editedRoutes];
    const routeIndex = newRoutes.findIndex(r => r.vehicleId === routeId);
    if (routeIndex === -1) return;

    const route = newRoutes[routeIndex];
    if (direction === 'up' && stopIndex > 0) {
      const temp = route.stops[stopIndex];
      route.stops[stopIndex] = route.stops[stopIndex - 1];
      route.stops[stopIndex - 1] = temp;
    } else if (direction === 'down' && stopIndex < route.stops.length - 1) {
      const temp = route.stops[stopIndex];
      route.stops[stopIndex] = route.stops[stopIndex + 1];
      route.stops[stopIndex + 1] = temp;
    }

    recalculateRoute(route);
    setEditedRoutes(newRoutes);
    setHasUnsavedEdits(true);
  };

  const handleReassignStop = (fromRouteId: string, stopIndex: number, toRouteId: string) => {
    if (fromRouteId === toRouteId) return;

    const newRoutes = [...editedRoutes];
    const fromRouteIndex = newRoutes.findIndex(r => r.vehicleId === fromRouteId);
    const toRouteIndex = newRoutes.findIndex(r => r.vehicleId === toRouteId);
    if (fromRouteIndex === -1 || toRouteIndex === -1) return;

    const fromRoute = newRoutes[fromRouteIndex];
    const toRoute = newRoutes[toRouteIndex];

    const [stop] = fromRoute.stops.splice(stopIndex, 1);
    toRoute.stops.push(stop); // Add to end of new route

    recalculateRoute(fromRoute);
    recalculateRoute(toRoute);
    
    setEditedRoutes(newRoutes);
    setHasUnsavedEdits(true);
  };

  const recalculateRoute = (route: Route) => {
    let accumulatedDistance = 0;
    let accumulatedDuration = 0;
    let currentPos = { lat: route.depot.lat, lng: route.depot.lng };

    route.stops.forEach((stop, idx) => {
      stop.sequence = idx + 1;
      const dist = getHaversineDistance(currentPos, { lat: stop.address.lat!, lng: stop.address.lng! });
      const duration = (dist / 8.33) + 120; // 8.33 m/s + 2 mins service

      accumulatedDistance += dist;
      accumulatedDuration += duration;
      
      stop.distance = accumulatedDistance;
      stop.eta = accumulatedDuration;
      
      currentPos = { lat: stop.address.lat!, lng: stop.address.lng! };
    });

    const endDepot = route.endDepot ?? route.depot;
    const finalDist = getHaversineDistance(currentPos, { lat: endDepot.lat, lng: endDepot.lng });
    const finalDuration = finalDist / 8.33;

    route.totalDistance = accumulatedDistance + finalDist;
    route.totalDuration = accumulatedDuration + finalDuration;
  };

  const generateGoogleMapsLinks = (route: Route) => {
    // Origen: Bodega de salida
    const origin = `${route.depot.lat},${route.depot.lng}`;
    // Si no hay paradas, solo hay origen y destino (bodega de regreso)
    if (route.stops.length === 0) return [];

    const stops = route.stops.map(s => `${s.address.lat},${s.address.lng}`);
    const maxWaypoints = 9;
    const links: string[] = [];

    for (let i = 0; i < stops.length; i += maxWaypoints) {
      const isFirstChunk = i === 0;
      const isLastChunk = i + maxWaypoints >= stops.length;
      const chunkStops = stops.slice(i, i + maxWaypoints);
      
      const chunkOrigin = isFirstChunk ? origin : stops[i - 1];
      const chunkDestination = isLastChunk 
        ? ((route.endDepot ?? route.depot).lat + ',' + (route.endDepot ?? route.depot).lng) 
        : chunkStops[chunkStops.length - 1];
      
      // If the destination is part of the chunk, we pop it so it's not in waypoints
      if (!isLastChunk) {
        chunkStops.pop(); 
      }

      const waypoints = chunkStops.length > 0 ? `&waypoints=${chunkStops.join('|')}` : '';
      const url = `https://www.google.com/maps/dir/?api=1&origin=${chunkOrigin}&destination=${chunkDestination}${waypoints}&travelmode=driving`;
      links.push(url);
    }
    return links;
  };

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
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="rounded-lg bg-slate-700/50 px-3 py-2 text-center">
          <p className="text-xl font-bold text-blue-400">{displayRoutes.length}</p>
          <p className="text-xs text-slate-500">rutas</p>
        </div>
        <div className="rounded-lg bg-slate-700/50 px-3 py-2 text-center">
          <p className="text-xl font-bold text-amber-400">
            {displayRoutes.reduce((acc, r) => acc + r.stops.length, 0)}
          </p>
          <p className="text-xs text-slate-500">paradas</p>
        </div>
      </div>

      {/* Controles de edición */}
      {onReoptimize && (
        <div className="flex gap-2 mb-3">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium border border-slate-600 transition-colors"
            >
              ✏️ Editar Rutas Manualmente
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setHasUnsavedEdits(false);
                  setEditedRoutes(JSON.parse(JSON.stringify(routes)));
                }}
                className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium border border-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setHasUnsavedEdits(false);
                  if (onReoptimize) onReoptimize(editedRoutes);
                }}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold border border-blue-500 transition-colors shadow-md"
              >
                Reoptimizar con cambios
              </button>
            </>
          )}
        </div>
      )}

      {hasUnsavedEdits && isEditing && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3">
          <p className="text-xs text-yellow-400 font-medium mb-2 leading-relaxed">
            ⚠️ Distancias calculadas en línea recta. Presiona Reoptimizar para obtener tiempos reales por calles.
          </p>
          <button
            onClick={() => {
              setIsEditing(false);
              setHasUnsavedEdits(false);
              if (onReoptimize) onReoptimize(editedRoutes);
            }}
            className="w-full py-1.5 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 text-xs font-bold transition-colors border border-yellow-500/20"
          >
            Reoptimizar ahora
          </button>
        </div>
      )}

      {/* Lista de rutas por chofer */}
      <ul className="space-y-2">
        {displayRoutes.map((route) => {
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
                    {route.totalDistance !== undefined && ` · ${formatDistance(route.totalDistance)}`}
                    {route.totalDuration !== undefined && ` · ${formatDuration(route.totalDuration)}`}
                  </p>
                </div>
                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: route.stops.length > 0 ? `${(completed / route.stops.length) * 100}%` : '0%',
                        backgroundColor: route.color,
                      }}
                    />
                  </div>
                  
                  {/* Eye Toggle */}
                  {onToggleRouteVisibility && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleRouteVisibility(route.vehicleId);
                      }}
                      className="p-1 rounded-md hover:bg-slate-600 transition-colors ml-1"
                      title={hiddenRouteIds.includes(route.vehicleId) ? 'Mostrar ruta' : 'Ocultar ruta'}
                    >
                      {hiddenRouteIds.includes(route.vehicleId) ? '👁️‍🗨️' : '👁️'}
                    </button>
                  )}

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
                    {route.stops.map((stop: Stop, idx: number) => (
                      <li
                        key={stop.address.id}
                        className={`flex items-start gap-2 px-3 py-2.5 ${isEditing ? 'bg-slate-800/30' : ''}`}
                      >
                        <span
                          className="flex items-center justify-center w-5 h-5 rounded-full text-xs
                                     font-bold shrink-0 mt-0.5"
                          style={{ backgroundColor: route.color + '33', color: route.color }}
                        >
                          {stop.sequence}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-300 truncate">
                            {stop.address.name}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">{stop.address.raw}</p>
                          
                          {/* Controles de edición */}
                          {isEditing && (
                            <div className="mt-2 flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-md border border-slate-700/50">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleMoveStop(route.vehicleId, idx, 'up'); }}
                                disabled={idx === 0}
                                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 transition-colors"
                                title="Subir parada"
                              >
                                ⬆️
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleMoveStop(route.vehicleId, idx, 'down'); }}
                                disabled={idx === route.stops.length - 1}
                                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 transition-colors"
                                title="Bajar parada"
                              >
                                ⬇️
                              </button>
                              <div className="h-4 w-px bg-slate-700 mx-1"></div>
                              <select
                                className="bg-slate-800 text-[10px] text-slate-300 border border-slate-600 rounded px-1 py-0.5 outline-none flex-1"
                                value={route.vehicleId}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleReassignStop(route.vehicleId, idx, e.target.value);
                                }}
                              >
                                {displayRoutes.map(r => (
                                  <option key={r.vehicleId} value={r.vehicleId}>
                                    Mover a: {r.driverName}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        {!isEditing && stop.status === 'completed' && (
                          <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Botones de Compartir */}
                  {!isEditing && (
                    <div className="p-3 border-t border-slate-700 bg-slate-800/50 flex flex-col gap-2">
                      <p className="text-xs font-bold text-slate-400 mb-1">🔗 Compartir ruta ({route.stops.length} paradas)</p>
                      
                      {generateGoogleMapsLinks(route).map((link, idx, arr) => {
                        const label = arr.length > 1 ? `Ruta parte ${idx + 1}/${arr.length}` : 'Abrir Ruta Completa en Google Maps';
                        return (
                          <div key={idx} className="flex gap-2">
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                                         text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white
                                         border border-slate-600 transition-all duration-200"
                            >
                              📍 {label}
                            </a>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`Tu ${label.toLowerCase()} de hoy: ${link}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center px-4 py-2 rounded-lg
                                         text-xs font-bold bg-green-600 hover:bg-green-500 text-white
                                         transition-all duration-200"
                              title="Enviar por WhatsApp"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                              </svg>
                            </a>
                          </div>
                        );
                      })}
                      
                      <button
                        onClick={() => onShareRoute(route.vehicleId)}
                        className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                                   text-[10px] font-medium text-slate-400 hover:text-white hover:bg-slate-700
                                   transition-all duration-200"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                        </svg>
                        Compartir portal Web de Chofer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
