'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { CheckCircle, XCircle, Navigation, MapPin, Package, LogOut, Clock, Truck } from 'lucide-react';

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
  stops: DeliveryStop[];
}

export default function DriverPage() {
  const router = useRouter();
  const [route, setRoute]           = useState<DriverRoute | null>(null);
  const [loading, setLoading]       = useState(true);
  const [driverName, setDriverName] = useState('');
  const [driverId, setDriverId]     = useState('');
  const [error, setError]           = useState('');

  // Modals
  const [selectedStop, setSelectedStop]         = useState<{ stop: DeliveryStop; index: number } | null>(null);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [showFailModal, setShowFailModal]       = useState(false);
  const [notes, setNotes]                       = useState('');
  const [isSubmitting, setIsSubmitting]         = useState(false);

  const fetchRoute = useCallback(async (id: string) => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
      const res   = await fetch(`/api/driver/route?driver_id=${id}&date=${today}`);
      const json  = await res.json();
      if (json.ok && json.route) {
        setRoute(json.route);
      }
    } catch (e) {
      console.error('Error fetching route:', e);
      setError('No se pudo cargar tu ruta. Intenta de nuevo.');
    } finally {
      setLoading(false);
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
    } else {
      // Fallback: intentar por nombre si no hay driver_id
      setError('No se encontró tu ID de chofer. Contacta al administrador.');
      setLoading(false);
    }
  }, [router, fetchRoute]);

  const handleLogout = () => {
    sessionStorage.clear();
    router.push('/');
  };

  const handleAction = async (status: 'completed' | 'failed') => {
    if (!selectedStop || !route) return;
    if (status === 'failed' && !notes.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/driver/deliver', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          deliveryId: selectedStop.stop.id,
          status,
          notes:      status === 'failed' ? notes : '',
          driverName,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error('Error al actualizar');

      // Actualizar estado local
      const newStops = route.stops.map((s, i) =>
        i === selectedStop.index ? { ...s, status } : s
      );
      setRoute({ ...route, stops: newStops });
      setShowDeliverModal(false);
      setShowFailModal(false);
      setNotes('');
      setSelectedStop(null);
    } catch (e) {
      alert('Error al actualizar el estado. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-shuma-bg flex items-center justify-center">
          <div className="text-center space-y-4">
            <Truck className="w-12 h-12 text-blue-400 mx-auto animate-bounce" />
            <p className="text-shuma-muted text-sm">Cargando tu ruta...</p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-shuma-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
          <XCircle className="w-16 h-16 text-red-400 mb-2" />
          <h1 className="text-xl font-bold text-white">Error</h1>
          <p className="text-shuma-muted text-sm">{error}</p>
          <button onClick={handleLogout}
            className="mt-4 px-6 py-3 bg-shuma-surface border border-shuma-border text-white font-bold rounded-xl">
            Cerrar Sesión
          </button>
        </div>
      </AuthGuard>
    );
  }

  if (!route || route.stops.length === 0) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-shuma-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
          <Package className="w-16 h-16 text-shuma-muted mb-4" />
          <h1 className="text-2xl font-bold text-white">Hola, {driverName}</h1>
          <p className="text-shuma-muted">No tienes ninguna ruta asignada para hoy.</p>
          <p className="text-xs text-shuma-muted opacity-50">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' })}
          </p>
          <button onClick={handleLogout}
            className="mt-6 px-6 py-3 bg-shuma-surface border border-shuma-border text-white font-bold rounded-xl">
            Cerrar Sesión
          </button>
        </div>
      </AuthGuard>
    );
  }

  const completedCount  = route.stops.filter(s => s.status === 'delivered' || s.status === 'completed').length;
  const failedCount     = route.stops.filter(s => s.status === 'failed').length;
  const totalProcessed  = completedCount + failedCount;
  const totalStops      = route.stops.length;
  const progressPercent = Math.round((totalProcessed / totalStops) * 100);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg flex flex-col">
        {/* HEADER */}
        <header className="bg-shuma-surface border-b border-shuma-border p-4 sticky top-0 z-10 shadow-md">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h1 className="text-lg font-bold text-white">
                {route.routeCode ? `Ruta ${route.routeCode}` : 'Ruta de Hoy'}
              </h1>
              <p className="text-xs text-shuma-muted">{driverName} · {route.totalKm?.toFixed(1)} km · {Math.floor((route.totalMinutes || 0) / 60)}h {(route.totalMinutes || 0) % 60}m</p>
            </div>
            <button onClick={handleLogout} className="p-2 text-shuma-muted hover:text-white">
              <LogOut size={20} />
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-300 font-semibold">
              <span>{progressPercent}% completado</span>
              <span>{totalProcessed} / {totalStops} entregas</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 border border-shuma-border overflow-hidden">
              <div
                className="h-2 transition-all duration-700 rounded-full"
                style={{ width: `${progressPercent}%`, backgroundColor: route.color || '#2196F3' }}
              />
            </div>
          </div>
        </header>

        {/* PARADAS */}
        <main className="flex-1 p-4 space-y-3 overflow-y-auto pb-20">
          {route.stops.map((stop, idx) => {
            const isDelivered = stop.status === 'delivered' || stop.status === 'completed';
            const isFailed    = stop.status === 'failed';
            const isPending   = !isDelivered && !isFailed;

            return (
              <div key={stop.id} className={`p-4 rounded-xl border shadow-sm transition-all
                ${isDelivered ? 'bg-emerald-900/20 border-emerald-500/30' :
                  isFailed    ? 'bg-red-900/20 border-red-500/30' :
                                'bg-shuma-surface border-shuma-border'}`}>
                <div className="flex gap-3">
                  <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm border
                    ${isDelivered ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' :
                      isFailed    ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                                    'bg-slate-800 text-slate-300 border-shuma-border'}`}>
                    {isDelivered ? '✓' : isFailed ? '✗' : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-bold text-sm truncate ${isDelivered || isFailed ? 'text-slate-400' : 'text-white'}`}>
                      {stop.address.clientName || stop.address.name}
                    </h3>
                    <p className="text-xs text-shuma-muted mt-0.5 line-clamp-2 leading-relaxed">
                      {stop.address.raw}
                    </p>
                    {stop.address.invoice && (
                      <span className="text-xs font-mono text-blue-400 mt-1 inline-block">
                        📄 {stop.address.invoice}
                      </span>
                    )}
                  </div>
                </div>

                {isPending && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-shuma-border/50">
                    <button
                      onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${stop.address.lat},${stop.address.lng}`, '_blank')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-bold">
                      <Navigation size={13} /> Navegar
                    </button>
                    <button
                      onClick={() => { setSelectedStop({ stop, index: idx }); setShowDeliverModal(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold">
                      <CheckCircle size={13} /> Entregar
                    </button>
                    <button
                      onClick={() => { setSelectedStop({ stop, index: idx }); setShowFailModal(true); }}
                      className="flex items-center justify-center px-3 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold">
                      <XCircle size={13} />
                    </button>
                  </div>
                )}

                {isDelivered && (
                  <p className="text-xs font-semibold text-emerald-400 mt-2 flex items-center gap-1">
                    <CheckCircle size={12} /> Entregado
                  </p>
                )}
                {isFailed && (
                  <p className="text-xs font-semibold text-red-400 mt-2 flex items-center gap-1">
                    <XCircle size={12} /> No entregado {stop.notes ? `— ${stop.notes}` : ''}
                  </p>
                )}
              </div>
            );
          })}
        </main>

        {/* FOOTER */}
        <footer className="p-4 bg-shuma-bg border-t border-shuma-border text-center">
          <p style={{
            fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            background: 'linear-gradient(90deg,#ff0000,#ff6600,#ffff00,#00ff00,#00ffff,#0066ff,#cc00ff,#ff0000)',
            backgroundSize: '400% auto', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            animation: 'rgbRoll 5s linear infinite', opacity: 0.6,
          }}>
            Design &amp; Developed by Shuma Sistemas IT
          </p>
        </footer>

        {/* MODAL ENTREGAR */}
        {showDeliverModal && selectedStop && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-1">¿Confirmar entrega?</h2>
              <p className="text-sm text-shuma-muted mb-1">{selectedStop.stop.address.clientName || selectedStop.stop.address.name}</p>
              {selectedStop.stop.address.invoice && (
                <p className="text-sm font-mono text-blue-400 mb-4 bg-blue-500/10 p-2 rounded-lg inline-block border border-blue-500/20">
                  📄 {selectedStop.stop.address.invoice}
                </p>
              )}
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowDeliverModal(false)} disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-sm rounded-xl border border-shuma-border">
                  Cancelar
                </button>
                <button onClick={() => handleAction('completed')} disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl">
                  {isSubmitting ? 'Guardando...' : <><CheckCircle size={15} /> Confirmar</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL FALLIDO */}
        {showFailModal && selectedStop && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-1">¿Por qué no se entregó?</h2>
              <p className="text-xs text-shuma-muted mb-3">{selectedStop.stop.address.clientName}</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Motivo (requerido)"
                className="w-full h-24 bg-slate-900 border border-shuma-border rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-red-500 mb-4 resize-none" />
              <div className="flex gap-3">
                <button onClick={() => setShowFailModal(false)} disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-sm rounded-xl border border-shuma-border">
                  Cancelar
                </button>
                <button onClick={() => handleAction('failed')} disabled={isSubmitting || !notes.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 disabled:bg-red-500/50 text-white font-bold text-sm rounded-xl">
                  {isSubmitting ? 'Guardando...' : <><XCircle size={15} /> Marcar fallido</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
