'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { History, Calendar, ChevronRight, Package, Truck, Navigation, Search, Map } from 'lucide-react';

interface HistoryRoute {
  id: string;
  route_code: string | null;
  route_alias: string | null;
  date: string;
  status: string;
  driver_name: string | null;
  color: string;
  total_km: number;
  total_minutes: number;
  stats: {
    total: number;
    delivered: number;
    partial: number;
    failed: number;
    pending: number;
  };
}

export default function HistoryPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<HistoryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  });
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = date ? `/api/routes/history?date=${date}` : '/api/routes/history';
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok) {
        setRoutes(data.routes);
      } else {
        throw new Error(data.error || 'Error al cargar historial');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(selectedDate);
  }, [selectedDate]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg flex flex-col">
        {/* Header */}
        <header className="bg-shuma-surface border-b border-shuma-border sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/dispatcher')}
                  className="p-2 -ml-2 rounded-xl text-shuma-muted hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <Navigation className="w-5 h-5 rotate-180" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-400" />
                    Historial de Rutas
                  </h1>
                  <p className="text-xs text-shuma-muted mt-0.5">
                    Consulta el desempeño de días anteriores
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Calendar className="w-4 h-4 text-shuma-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="pl-9 pr-3 py-2 bg-slate-900 border border-shuma-border rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                {selectedDate && (
                  <button 
                    onClick={() => setSelectedDate('')}
                    className="px-3 py-2 text-xs font-semibold bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition"
                  >
                    Ver todas
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-shuma-muted text-sm">Cargando historial...</p>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
              <p className="text-red-400 font-medium">{error}</p>
              <button 
                onClick={() => fetchHistory(selectedDate)}
                className="mt-4 px-4 py-2 bg-red-500/20 text-red-300 rounded-lg text-sm font-semibold hover:bg-red-500/30 transition"
              >
                Reintentar
              </button>
            </div>
          ) : routes.length === 0 ? (
            <div className="bg-shuma-surface border border-shuma-border rounded-2xl p-12 text-center flex flex-col items-center">
              <Search className="w-12 h-12 text-slate-600 mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Sin resultados</h3>
              <p className="text-shuma-muted text-sm">
                No se encontraron rutas para la fecha seleccionada.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {routes.map(route => {
                const dateObj = new Date(route.date + 'T12:00:00'); // Forzar mediodía para evitar shift de timezone
                const formattedDate = new Intl.DateTimeFormat('es-MX', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                }).format(dateObj);
                
                const completionPct = route.stats.total > 0 
                  ? Math.round(((route.stats.delivered + route.stats.partial + route.stats.failed) / route.stats.total) * 100) 
                  : 0;

                return (
                  <div key={route.id} className="bg-shuma-surface border border-shuma-border rounded-2xl p-5 hover:border-slate-600 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Info principal */}
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                          <Map className="w-6 h-6" style={{ color: route.color || '#2196F3' }} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-base font-bold text-white">
                              {route.route_alias || route.route_code || 'Ruta sin nombre'}
                            </h2>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                              {route.status}
                            </span>
                          </div>
                          <p className="text-xs text-shuma-muted capitalize">
                            {formattedDate}
                          </p>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1.5 text-xs text-slate-300">
                              <Truck className="w-3.5 h-3.5 text-blue-400" />
                              {route.driver_name || 'Sin asignar'}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-300">
                              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                              {route.total_km.toFixed(1)} km
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6 bg-slate-900/50 rounded-xl p-3 border border-shuma-border/50">
                        <div className="text-center min-w-[3rem]">
                          <div className="text-xl font-bold text-white leading-none mb-1">{completionPct}%</div>
                          <div className="text-[10px] text-shuma-muted uppercase tracking-wider">Avance</div>
                        </div>
                        <div className="w-px h-8 bg-shuma-border"></div>
                        <div className="flex gap-4">
                          <div className="text-center">
                            <div className="text-sm font-bold text-emerald-400">{route.stats.delivered}</div>
                            <div className="text-[10px] text-shuma-muted uppercase">Completas</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-bold text-amber-400">{route.stats.partial}</div>
                            <div className="text-[10px] text-shuma-muted uppercase">Parciales</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-bold text-red-400">{route.stats.failed}</div>
                            <div className="text-[10px] text-shuma-muted uppercase">Fallidas</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-bold text-slate-400">{route.stats.pending}</div>
                            <div className="text-[10px] text-shuma-muted uppercase">Pends</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
