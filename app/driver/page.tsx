'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import type { Route, Stop } from '@/types';
import { CheckCircle, XCircle, Navigation, MapPin, Package, LogOut } from 'lucide-react';

export default function DriverPage() {
  const router = useRouter();
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [driverName, setDriverName] = useState('');

  // Modals state
  const [selectedStop, setSelectedStop] = useState<{stop: Stop, index: number} | null>(null);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [showFailModal, setShowFailModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const role = sessionStorage.getItem('shuma_role');
    if (!role || role !== 'driver') {
      router.push('/');
      return;
    }

    const name = sessionStorage.getItem('shuma_name') || '';
    setDriverName(name);

    try {
      const storedRoutes = sessionStorage.getItem('shuma_routes');
      if (storedRoutes) {
        const routes: Route[] = JSON.parse(storedRoutes);
        const myRoute = routes.find(r => r.driverName === name);
        if (myRoute) setRoute(myRoute);
      }
    } catch (e) {
      console.error('Error loading route', e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleLogout = () => {
    sessionStorage.clear();
    router.push('/');
  };

  const handleAction = async (status: 'completed' | 'failed') => {
    if (!selectedStop || !route) return;
    setIsSubmitting(true);
    try {
      // 1. Llamar a la API
      await fetch('/api/driver/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverName,
          stopIndex: selectedStop.index,
          status,
          notes: status === 'failed' ? notes : ''
        })
      });

      // 2. Actualizar estado local
      const newStops = [...route.stops];
      newStops[selectedStop.index] = { ...newStops[selectedStop.index], status };
      
      const newRoute = { ...route, stops: newStops };
      setRoute(newRoute);

      // Guardar en session storage para persistencia local
      const storedRoutesStr = sessionStorage.getItem('shuma_routes');
      if (storedRoutesStr) {
        const storedRoutes: Route[] = JSON.parse(storedRoutesStr);
        const updatedRoutes = storedRoutes.map(r => r.driverName === driverName ? newRoute : r);
        sessionStorage.setItem('shuma_routes', JSON.stringify(updatedRoutes));
      }

      setShowDeliverModal(false);
      setShowFailModal(false);
      setNotes('');
    } catch (e) {
      console.error('Failed to update status', e);
      alert('Error al actualizar el estado. Intente de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return null;

  if (!route) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-shuma-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
          <Package className="w-16 h-16 text-shuma-muted mb-4" />
          <h1 className="text-2xl font-bold text-white">Hola, {driverName}</h1>
          <p className="text-shuma-muted">No tienes ninguna ruta asignada para hoy.</p>
          <button 
            onClick={handleLogout}
            className="mt-6 px-6 py-3 bg-shuma-surface border border-shuma-border text-white font-bold rounded-xl"
          >
            Cerrar Sesión
          </button>
        </div>
      </AuthGuard>
    );
  }

  const completedCount = route.stops.filter(s => s.status === 'completed').length;
  const failedCount = route.stops.filter(s => s.status === 'failed').length;
  const totalProcessed = completedCount + failedCount;
  const totalStops = route.stops.length;
  const progressPercent = Math.round((totalProcessed / totalStops) * 100);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg flex flex-col">
        {/* HEADER */}
        <header className="bg-shuma-surface border-b border-shuma-border p-4 sticky top-0 z-10 shadow-md">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-lg font-bold text-white">Ruta de Hoy</h1>
              <p className="text-xs text-shuma-muted">{driverName} • {route.vehicleType}</p>
            </div>
            <button onClick={handleLogout} className="p-2 text-shuma-muted hover:text-white transition-colors">
              <LogOut size={20} />
            </button>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-300 font-bold">
              <span>Progreso: {progressPercent}%</span>
              <span>{totalProcessed} de {totalStops}</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2.5 border border-shuma-border overflow-hidden">
              <div 
                className="bg-emerald-500 h-2.5 transition-all duration-1000"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </header>

        {/* LISTA DE PARADAS */}
        <main className="flex-1 p-4 space-y-4 overflow-y-auto">
          {route.stops.map((stop, idx) => {
            const isCompleted = stop.status === 'completed';
            const isFailed = stop.status === 'failed';
            const isPending = !isCompleted && !isFailed;
            
            let bgClass = 'bg-shuma-surface border-shuma-border';
            if (isCompleted) bgClass = 'bg-emerald-900/20 border-emerald-500/30';
            if (isFailed) bgClass = 'bg-red-900/20 border-red-500/30';

            return (
              <div key={idx} className={`p-4 rounded-xl border ${bgClass} space-y-3 shadow-sm`}>
                <div className="flex gap-3">
                  <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm border
                    ${isCompleted ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 
                      isFailed ? 'bg-red-500/20 text-red-400 border-red-500/50' : 
                      'bg-slate-800 text-slate-300 border-shuma-border'}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-bold text-sm ${isCompleted || isFailed ? 'text-slate-300' : 'text-white'}`}>
                      {stop.address.name}
                    </h3>
                    <p className="text-xs text-shuma-muted mt-1 leading-relaxed line-clamp-2">
                      {stop.address.label || stop.address.raw}
                    </p>
                    {stop.address.invoice && (
                      <p className="text-xs font-mono text-blue-400 mt-1">Factura: {stop.address.invoice}</p>
                    )}
                  </div>
                </div>

                {isPending && (
                  <div className="flex gap-2 pt-2 border-t border-shuma-border/50">
                    <button 
                      onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${stop.address.lat},${stop.address.lng}`, '_blank')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-bold transition-all active:bg-blue-500/20"
                    >
                      <Navigation size={14} /> Navegar
                    </button>
                    <button 
                      onClick={() => { setSelectedStop({ stop, index: idx }); setShowDeliverModal(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition-all active:bg-emerald-500/20"
                    >
                      <CheckCircle size={14} /> Entregar
                    </button>
                    <button 
                      onClick={() => { setSelectedStop({ stop, index: idx }); setShowFailModal(true); }}
                      className="flex items-center justify-center px-3 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold transition-all active:bg-red-500/20"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                )}
                
                {isCompleted && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 pt-1">
                    <CheckCircle size={14} /> Entregado
                  </div>
                )}
                
                {isFailed && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 pt-1">
                    <XCircle size={14} /> No entregado
                  </div>
                )}
              </div>
            );
          })}
        </main>

        <footer className="p-4 bg-shuma-bg border-t border-shuma-border text-center">
          <p style={{
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            background: 'linear-gradient(90deg,#ff0000,#ff6600,#ffff00,#00ff00,#00ffff,#0066ff,#cc00ff,#ff0000)',
            backgroundSize: '400% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'rgbRoll 5s linear infinite',
            opacity: 0.6
          }}>
            Design &amp; Developed by Shuma Sistemas IT
          </p>
        </footer>

        {/* MODAL ENTREGAR */}
        {showDeliverModal && selectedStop && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-2">¿Confirmar entrega a {selectedStop.stop.address.name}?</h2>
              <p className="text-xs text-shuma-muted mb-4">{selectedStop.stop.address.label || selectedStop.stop.address.raw}</p>
              {selectedStop.stop.address.invoice && (
                <p className="text-sm font-mono text-blue-400 mb-6 bg-blue-500/10 p-2 rounded-lg inline-block border border-blue-500/20">
                  Factura: {selectedStop.stop.address.invoice}
                </p>
              )}
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeliverModal(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-sm rounded-xl border border-shuma-border"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleAction('completed')}
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl shadow-lg transition-colors"
                >
                  {isSubmitting ? 'Guardando...' : <><CheckCircle size={16} /> Confirmar entrega</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL FALLIDO */}
        {showFailModal && selectedStop && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-2">¿Por qué no se pudo entregar?</h2>
              <p className="text-xs text-shuma-muted mb-4">{selectedStop.stop.address.name}</p>
              
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Motivo (requerido)"
                className="w-full h-24 bg-slate-900 border border-shuma-border rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-red-500 mb-6 resize-none"
              />

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowFailModal(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-sm rounded-xl border border-shuma-border"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleAction('failed')}
                  disabled={isSubmitting || !notes.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white font-bold text-sm rounded-xl shadow-lg transition-colors"
                >
                  {isSubmitting ? 'Guardando...' : <><XCircle size={16} /> Marcar como fallido</>}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AuthGuard>
  );
}
