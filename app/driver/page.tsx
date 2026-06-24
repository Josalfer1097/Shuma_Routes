'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import {
  CheckCircle, XCircle, Navigation, Package,
  LogOut, Truck, AlertTriangle, Camera, ChevronDown, ChevronUp
} from 'lucide-react';
import { compressImage } from '@/lib/imageCompress';
import NotificationBell from '@/components/notifications/NotificationBell';

function PhotoPicker({ photoPreviews, onAdd, onRemove, fileInputRef, isCompressing, onChange }: {
  photoPreviews: string[],
  onAdd: () => void,
  onRemove: (index: number) => void,
  fileInputRef: React.RefObject<HTMLInputElement>,
  isCompressing: boolean,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="mt-4">
      <p className="text-xs text-shuma-muted mb-2">
        📸 Foto de evidencia ({photoPreviews.length}/4)
      </p>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        multiple className="hidden" onChange={onChange} />
      <div className="grid grid-cols-4 gap-2">
        {photoPreviews.map((src, i) => (
          <div key={i} className="relative aspect-square">
            <img src={src} alt={`evidencia-${i}`} className="w-full h-full object-cover rounded-lg" />
            <button onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">✕</button>
          </div>
        ))}
        {photoPreviews.length < 4 && (
          <button onClick={onAdd} disabled={isCompressing}
            className="aspect-square border border-dashed border-shuma-border rounded-lg flex flex-col items-center justify-center gap-1 text-shuma-muted active:bg-shuma-surface touch-manipulation disabled:opacity-50">
            {isCompressing ? (
              <span className="text-[10px]">…</span>
            ) : (
              <><Camera size={16} /><span className="text-[9px]">Agregar</span></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface DeliveryStop {
  id: string;
  sequence: number;
  status: string;
  address: {
    id: string;
    name: string;
    clientName: string;
    raw: string;
    label: string;
    invoice: string;
    lat: number;
    lng: number;
  };
  notes?: string;
}

interface DriverRoute {
  routeDriverId: string;
  routeId: string;
  color: string;
  totalKm: number;
  totalMinutes: number;
  departureTime: string;
  routeCode: string | null;
  closureStatus: string | null;
  stops: DeliveryStop[];
}

type ModalType = 'deliver' | 'partial' | 'failed' | 'reopen' | 'closeRoute' | null;

export default function DriverPage() {
  const router = useRouter();
  const [route, setRoute]             = useState<DriverRoute | null>(null);
  const [loading, setLoading]         = useState(true);
  const [driverName, setDriverName]   = useState('');
  const [driverId, setDriverId]       = useState('');
  const [error, setError]             = useState('');

  // Modal state
  const [activeModal, setActiveModal]             = useState<ModalType>(null);
  const [selectedStop, setSelectedStop]           = useState<{ stop: DeliveryStop; index: number } | null>(null);
  const [notes, setNotes]                         = useState('');
  const [partialQuantity, setPartialQuantity]     = useState('');
  const [photoFiles, setPhotoFiles]               = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews]         = useState<string[]>([]);
  const [isCompressing, setIsCompressing]         = useState(false);
  const [isSubmitting, setIsSubmitting]           = useState(false);
  const [isRefreshing, setIsRefreshing]           = useState(false);
  const [routeStarted, setRouteStarted]           = useState(false);
  const [isStarting, setIsStarting]               = useState(false);
  const [expandedStops, setExpandedStops]         = useState<Set<string>>(new Set());
  const fileInputRef                              = useRef<HTMLInputElement>(null);

  const fetchRoute = useCallback(async (id: string, refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
      const res   = await fetch(`/api/driver/route?driver_id=${id}&date=${today}`);
      const json  = await res.json();
      if (json.ok && json.route) setRoute(json.route);
    } catch {
      setError('No se pudo cargar tu ruta.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const role = sessionStorage.getItem('shuma_role');
    if (!role || role !== 'driver') { router.push('/'); return; }
    const name = sessionStorage.getItem('shuma_name') || '';
    const id   = sessionStorage.getItem('shuma_driver_id') || '';
    setDriverName(name);
    setDriverId(id);
    if (id) {
      fetchRoute(id);
      // Persistir estado de ruta iniciada en sessionStorage
      const started = sessionStorage.getItem('shuma_route_started');
      if (started === 'true') setRouteStarted(true);
    }
    else { setError('No se encontró tu ID. Contacta al administrador.'); setLoading(false); }
  }, [router, fetchRoute]);

  const openModal = (type: ModalType, stop: DeliveryStop, index: number) => {
    setActiveModal(type);
    setSelectedStop({ stop, index });
    setNotes('');
    setPartialQuantity('');
    setPhotoFiles([]);
    setPhotoPreviews([]);
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedStop(null);
    setNotes('');
    setPartialQuantity('');
    setPhotoFiles([]);
    setPhotoPreviews([]);
  };

  const MAX_PHOTOS = 4;

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_PHOTOS - photoFiles.length;
    if (remaining <= 0) {
      e.target.value = '';
      return;
    }
    const toAdd = files.slice(0, remaining);
    e.target.value = '';

    setIsCompressing(true);
    try {
      const compressed = await Promise.all(toAdd.map(f => compressImage(f)));
      setPhotoFiles(prev => [...prev, ...compressed]);

      compressed.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          setPhotoPreviews(prev => [...prev, ev.target?.result as string]);
        };
        reader.readAsDataURL(file);
      });
    } finally {
      setIsCompressing(false);
    }
  };

  const removePhoto = (index: number) => {
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleAction = async (status: 'completed' | 'partial' | 'failed') => {
    if (!selectedStop || !route) return;
    if (status === 'failed' && !notes.trim()) return;
    if (status === 'partial' && !notes.trim()) return;
    setIsSubmitting(true);

    try {
      let photoUrls: string[] = [];
      if (photoFiles.length > 0) {
        const uploads = await Promise.all(
          photoFiles.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('deliveryId', selectedStop.stop.id);
            formData.append('invoice', selectedStop.stop.address.invoice || selectedStop.stop.id);
            const photoRes = await fetch('/api/driver/upload-photo', {
              method: 'POST', body: formData,
            });
            if (!photoRes.ok) {
              const errJson = await photoRes.json().catch(() => ({}));
              throw new Error(`Foto: ${errJson.error || photoRes.statusText}`);
            }
            const photoJson = await photoRes.json();
            return photoJson.url as string;
          })
        );
        photoUrls = uploads.filter(Boolean);
      }

      // Marcar entrega
      const res = await fetch('/api/driver/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId:      selectedStop.stop.id,
          status,
          notes:           notes || '',
          partialQuantity: status === 'partial' ? partialQuantity : null,
          photoUrls,
          driverName,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error('Error al actualizar');

      // Actualizar local
      const newStops = route.stops.map((s, i) =>
        i === selectedStop.index ? { ...s, status, notes } : s
      );
      setRoute({ ...route, stops: newStops });
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(`Error al guardar: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopenRequest = async () => {
    if (!selectedStop || !route) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/driver/deliver/reopen-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: selectedStop.stop.id,
          driverId,
          reason: notes || '',
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error('Error al solicitar reapertura');
      alert('Solicitud de reapertura enviada al administrador.');
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(`Error al enviar: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseRouteRequest = async () => {
    if (!route) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/driver/route/close-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId: route.routeId, driverId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error('Error al solicitar cierre');
      setRoute({ ...route, closureStatus: 'requested' });
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(`Error al enviar: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedStops(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleLogout = () => { sessionStorage.clear(); router.push('/'); };

  const handleStartRoute = async () => {
    if (!route || isStarting) return;
    setIsStarting(true);
    try {
      const res = await fetch('/api/driver/route/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId:       route.routeId,
          routeDriverId: route.routeDriverId,
          driverId,
          driverName,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al iniciar ruta');
      setRouteStarted(true);
      sessionStorage.setItem('shuma_route_started', 'true');
      // Refrescar las paradas para que muestren status in_route
      await fetchRoute(driverId, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(`Error: ${msg}`);
    } finally {
      setIsStarting(false);
    }
  };

  if (loading) return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg flex items-center justify-center">
        <div className="text-center space-y-3">
          <Truck className="w-10 h-10 text-blue-400 mx-auto animate-bounce" />
          <p className="text-shuma-muted text-sm">Cargando tu ruta...</p>
        </div>
      </div>
    </AuthGuard>
  );

  if (error) return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg flex flex-col items-center justify-center p-6 text-center gap-4">
        <AlertTriangle className="w-14 h-14 text-amber-400" />
        <h1 className="text-xl font-bold text-white">Error</h1>
        <p className="text-shuma-muted text-sm max-w-xs">{error}</p>
        <button onClick={handleLogout}
          className="mt-2 px-6 py-3 bg-shuma-surface border border-shuma-border text-white font-bold rounded-xl">
          Cerrar Sesión
        </button>
      </div>
    </AuthGuard>
  );

  if (!route || route.stops.length === 0) return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg flex flex-col items-center justify-center p-6 text-center gap-3">
        <Package className="w-14 h-14 text-shuma-muted" />
        <h1 className="text-2xl font-bold text-white">Hola, {driverName}</h1>
        <p className="text-shuma-muted text-sm">No tienes ninguna ruta asignada para hoy.</p>
        <p className="text-xs text-shuma-muted opacity-40">
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' })}
        </p>
        <button onClick={handleLogout}
          className="mt-4 px-6 py-3 bg-shuma-surface border border-shuma-border text-white font-bold rounded-xl">
          Cerrar Sesión
        </button>
      </div>
    </AuthGuard>
  );

  // Pantalla "Iniciar Ruta" — si la ruta no ha sido iniciada
  if (!routeStarted && route.closureStatus !== 'approved') {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-shuma-bg flex flex-col">
          {/* Header minimal */}
          <header className="bg-shuma-surface border-b border-shuma-border p-4 flex justify-between items-center">
            <div>
              <h1 className="text-base font-bold text-white">
                {route.routeCode ? `Ruta ${route.routeCode}` : 'Mi Ruta de Hoy'}
              </h1>
              <p className="text-xs text-shuma-muted mt-0.5">{driverName}</p>
            </div>
            <button onClick={handleLogout} className="p-2 text-shuma-muted touch-manipulation">
              <LogOut size={18} />
            </button>
          </header>

          {/* Contenido centrado */}
          <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6 text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${route.color}20`, border: `2px solid ${route.color}` }}
            >
              <Truck size={36} style={{ color: route.color }} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">
                ¡Listo para salir!
              </h2>
              <p className="text-shuma-muted text-sm max-w-xs">
                Tienes <span className="text-white font-semibold">{route.stops.length} entregas</span> programadas
                para hoy. Presiona el botón cuando estés en camino.
              </p>
            </div>

            {/* Info de ruta */}
            <div className="w-full max-w-xs bg-shuma-surface border border-shuma-border rounded-2xl p-4 space-y-2 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-shuma-muted">Entregas</span>
                <span className="text-white font-semibold">{route.stops.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-shuma-muted">Distancia</span>
                <span className="text-white font-semibold">{route.totalKm?.toFixed(1)} km</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-shuma-muted">Tiempo estimado</span>
                <span className="text-white font-semibold">
                  {Math.floor((route.totalMinutes || 0) / 60)}h {(route.totalMinutes || 0) % 60}m
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-shuma-muted">Hora de salida</span>
                <span className="text-white font-semibold">{route.departureTime || '—'}</span>
              </div>
            </div>

            {/* Botón principal */}
            <button
              onClick={handleStartRoute}
              disabled={isStarting}
              className="w-full max-w-xs flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white text-base touch-manipulation transition-all active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: route.color || '#2196F3' }}
            >
              {isStarting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Iniciando...
                </>
              ) : (
                <>
                  <Truck size={22} />
                  Iniciar Ruta
                </>
              )}
            </button>
          </main>

          {/* Footer */}
          <footer className="p-3 border-t border-shuma-border">
            <p style={{
              fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
              background: 'linear-gradient(90deg,#ff0000,#ff6600,#ffff00,#00ff00,#00ffff,#0066ff,#cc00ff,#ff0000)',
              backgroundSize: '400% auto', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              animation: 'rgbRoll 5s linear infinite', opacity: 0.4,
              textAlign: 'center',
            }}>
              Design &amp; Developed by Shuma Sistemas IT
            </p>
          </footer>
        </div>
      </AuthGuard>
    );
  }

  const delivered    = route.stops.filter(s => s.status === 'delivered' || s.status === 'completed').length;
  const partial      = route.stops.filter(s => s.status === 'partial').length;
  const failed       = route.stops.filter(s => s.status === 'failed').length;
  const pending      = route.stops.length - delivered - partial - failed;
  const processed    = delivered + partial + failed;
  const pct          = Math.round((processed / route.stops.length) * 100);
  const allDone      = pending === 0;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg flex flex-col">

        {/* ── HEADER sticky ── */}
        <header className="bg-shuma-surface border-b border-shuma-border p-4 sticky top-0 z-20 shadow-md">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h1 className="text-base font-bold text-white leading-tight flex items-center gap-2">
                {route.routeCode ? `Ruta ${route.routeCode}` : 'Mi Ruta de Hoy'}
                <button
                  onClick={() => fetchRoute(driverId, true)}
                  disabled={isRefreshing}
                  className="p-1 text-shuma-muted hover:text-white transition-colors disabled:opacity-50"
                  title="Actualizar ruta"
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </h1>
              <p className="text-xs text-shuma-muted mt-0.5">
                {driverName} · {route.totalKm?.toFixed(1)} km · {Math.floor((route.totalMinutes || 0) / 60)}h {(route.totalMinutes || 0) % 60}m
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell targetRole={driverId} />
              <button onClick={handleLogout} className="p-2 text-shuma-muted active:text-white transition-colors touch-manipulation">
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-300 font-medium">
              <span>{pct}% completado</span>
              <span>{processed}/{route.stops.length}</span>
            </div>
            <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
              <div className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: route.color || '#2196F3' }} />
            </div>
            {/* Stats rápidos */}
            <div className="flex gap-3 text-xs pt-0.5">
              <span className="text-emerald-400">✓ {delivered}</span>
              {partial > 0 && <span className="text-amber-400">◑ {partial} parciales</span>}
              {failed > 0  && <span className="text-red-400">✗ {failed}</span>}
              {pending > 0 && <span className="text-shuma-muted">○ {pending} pendientes</span>}
            </div>
          </div>

          {/* Banner cuando todas están listas o para cierre de ruta */}
          {route.closureStatus === 'approved' ? (
            <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
              <p className="text-xs font-bold text-emerald-400">
                🔒 Ruta cerrada oficialmente.
              </p>
            </div>
          ) : route.closureStatus === 'requested' ? (
            <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
              <p className="text-xs font-bold text-amber-400">
                ⏳ Solicitud de cierre enviada. Esperando aprobación...
              </p>
            </div>
          ) : (
            <div className="mt-3">
              {allDone && (
                <div className="p-2.5 mb-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                  <p className="text-xs font-bold text-emerald-400">
                    🎉 ¡Todas las entregas procesadas!
                  </p>
                </div>
              )}
              <button
                onClick={() => openModal('closeRoute', route.stops[0], 0)} // stop index no importa
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-colors"
              >
                Solicitar Cierre de Ruta
              </button>
            </div>
          )}
        </header>

        {/* ── LISTA DE PARADAS ── */}
        <main className="flex-1 overflow-y-auto p-3 pb-24 space-y-2.5">
          {route.stops.map((stop, idx) => {
            const isDelivered = stop.status === 'delivered' || stop.status === 'completed';
            const isPartial   = stop.status === 'partial';
            const isFailed    = stop.status === 'failed';
            const isPending   = !isDelivered && !isPartial && !isFailed;
            const isExpanded  = expandedStops.has(stop.id);

            let borderColor = 'border-shuma-border';
            let bgColor     = 'bg-shuma-surface/40';
            if (isDelivered) { borderColor = 'border-emerald-500/30'; bgColor = 'bg-emerald-900/10'; }
            if (isPartial)   { borderColor = 'border-amber-500/30';   bgColor = 'bg-amber-900/10'; }
            if (isFailed)    { borderColor = 'border-red-500/30';     bgColor = 'bg-red-900/10'; }

            return (
              <div key={stop.id} className={`rounded-2xl border ${borderColor} ${bgColor} overflow-hidden shadow-sm`}>
                {/* Cabecera de la parada */}
                <div className="p-3.5" onClick={() => toggleExpand(stop.id)}>
                  <div className="flex items-start gap-3">
                    {/* Número / status */}
                    <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-bold text-sm border
                      ${isDelivered ? 'bg-emerald-500 text-white border-emerald-400' :
                        isPartial   ? 'bg-amber-500 text-white border-amber-400' :
                        isFailed    ? 'bg-red-500 text-white border-red-400' :
                                      'bg-slate-800 text-slate-300 border-shuma-border'}`}>
                      {isDelivered ? '✓' : isPartial ? '◑' : isFailed ? '✗' : idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`font-semibold text-sm leading-tight ${isDelivered || isFailed ? 'text-slate-400' : 'text-white'}`}>
                          {stop.address.clientName || stop.address.name}
                        </h3>
                        {isExpanded
                          ? <ChevronUp size={14} className="text-shuma-muted shrink-0 mt-0.5" />
                          : <ChevronDown size={14} className="text-shuma-muted shrink-0 mt-0.5" />
                        }
                      </div>
                      {stop.address.invoice && (
                        <p className="text-xs font-mono text-blue-400 mt-0.5">📄 {stop.address.invoice}</p>
                      )}
                      {/* Status badge */}
                      {!isPending && (
                        <p className={`text-xs font-medium mt-1
                          ${isDelivered ? 'text-emerald-400' :
                            isPartial   ? 'text-amber-400' :
                                          'text-red-400'}`}>
                          {isDelivered ? '✓ Entrega confirmada' :
                           isPartial   ? '◑ Entrega parcial' :
                                         `✗ No entregado${stop.notes ? ` — ${stop.notes}` : ''}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detalles expandibles */}
                {isExpanded && (
                  <div className="px-3.5 pb-3 pt-0 border-t border-shuma-border/30">
                    <p className="text-xs text-shuma-muted mt-2.5 leading-relaxed">
                      📍 {stop.address.raw}
                    </p>

                    {isPending && (
                      <div className="mt-3 space-y-2">
                        {/* Navegar — fila propia, ancho completo */}
                        <button
                          onClick={() => window.open(`https://maps.google.com/?q=${stop.address.lat},${stop.address.lng}`, '_blank')}
                          className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-semibold touch-manipulation active:bg-blue-500/20 transition-colors"
                        >
                          <Navigation size={13} /> Ir a la dirección
                        </button>

                        {/* 3 acciones de estado — mismo peso visual */}
                        {route.closureStatus !== 'approved' && route.closureStatus !== 'requested' && (
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); openModal('deliver', stop, idx); }}
                              className="flex flex-col items-center justify-center gap-1 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-xl text-[11px] font-semibold touch-manipulation active:bg-emerald-500/20 transition-colors"
                            >
                              <CheckCircle size={18} />
                              Entregado
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); openModal('partial', stop, idx); }}
                              className="flex flex-col items-center justify-center gap-1 py-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/25 rounded-xl text-[11px] font-semibold touch-manipulation active:bg-amber-500/20 transition-colors"
                            >
                              <span style={{ fontSize: 18, lineHeight: 1 }}>◑</span>
                              Parcial
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); openModal('failed', stop, idx); }}
                              className="flex flex-col items-center justify-center gap-1 py-2.5 bg-red-500/10 text-red-400 border border-red-500/25 rounded-xl text-[11px] font-semibold touch-manipulation active:bg-red-500/20 transition-colors"
                            >
                              <XCircle size={18} />
                              No entregado
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!isPending && route.closureStatus !== 'approved' && route.closureStatus !== 'requested' && (
                      <div className="mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); openModal('reopen', stop, idx); }}
                          className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-semibold touch-manipulation active:bg-amber-500/20 transition-colors"
                        >
                          Solicitar Reapertura
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </main>

        {/* ── FOOTER ── */}
        <footer className="fixed bottom-0 left-0 right-0 p-3 bg-shuma-bg/95 backdrop-blur-sm border-t border-shuma-border">
          <p style={{
            fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            background: 'linear-gradient(90deg,#ff0000,#ff6600,#ffff00,#00ff00,#00ffff,#0066ff,#cc00ff,#ff0000)',
            backgroundSize: '400% auto', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            animation: 'rgbRoll 5s linear infinite', opacity: 0.4,
            textAlign: 'center',
          }}>
            Design &amp; Developed by Shuma Sistemas IT
          </p>
        </footer>

        {/* ── MODAL: CONFIRMAR ENTREGA ── */}
        {activeModal === 'deliver' && selectedStop && (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl w-full max-w-sm shadow-2xl">
              <div className="p-5">
                <h2 className="text-base font-bold text-white mb-1">¿Confirmar entrega completa?</h2>
                <p className="text-sm text-shuma-muted">{selectedStop.stop.address.clientName}</p>
                {selectedStop.stop.address.invoice && (
                  <p className="text-sm font-mono text-blue-400 mt-2 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20 inline-block">
                    📄 {selectedStop.stop.address.invoice}
                  </p>
                )}
                {/* Comentarios opcionales */}
                <div className="mt-4">
                  <label className="text-xs text-shuma-muted mb-1.5 block">
                    💬 Comentarios (opcional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ej: Recibió el guardia, todo en orden"
                    rows={2}
                    className="w-full px-3 py-2 bg-shuma-bg border border-shuma-border rounded-xl text-sm text-shuma-text placeholder:text-shuma-muted/60 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
                <PhotoPicker 
                  photoPreviews={photoPreviews}
                  onAdd={() => fileInputRef.current?.click()}
                  onRemove={removePhoto}
                  fileInputRef={fileInputRef}
                  isCompressing={isCompressing}
                  onChange={handlePhotoChange}
                />
              </div>
              <div className="flex gap-3 p-4 pt-0">
                <button onClick={closeModal} disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-sm rounded-xl border border-shuma-border touch-manipulation">
                  Cancelar
                </button>
                <button onClick={() => handleAction('completed')} disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white font-bold text-sm rounded-xl touch-manipulation active:bg-emerald-600">
                  {isSubmitting ? 'Guardando...' : <><CheckCircle size={15} /> Confirmar</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: ENTREGA PARCIAL ── */}
        {activeModal === 'partial' && selectedStop && (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl w-full max-w-sm shadow-2xl">
              <div className="p-5">
                <h2 className="text-base font-bold text-white mb-1">◑ Entrega parcial</h2>
                <p className="text-xs text-shuma-muted mb-4">{selectedStop.stop.address.clientName} · {selectedStop.stop.address.invoice}</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-shuma-muted block mb-1.5">¿Qué se entregó? (requerido)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Ej: Solo se entregaron 3 de 5 cajas por espacio en el camión..."
                      className="w-full h-20 bg-slate-900 border border-shuma-border rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-amber-500 resize-none" />
                  </div>
                  {/* Foto */}
                  <PhotoPicker 
                    photoPreviews={photoPreviews}
                    onAdd={() => fileInputRef.current?.click()}
                    onRemove={removePhoto}
                    fileInputRef={fileInputRef}
                    isCompressing={isCompressing}
                    onChange={handlePhotoChange}
                  />
                </div>
              </div>
              <div className="flex gap-3 p-4 pt-0">
                <button onClick={closeModal} disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-sm rounded-xl border border-shuma-border touch-manipulation">
                  Cancelar
                </button>
                <button onClick={() => handleAction('partial')} disabled={isSubmitting || !notes.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-500 disabled:bg-amber-500/50 text-white font-bold text-sm rounded-xl touch-manipulation active:bg-amber-600">
                  {isSubmitting ? 'Guardando...' : '◑ Guardar parcial'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: NO ENTREGADO ── */}
        {activeModal === 'failed' && selectedStop && (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl w-full max-w-sm shadow-2xl">
              <div className="p-5">
                <h2 className="text-base font-bold text-white mb-1">✗ No se pudo entregar</h2>
                <p className="text-xs text-shuma-muted mb-4">{selectedStop.stop.address.clientName} · {selectedStop.stop.address.invoice}</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-shuma-muted block mb-1.5">Motivo (requerido)</label>
                    <div className="space-y-2 mb-3">
                      {['Negocio cerrado', 'Cliente no disponible', 'Dirección no encontrada', 'Acceso bloqueado', 'Otro motivo'].map(reason => (
                        <button key={reason} onClick={() => setNotes(reason)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors touch-manipulation
                            ${notes === reason
                              ? 'bg-red-500/15 border-red-500/40 text-red-300'
                              : 'bg-slate-900 border-shuma-border text-slate-400 active:bg-slate-800'}`}>
                          {notes === reason ? '● ' : '○ '}{reason}
                        </button>
                      ))}
                    </div>
                    {notes === 'Otro motivo' && (
                      <textarea value={''} onChange={e => setNotes(e.target.value)}
                        placeholder="Describe el motivo..."
                        className="w-full h-16 bg-slate-900 border border-shuma-border rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-red-500 resize-none" />
                    )}
                  </div>
                  {/* Foto */}
                  <PhotoPicker 
                    photoPreviews={photoPreviews}
                    onAdd={() => fileInputRef.current?.click()}
                    onRemove={removePhoto}
                    fileInputRef={fileInputRef}
                    isCompressing={isCompressing}
                    onChange={handlePhotoChange}
                  />
                </div>
              </div>
              <div className="flex gap-3 p-4 pt-0">
                <button onClick={closeModal} disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-sm rounded-xl border border-shuma-border touch-manipulation">
                  Cancelar
                </button>
                <button onClick={() => handleAction('failed')} disabled={isSubmitting || !notes.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 disabled:bg-red-500/50 text-white font-bold text-sm rounded-xl touch-manipulation active:bg-red-600">
                  {isSubmitting ? 'Guardando...' : <><XCircle size={15} /> Confirmar</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: REABRIR ENTREGA ── */}
        {activeModal === 'reopen' && selectedStop && (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl w-full max-w-sm shadow-2xl">
              <div className="p-5">
                <h2 className="text-base font-bold text-white mb-1">Solicitar Reapertura</h2>
                <p className="text-xs text-shuma-muted mb-4">{selectedStop.stop.address.clientName} · {selectedStop.stop.address.invoice}</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-shuma-muted block mb-1.5">Motivo de reapertura (requerido)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Ej: Me equivoqué de estado, el cliente sí estaba..."
                      className="w-full h-20 bg-slate-900 border border-shuma-border rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-amber-500 resize-none" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 p-4 pt-0">
                <button onClick={closeModal} disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-sm rounded-xl border border-shuma-border touch-manipulation">
                  Cancelar
                </button>
                <button onClick={handleReopenRequest} disabled={isSubmitting || !notes.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-500 disabled:bg-amber-500/50 text-white font-bold text-sm rounded-xl touch-manipulation active:bg-amber-600">
                  {isSubmitting ? 'Enviando...' : 'Solicitar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: CERRAR RUTA ── */}
        {activeModal === 'closeRoute' && route && (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl w-full max-w-sm shadow-2xl">
              <div className="p-5">
                <h2 className="text-base font-bold text-white mb-2">Cerrar Ruta</h2>
                <p className="text-sm text-slate-300 mb-4">
                  Estás a punto de solicitar el cierre de tu ruta. Una vez aprobado por el administrador, ya no podrás modificar entregas.
                </p>
                {pending > 0 && (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                    ⚠️ Tienes {pending} entregas pendientes. El administrador revisará esta solicitud.
                  </p>
                )}
              </div>
              <div className="flex gap-3 p-4 pt-0">
                <button onClick={closeModal} disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-sm rounded-xl border border-shuma-border touch-manipulation">
                  Cancelar
                </button>
                <button onClick={handleCloseRouteRequest} disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-bold text-sm rounded-xl touch-manipulation active:bg-blue-700">
                  {isSubmitting ? 'Enviando...' : 'Solicitar Cierre'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
