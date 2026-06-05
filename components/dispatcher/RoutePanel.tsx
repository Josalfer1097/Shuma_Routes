'use client';

import { useEffect, useState, useMemo } from 'react';
import type { Route, Stop, Vehicle } from '@/types';
import { formatDuration, formatDistance } from '@/lib/osrm';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import SortableStop from './SortableStop';
import ConfirmationModal from './ConfirmationModal';

interface Props {
  routes: Route[];
  onShareRoute: (vehicleId: string) => void;
  onReoptimize?: (manualRoutes: Route[]) => void;
  allVehicles?: Vehicle[];
  hiddenRouteIds?: string[];
  onToggleRouteVisibility?: (vehicleId: string) => void;
  onReoptimizeSingle?: (vehicleId: string, stops: Stop[]) => void; // Para CAMBIO 4
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
  onToggleRouteVisibility,
  onReoptimizeSingle
}: Props) {
  const [expandedRoute, setExpandedRoute] = useState<string | null>(routes[0]?.vehicleId ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedRoutes, setEditedRoutes] = useState<Route[]>([]);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    fromRouteId: string;
    toRouteId: string;
    stopIndex: number;
    newIndex: number;
    stop?: Stop;
    haversineExtraKm: number;
    isRestrictedZone: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isEditing && routes.length > 0) {
      setEditedRoutes(JSON.parse(JSON.stringify(routes)));
      if (!expandedRoute) {
        setExpandedRoute(routes[0].vehicleId);
      }
    }
  }, [routes, isEditing]);

  const displayRoutes = isEditing ? editedRoutes : routes;

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
    const origin = `${route.depot.lat},${route.depot.lng}`;
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
      
      if (!isLastChunk) {
        chunkStops.pop(); 
      }

      let url = `https://www.google.com/maps/dir/?api=1&origin=${chunkOrigin}&destination=${chunkDestination}&travelmode=driving`;
      if (chunkStops.length > 0) {
        url += `&waypoints=${chunkStops.join('|')}`;
      }
      links.push(url);
    }
    return links;
  };

  // ────────────── DnD Logic ──────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string; // Could be a stopId or a containerId (route.vehicleId)

    // Find source route and stop
    let fromRouteId = '';
    let stopIndex = -1;
    let draggedStop: Stop | undefined;

    for (const route of editedRoutes) {
      const idx = route.stops.findIndex(s => s.address.id === activeId);
      if (idx !== -1) {
        fromRouteId = route.vehicleId;
        stopIndex = idx;
        draggedStop = route.stops[idx];
        break;
      }
    }

    if (!draggedStop) return;

    // Find target route and new index
    let toRouteId = '';
    let newIndex = -1;

    for (const route of editedRoutes) {
      if (route.vehicleId === overId) {
        toRouteId = route.vehicleId;
        newIndex = route.stops.length; // dropped on empty container
        break;
      }
      const idx = route.stops.findIndex(s => s.address.id === overId);
      if (idx !== -1) {
        toRouteId = route.vehicleId;
        newIndex = idx;
        break;
      }
    }

    if (!fromRouteId || !toRouteId) return;

    if (fromRouteId === toRouteId) {
      // Reordering within the same route
      if (stopIndex !== newIndex) {
        const newRoutes = [...editedRoutes];
        const routeIdx = newRoutes.findIndex(r => r.vehicleId === fromRouteId);
        const route = newRoutes[routeIdx];
        route.stops = arrayMove(route.stops, stopIndex, newIndex);
        recalculateRoute(route);
        setEditedRoutes(newRoutes);
        setHasUnsavedEdits(true);
      }
    } else {
      // Cross-list drag: Trigger Confirmation Modal
      const toRoute = editedRoutes.find(r => r.vehicleId === toRouteId);
      if (!toRoute) return;

      // Calculate Haversine impact
      // impact = distance(centroid to new stop) roughly, or just recalculate route and get diff
      const tempRoute = JSON.parse(JSON.stringify(toRoute));
      tempRoute.stops.splice(newIndex, 0, draggedStop);
      recalculateRoute(tempRoute);
      const extraDist = (tempRoute.totalDistance || 0) - (toRoute.totalDistance || 0);
      const extraKm = extraDist / 1000;

      // Check if restricted zone (Centro/Norte)
      const isCentroNorte = toRoute.zoneName?.includes('Centro') || toRoute.zoneName?.includes('Norte') || false;
      
      setModalState({
        isOpen: true,
        fromRouteId,
        toRouteId,
        stopIndex,
        newIndex,
        stop: draggedStop,
        haversineExtraKm: extraKm,
        isRestrictedZone: isCentroNorte
      });
    }
  };

  const handleModalConfirm = (reoptimize: boolean) => {
    if (!modalState || !modalState.stop) return;
    
    const newRoutes = [...editedRoutes];
    const fromIdx = newRoutes.findIndex(r => r.vehicleId === modalState.fromRouteId);
    const toIdx = newRoutes.findIndex(r => r.vehicleId === modalState.toRouteId);
    
    if (fromIdx !== -1 && toIdx !== -1) {
      newRoutes[fromIdx].stops.splice(modalState.stopIndex, 1);
      newRoutes[toIdx].stops.splice(modalState.newIndex, 0, modalState.stop);
      
      recalculateRoute(newRoutes[fromIdx]);
      recalculateRoute(newRoutes[toIdx]);
      
      setEditedRoutes(newRoutes);
      setHasUnsavedEdits(true);
      setModalState(null);

      if (reoptimize && onReoptimizeSingle) {
        onReoptimizeSingle(newRoutes[toIdx].vehicleId, newRoutes[toIdx].stops);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden relative">
      
      {/* HEADER */}
      <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/50 shrink-0 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          📍 Flota y Rutas Generadas
        </h2>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold border border-amber-500/30 transition-colors flex items-center gap-1.5"
            >
              ✎ Modo Edición
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setHasUnsavedEdits(false);
                  setEditedRoutes(JSON.parse(JSON.stringify(routes)));
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium border border-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setHasUnsavedEdits(false);
                  if (onReoptimize) onReoptimize(editedRoutes);
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold border border-blue-500 transition-colors shadow-md"
              >
                Reoptimizar todo
              </button>
            </>
          )}
        </div>
      </div>

      {hasUnsavedEdits && isEditing && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 p-3">
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

      {/* LISTA DE CHOFERES Y PARADAS */}
      <div className="flex-1 overflow-y-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <ul className="space-y-2 pb-10">
            {displayRoutes.map((route) => {
              const isExpanded = expandedRoute === route.vehicleId || isEditing; // auto-expand in edit mode
              const completed = route.stops.filter((s) => s.status === 'completed').length;
              
              const stopIds = route.stops.map(s => s.address.id);

              return (
                <li key={route.vehicleId} className="rounded-xl border border-slate-700 overflow-hidden bg-slate-800/20">
                  {/* HEADER DEL CHOFER */}
                  <button
                    onClick={() => setExpandedRoute(isExpanded ? null : route.vehicleId)}
                    className="w-full flex items-center gap-3 px-3 py-3 hover:bg-slate-700/40 transition-colors duration-150"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: route.color }} />
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
                    
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: route.stops.length > 0 ? `${(completed / route.stops.length) * 100}%` : '0%',
                            backgroundColor: route.color,
                          }}
                        />
                      </div>
                      {onToggleRouteVisibility && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onToggleRouteVisibility(route.vehicleId); }}
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

                  {/* LISTA DE PARADAS SORTABLE */}
                  {isExpanded && (
                    <div className="border-t border-slate-700">
                      <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
                        <ul className={`divide-y divide-slate-700/50 min-h-[40px] ${activeDragId && isEditing ? 'outline-dashed outline-2 outline-slate-600 outline-offset-[-2px] bg-slate-800/10' : ''}`}>
                          {route.stops.map((stop, idx) => (
                            <SortableStop
                              key={stop.address.id}
                              stop={stop}
                              routeColor={route.color}
                              isEditing={isEditing}
                              isFirst={idx === 0}
                              isLast={idx === route.stops.length - 1}
                              onMoveUp={() => {
                                const newRoutes = [...editedRoutes];
                                const routeIdx = newRoutes.findIndex(r => r.vehicleId === route.vehicleId);
                                newRoutes[routeIdx].stops = arrayMove(newRoutes[routeIdx].stops, idx, idx - 1);
                                recalculateRoute(newRoutes[routeIdx]);
                                setEditedRoutes(newRoutes);
                                setHasUnsavedEdits(true);
                              }}
                              onMoveDown={() => {
                                const newRoutes = [...editedRoutes];
                                const routeIdx = newRoutes.findIndex(r => r.vehicleId === route.vehicleId);
                                newRoutes[routeIdx].stops = arrayMove(newRoutes[routeIdx].stops, idx, idx + 1);
                                recalculateRoute(newRoutes[routeIdx]);
                                setEditedRoutes(newRoutes);
                                setHasUnsavedEdits(true);
                              }}
                            />
                          ))}
                        </ul>
                      </SortableContext>

                      {/* COMPARTIR */}
                      {!isEditing && (
                        <div className="p-3 border-t border-slate-700 bg-slate-800/50 flex flex-col gap-2">
                          <p className="text-xs font-bold text-slate-400 mb-1">🔗 Compartir ruta</p>
                          {generateGoogleMapsLinks(route).map((link, idx, arr) => {
                            const label = arr.length > 1 ? `Ruta parte ${idx + 1}/${arr.length}` : 'Abrir Ruta en Google Maps';
                            return (
                              <div key={idx} className="flex gap-2">
                                <a href={link} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 transition-all">
                                  📍 {label}
                                </a>
                                <a href={`https://wa.me/?text=${encodeURIComponent(`Tu ${label.toLowerCase()} de hoy: ${link}`)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center px-4 py-2 rounded-lg text-xs font-bold bg-green-600 hover:bg-green-500 text-white transition-all">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                  </svg>
                                </a>
                              </div>
                            );
                          })}
                          <button onClick={() => onShareRoute(route.vehicleId)} className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
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
        </DndContext>
      </div>

      <ConfirmationModal
        isOpen={modalState !== null}
        title={`Mover parada a ${allVehicles?.find(v => v.id === modalState?.toRouteId)?.driverName || 'nuevo chofer'}`}
        haversineExtraKm={modalState?.haversineExtraKm || 0}
        isRestrictedZone={modalState?.isRestrictedZone || false}
        onConfirm={handleModalConfirm}
        onCancel={() => setModalState(null)}
      />

    </div>
  );
}
