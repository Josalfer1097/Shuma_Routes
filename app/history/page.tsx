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
  deliveries?: any[];
}

export default function HistoryPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<HistoryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  });
  const [error, setError] = useState<string | null>(null);
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);

  const handleDownloadPDF = async (route: HistoryRoute) => {
    const { generatePDFReport } = await import('@/lib/pdfReport');
    await generatePDFReport([route], null, null, `ruta-${route.driver_name?.replace(/\s+/g, '-') || 'shuma'}`);
  };

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
                const dateObj = new Date(route.date + 'T12:00:00');
                const formattedDate = new Intl.DateTimeFormat('es-MX', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                }).format(dateObj);
                
                const { total, delivered, partial, failed, pending } = route.stats;
                const processed = delivered + partial + failed;
                const pct       = total > 0 ? Math.round((processed / total) * 100) : 0;
                const isDone    = pending === 0 && total > 0;
                const hasFails  = failed > 0 || partial > 0;
                
                const isExpanded = expandedRoute === route.id;

                return (
                  <div key={route.id} className="p-4 rounded-xl border border-shuma-border bg-shuma-surface/30 space-y-3 hover:border-slate-600 transition-colors">
                    
                    {/* Cabecera de ruta */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: route.color || '#2196F3' }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-semibold text-sm text-shuma-text truncate">
                              {route.route_alias || route.route_code || 'Sin nombre'}
                            </h3>
                          </div>
                          <p className="text-xs text-shuma-muted mt-0.5">
                            {route.driver_name || 'Sin chofer asignado'}
                            {route.route_code && route.route_alias && (
                              <span className="ml-1.5 opacity-40">· {route.route_code}</span>
                            )}
                            <span className="ml-1.5 opacity-40">· {formattedDate}</span>
                            {route.total_km > 0 && ` · ${route.total_km.toFixed(1)} km`}
                          </p>
                        </div>
                      </div>

                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 border ${
                        isDone && !hasFails
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : isDone && hasFails
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : hasFails
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      }`}>
                        {isDone && !hasFails ? '✓ Completada'
                          : isDone ? '⚠ Con incidencias'
                          : pending > 0 ? `● ${pending} pendientes`
                          : '● En curso'}
                      </span>
                    </div>

                    {/* Barra de progreso */}
                    <div>
                      <div className="flex justify-between text-xs text-shuma-muted mb-1.5">
                        <div className="flex gap-3">
                          <span className="text-emerald-400">✓ {delivered}</span>
                          {partial > 0 && <span className="text-amber-400">◑ {partial}</span>}
                          {failed > 0  && <span className="text-red-400">✗ {failed}</span>}
                          {pending > 0 && <span className="opacity-50">○ {pending}</span>}
                        </div>
                        <span>{pct}% · {processed}/{total}</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: route.color || '#2196F3' }} />
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setExpandedRoute(isExpanded ? null : route.id)}
                        className="flex-1 text-xs text-slate-300 hover:text-white py-1.5 rounded-lg hover:bg-slate-700 transition-colors border border-shuma-border"
                      >
                        {isExpanded ? 'Ocultar Paradas' : 'Ver Paradas'}
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(route)}
                        className="flex-1 text-xs text-blue-400 hover:text-blue-300 py-1.5 rounded-lg hover:bg-blue-500/10 transition-colors border border-blue-500/30"
                      >
                        📄 Descargar PDF
                      </button>
                    </div>

                    {/* Paradas (Expandible) */}
                    {isExpanded && route.deliveries && (
                      <div className="mt-3 pt-3 border-t border-shuma-border/50 space-y-2">
                        {route.deliveries.length === 0 ? (
                          <p className="text-xs text-shuma-muted text-center py-2">No hay paradas en esta ruta</p>
                        ) : (
                          route.deliveries.map((del, i) => (
                            <div key={del.address?.id || i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                                  {del.sequence}
                                </span>
                                <div className="truncate">
                                  <p className="font-semibold text-slate-200 truncate">{del.address?.name || 'Cliente'}</p>
                                  <p className="text-[10px] text-slate-400 truncate">{del.address?.invoice || 'Sin factura'} · {del.address?.label}</p>
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                del.status === 'delivered' || del.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                                del.status === 'partial' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                                del.status === 'failed' ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
                                'bg-slate-700 text-slate-300 border border-slate-600'
                              }`}>
                                {del.status === 'delivered' || del.status === 'completed' ? 'Entregado' :
                                 del.status === 'partial' ? 'Parcial' :
                                 del.status === 'failed' ? 'Fallido' : 'Pendiente'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
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
