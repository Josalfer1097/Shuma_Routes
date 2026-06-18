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
  globalDepartureTime?: string;
  onVehicleTimeChange?: (vehicleId: string, timeStr: string) => void;
  deadlineTime?: string;
  unloadConfig?: import('@/types').UnloadConfig;
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
  onReoptimizeSingle,
  globalDepartureTime = '08:00',
  onVehicleTimeChange,
  deadlineTime = '17:45',
  unloadConfig
}: Props) {
  const [expandedRoute, setExpandedRoute] = useState<string | null>(routes[0]?.vehicleId ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedRoutes, setEditedRoutes] = useState<Route[]>([]);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [metricsModalRouteId, setMetricsModalRouteId] = useState<string | null>(null);

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

  const generateWhatsAppMessage = (route: Route, links: string[]) => {
    let msg = `*Ruta asignada: ${route.driverName}*\n`;
    msg += `Paradas: ${route.stops.length}\n`;
    msg += `Distancia: ${route.totalDistance ? (route.totalDistance / 1000).toFixed(1) : 0} km\n`;
    msg += `Tiempo est.: ${route.totalDuration ? Math.round(route.totalDuration / 60) : 0} min\n\n`;

    msg += `*Detalle de entregas:*\n`;
    route.stops.forEach((stop, idx) => {
      msg += `${idx + 1}. ${stop.address.clientName || stop.address.name}`;
      if (stop.address.invoice) msg += ` (Factura: ${stop.address.invoice})`;
      if (stop.address.merchandiseValue) msg += ` 💰 $${stop.address.merchandiseValue.toLocaleString('es-MX')}`;
      msg += '\n';
    });

    msg += `\n*Enlaces de navegación (Google Maps):*\n`;
    links.forEach((link, idx) => {
      const label = links.length > 1 ? `Parte ${idx + 1}/${links.length}` : 'Ruta completa';
      msg += `📍 ${label}: ${link}\n`;
    });

    return encodeURIComponent(msg);
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
    <div className="flex flex-col h-full bg-shuma-bg rounded-2xl border border-shuma-border shadow-2xl overflow-hidden relative">
      
      {/* HEADER */}
      <div className="px-4 py-3 border-b border-shuma-border bg-shuma-surface shrink-0 flex items-center justify-between">
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
                className="px-3 py-1.5 rounded-lg bg-shuma-surface hover:bg-shuma-border text-shuma-text text-xs font-medium border border-shuma-border transition-colors"
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
        <div style={{ borderBottom: '1px solid rgba(245,158,11,0.2)', padding: '10px 12px', background: 'rgba(245,158,11,0.05)' }}>
          <p style={{ fontSize: 11, color: '#fbbf24', marginBottom: 8, lineHeight: 1.4 }}>
            ⚠️ Tienes cambios sin aplicar. Elige cómo confirmar el orden:
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {/* MI ORDEN — no llama a Google */}
            <button
              title="Mantiene exactamente el orden que arrastraste. No llama a Google."
              onClick={() => {
                // Reasignar sequence según posición actual y recalcular distancias sin Google
                const newRoutes = editedRoutes.map(route => {
                  const updatedStops = route.stops.map((s, i) => ({ ...s, sequence: i + 1 }));
                  const updatedRoute = { ...route, stops: updatedStops };
                  recalculateRoute(updatedRoute);
                  return updatedRoute;
                });
                setEditedRoutes(newRoutes);
                setHasUnsavedEdits(false);
                setIsEditing(false);
                // Propagar al estado global
                if (onReoptimize) onReoptimize(newRoutes);
              }}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(34,197,94,0.12)',
                border: '2px solid rgba(34,197,94,0.4)',
                color: '#22c55e', fontSize: 11, fontWeight: 700,
                fontFamily: "'Exo 2', sans-serif",
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.22)'; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.7)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.12)'; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)'; }}
            >
              <span style={{ fontSize: 14 }}>✋</span>
              <span>Mi orden</span>
              <span style={{ fontSize: 9, color: '#86efac', fontWeight: 400 }}>Sin Google</span>
            </button>

            {/* GOOGLE OPTIMIZA — llama a la API */}
            <button
              title="Google reordena las paradas para minimizar tiempo y distancia total."
              onClick={() => {
                setIsEditing(false);
                setHasUnsavedEdits(false);
                if (onReoptimize) onReoptimize(editedRoutes);
              }}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(33,150,243,0.12)',
                border: '2px solid rgba(33,150,243,0.4)',
                color: '#60a5fa', fontSize: 11, fontWeight: 700,
                fontFamily: "'Exo 2', sans-serif",
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(33,150,243,0.22)'; e.currentTarget.style.borderColor = 'rgba(33,150,243,0.7)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(33,150,243,0.12)'; e.currentTarget.style.borderColor = 'rgba(33,150,243,0.4)'; }}
            >
              <span style={{ fontSize: 14 }}>⚡</span>
              <span>Google</span>
              <span style={{ fontSize: 9, color: '#93c5fd', fontWeight: 400 }}>Reordena</span>
            </button>
          </div>
        </div>
      )}

      {/* LISTA DE CHOFERES Y PARADAS */}
      <div className="flex-1 overflow-y-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <ul className="space-y-2 pb-10">
            {displayRoutes.map((route) => {
              const isExpanded = isEditing ? true : expandedRoute === route.vehicleId;
              const completed = route.stops.filter((s) => s.status === 'completed').length;
              
              const stopIds = route.stops.map(s => s.address.id);

              return (
                <li key={route.vehicleId} className="rounded-xl border border-shuma-border overflow-hidden bg-shuma-surface/20">
                  {/* HEADER DEL CHOFER */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!isEditing) setExpandedRoute(isExpanded ? null : route.vehicleId);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 hover:bg-shuma-border/40 transition-colors duration-150 cursor-pointer text-left focus:outline-none"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: route.color }} />
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-shuma-text">{route.driverName}</p>
                        {route.zoneName && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-shuma-surface/50 text-shuma-text border border-shuma-border/50">
                            {route.zoneName}
                          </span>
                        )}
                        {(() => {
                          const routeDepTimeStr = route.departureTime || globalDepartureTime || '08:00';
                          const [h, m] = routeDepTimeStr.split(':').map(Number);
                          const routeDuration = route.totalDuration || 0; // en segundos
                          const returnTotalMins = (h * 60 + m) + Math.round(routeDuration / 60);
                          
                          const [dHour, dMin] = deadlineTime.split(':').map(Number);
                          const deadlineMins = dHour * 60 + dMin;

                          let status: 'ok' | 'warning' | 'critical' = 'ok';
                          if (returnTotalMins > deadlineMins) status = 'critical';
                          else if (returnTotalMins > deadlineMins - 30) status = 'warning';

                          const retH = Math.floor(returnTotalMins / 60) % 24;
                          const retM = returnTotalMins % 60;
                          const estimatedReturn = `${retH.toString().padStart(2, '0')}:${retM.toString().padStart(2, '0')}`;
                          
                          let semaforo = '🟢';
                          let textClass = 'text-emerald-400';
                          if (status === 'warning') { semaforo = '🟡'; textClass = 'text-amber-400'; }
                          else if (status === 'critical') { semaforo = '🔴'; textClass = 'text-red-400'; }

                          return (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium bg-shuma-surface/50 border border-shuma-border/50 ${textClass}`}>
                              {semaforo} Regreso est: {estimatedReturn}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xs text-shuma-muted">
                          {route.stops.length} paradas
                          {route.totalDistance !== undefined && ` · ${formatDistance(route.totalDistance)}`}
                          {route.totalDuration !== undefined && ` · ${formatDuration(route.totalDuration)}`}
                        </p>
                        
                        {/* INPUT HORA DE SALIDA */}
                        <div 
                          className="flex flex-col items-start gap-0.5"
                          onClick={(e) => e.stopPropagation()} // Prevenir expansión al hacer click en el input
                        >
                          <div className="flex items-center gap-1">
                            {(() => {
                              const now = new Date();
                              const currentMins = now.getHours() * 60 + now.getMinutes();
                              const [h, m] = (route.departureTime || globalDepartureTime || '08:00').split(':').map(Number);
                              const targetMins = (h || 0) * 60 + (m || 0);
                              const isPast = targetMins < currentMins;
                              return (
                                <>
                                  <svg className={`w-3.5 h-3.5 ${isPast ? 'text-red-400' : route.departureTime ? 'text-blue-400' : 'text-shuma-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <input
                                    type="time"
                                    value={route.departureTime || globalDepartureTime}
                                    onChange={(e) => {
                                      if (onVehicleTimeChange) onVehicleTimeChange(route.vehicleId, e.target.value);
                                    }}
                                    className={`bg-transparent ${isPast ? 'border border-red-500 rounded px-1' : 'border-none p-0'} text-xs font-medium focus:ring-0 ${
                                      isPast ? 'text-red-400' : route.departureTime ? 'text-blue-400' : 'text-shuma-muted'
                                    }`}
                                  />
                                </>
                              );
                            })()}
                          </div>
                          {(() => {
                            const now = new Date();
                            const currentMins = now.getHours() * 60 + now.getMinutes();
                            const [h, m] = (route.departureTime || globalDepartureTime || '08:00').split(':').map(Number);
                            const targetMins = (h || 0) * 60 + (m || 0);
                            return targetMins < currentMins ? (
                              <span className="text-[9px] text-red-500 ml-4 font-medium">⚠️ Esta hora ya pasó</span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                      <div className="w-16 h-1.5 bg-shuma-surface rounded-full overflow-hidden hidden sm:block">
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
                          title={hiddenRouteIds.includes(route.vehicleId) ? 'Mostrar ruta' : 'Ocultar ruta'}
                          style={{
                            width: 32, height: 32,
                            background: '#0A1628',
                            border: '1px solid #112040',
                            borderRadius: 8,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 15,
                            flexShrink: 0
                          }}
                        >
                          {hiddenRouteIds.includes(route.vehicleId) ? '👁️‍🗨️' : '👁️'}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setMetricsModalRouteId(route.vehicleId); }}
                        title="Ver análisis de ruta"
                        style={{
                          width: 32, height: 32,
                          background: '#0A1628',
                          border: '1px solid #112040',
                          borderRadius: 8,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 15,
                          flexShrink: 0
                        }}
                      >
                        📊
                      </button>
                      <span style={{ color:'#5B7BA0', fontSize:12, flexShrink:0, transition:'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </div>
                  </div>

                  {/* LISTA DE PARADAS SORTABLE */}
                  {isExpanded && (
                    <div className="border-t border-shuma-border">
                      <SortableContext items={[route.vehicleId, ...stopIds]} strategy={verticalListSortingStrategy}>
                        <ul className={`divide-y divide-slate-700/50 min-h-[40px] ${activeDragId && isEditing ? 'outline-dashed outline-2 outline-shuma-border outline-offset-[-2px] bg-shuma-surface/10' : ''}`}>
                          {route.stops.map((stop, idx) => (
                            <SortableStop
                              key={stop.address.id}
                              stop={stop}
                              routeColor={route.color}
                              isEditing={isEditing}
                              isFirst={idx === 0}
                              isLast={idx === route.stops.length - 1}
                              merchandiseValue={stop.address.merchandiseValue}
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

                      {/* BOTONES DE REOPTIMIZACIÓN INDIVIDUAL (MODO EDICIÓN) */}
                      {isEditing && (
                        <div className="p-3 border-t border-shuma-border bg-shuma-surface flex justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const newRoutes = [...editedRoutes];
                              const routeIdx = newRoutes.findIndex(r => r.vehicleId === route.vehicleId);
                              recalculateRoute(newRoutes[routeIdx]);
                              setEditedRoutes(newRoutes);
                              setHasUnsavedEdits(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-shuma-surface hover:bg-shuma-border text-shuma-text text-xs font-bold border border-shuma-border transition-colors flex items-center gap-1.5"
                          >
                            ✓ Mi orden
                          </button>
                          {onReoptimizeSingle && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReoptimizeSingle(route.vehicleId, route.stops);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-bold border border-blue-500/30 transition-colors flex items-center gap-1.5"
                            >
                              ⚡ Google
                            </button>
                          )}
                        </div>
                      )}

                      {/* COMPARTIR */}
                      {!isEditing && (
                        <div className="p-3 border-t border-shuma-border bg-shuma-surface flex flex-col gap-2">
                          <p className="text-xs font-bold text-shuma-muted mb-1">🔗 Compartir ruta</p>
                          {generateGoogleMapsLinks(route).map((link, idx, arr) => {
                            const label = arr.length > 1 ? `Ruta parte ${idx + 1}/${arr.length}` : 'Abrir Ruta en Google Maps';
                            return (
                              <div key={idx} className="flex gap-2">
                                <a href={link} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-shuma-surface hover:bg-shuma-border text-white border border-shuma-border transition-all">
                                  📍 {label}
                                </a>
                                <a href={`https://wa.me/?text=${generateWhatsAppMessage(route, generateGoogleMapsLinks(route))}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center px-4 py-2 rounded-lg text-xs font-bold bg-green-600 hover:bg-green-500 text-white transition-all">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                  </svg>
                                </a>
                              </div>
                            );
                          })}
                          <button onClick={() => onShareRoute(route.vehicleId)} className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] font-medium text-shuma-muted hover:text-white hover:bg-shuma-border transition-all">
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
        title={`Mover ${modalState?.stop?.address.invoice ? `[${modalState.stop.address.invoice}]` : (modalState?.stop?.address.clientName ? `[${modalState.stop.address.clientName}]` : 'parada')} a ${allVehicles?.find(v => v.id === modalState?.toRouteId)?.driverName || 'nuevo chofer'}`}
        haversineExtraKm={modalState?.haversineExtraKm || 0}
        isRestrictedZone={modalState?.isRestrictedZone || false}
        onConfirm={handleModalConfirm}
        onCancel={() => setModalState(null)}
      />

      {metricsModalRouteId && (() => {
        const route = routes.find(r => r.vehicleId === metricsModalRouteId) || editedRoutes.find(r => r.vehicleId === metricsModalRouteId);
        if (!route) return null;
        
        // Fallback metrics si no existen en el objeto route
        const metrics = route.metrics || {
          totalDistanceKm: route.totalDistance ? Number((route.totalDistance / 1000).toFixed(2)) : 0,
          totalDurationMin: route.totalDuration ? Math.round(route.totalDuration / 60) : 0,
          stopCount: route.stops.length,
        };
        
        let naiveDistance = 0;
        route.stops.forEach(s => {
          if (s.address.lat !== null && s.address.lng !== null) {
            naiveDistance += getHaversineDistance(route.depot, { lat: s.address.lat, lng: s.address.lng }) * 2;
          }
        });
        const efficiency = (naiveDistance > 0 && metrics.totalDistanceKm > 0) 
          ? Math.min(100, Math.round(((naiveDistance / 1000) / metrics.totalDistanceKm) * 100)) 
          : 100;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-shuma-surface rounded-xl shadow-2xl border border-shuma-border w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-shuma-surface/50 p-4 border-b border-shuma-border flex justify-between items-center">
                <h3 className="font-bold text-white text-sm">Análisis de ruta — {route.driverName}</h3>
                <button onClick={() => setMetricsModalRouteId(null)} className="text-shuma-muted hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-5 space-y-4 text-sm">
                <div className="flex flex-col gap-2 font-medium">
                  <p className="flex items-center gap-2"><span className="text-lg">📍</span> {metrics.stopCount} paradas asignadas</p>
                  <p className="flex items-center gap-2"><span className="text-lg">📏</span> {metrics.totalDistanceKm} km de recorrido total</p>
                  <p className="flex items-center gap-2"><span className="text-lg">⏱</span> {Math.floor(metrics.totalDurationMin / 60)}h {metrics.totalDurationMin % 60}min estimados</p>
                </div>
                
                <div className="pt-3 border-t border-shuma-border">
                  <h4 className="font-bold text-shuma-text mb-1">¿Por qué esta distribución?</h4>
                  <p className="text-shuma-muted leading-relaxed text-xs">
                    Google optimizó minimizando el tiempo total de la flota. Esta ruta agrupa las paradas más cercanas geográficamente a este vehículo para reducir distancia total recorrida por todos.
                  </p>
                </div>

                <div className="pt-3 border-t border-shuma-border">
                  <h4 className="font-bold text-shuma-text mb-2">Eficiencia de la flota:</h4>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-shuma-surface rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, efficiency))}%` }} />
                    </div>
                    <span className="font-bold text-blue-400">{efficiency}% <span className="text-[10px] text-shuma-muted font-normal">(vs manual)</span></span>
                  </div>
                </div>

                {/* Detalle por parada */}
                <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8,
                    textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Detalle de paradas
                  </p>
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {route.stops.map((stop, idx) => {
                      const distKm = stop.distance ? (stop.distance / 1000).toFixed(1) : '—';
                      const etaMin = stop.eta ? Math.round(stop.eta / 60) : null;
                      const valor = stop.address.merchandiseValue;
                      return (
                        <div key={stop.address.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '6px 8px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            background: route.color, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: '#fff',
                          }}>{idx + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', margin: 0,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {stop.address.clientName || stop.address.name}
                            </p>
                            {stop.address.invoice && (
                              <p style={{ fontSize: 10, color: '#5B7BA0', margin: '1px 0 0' }}>
                                Factura: {stop.address.invoice}
                              </p>
                            )}
                            <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                              {etaMin !== null && (
                                <span style={{ fontSize: 10, color: '#94a3b8' }}>⏱ ~{etaMin} min desde depósito</span>
                              )}
                              {stop.distance && (
                                <span style={{ fontSize: 10, color: '#94a3b8' }}>📍 {distKm} km acumulado</span>
                              )}
                              {valor !== undefined && valor > 0 && (
                                <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>
                                  💰 ${valor.toLocaleString('es-MX')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Resumen de valor total */}
                {route.stops.some(s => s.address.merchandiseValue) && (
                  <div style={{
                    marginTop: 10, padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 11, color: '#f59e0b' }}>Valor total en ruta</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
                      ${route.stops.reduce((acc, s) => acc + (s.address.merchandiseValue || 0), 0)
                        .toLocaleString('es-MX')}
                    </span>
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-shuma-border bg-shuma-surface/80">
                <button onClick={() => setMetricsModalRouteId(null)} className="w-full py-2 bg-shuma-surface hover:bg-shuma-border text-white rounded-lg text-sm font-bold transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
