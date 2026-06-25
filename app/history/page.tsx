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
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal]     = useState(false);

  const toggleCompare = (id: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2)  return prev;
      return [...prev, id];
    });
  };

  const buildStaticMapUrl = (deliveries: any[]) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    if (!key || !deliveries?.length) return null;

    const validStops = deliveries
      .filter(d => d.address?.lat && d.address?.lng)
      .slice(0, 20);

    if (validStops.length < 2) return null;

    const params = new URLSearchParams({
      size:   '560x160',
      scale:  '2',
      maptype: 'roadmap',
      style:  'feature:all|element:labels.text.fill|color:0x5B7BA0',
      key,
    });

    const first = validStops[0];
    const last  = validStops[validStops.length - 1];
    params.append('markers', `color:green|size:small|${first.address.lat},${first.address.lng}`);
    params.append('markers', `color:red|size:small|${last.address.lat},${last.address.lng}`);

    validStops.slice(1, -1).forEach(s => {
      params.append('markers',
        `color:0x2196F3|size:tiny|${s.address.lat},${s.address.lng}`
      );
    });

    const path = validStops
      .map(s => `${s.address.lat},${s.address.lng}`)
      .join('|');
    params.append('path', `color:0x2196F3CC|weight:3|${path}`);

    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  };

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
                  <div key={route.id} className="p-4 rounded-xl border border-shuma-border bg-shuma-surface/30 space-y-3 hover:border-slate-600 transition-colors" style={{ borderLeft: `3px solid ${route.color || '#2196F3'}` }}>
                    
                    {/* Cabecera de ruta */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCompare(route.id); }}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                            selectedForCompare.includes(route.id)
                              ? 'bg-blue-500 border-blue-500'
                              : 'border-shuma-border hover:border-blue-400 bg-transparent'
                          }`}
                        >
                          {selectedForCompare.includes(route.id) && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
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
                      <button
                        onClick={() => {
                          // Guardar plantilla en sessionStorage
                          const template = {
                            driverName:    route.driver_name,
                            routeCode:     route.route_code,
                            routeAlias:    route.route_alias,
                            color:         route.color,
                            totalKm:       route.total_km,
                            date:          route.date,
                            deliveries:    (route.deliveries || []).map((d: any) => ({
                              name:      d.address?.clientName || d.address?.name || '',
                              raw:       d.address?.label || d.address?.raw || '',
                              invoice:   d.address?.invoice || '',
                              lat:       d.address?.lat,
                              lng:       d.address?.lng,
                            })),
                          };
                          sessionStorage.setItem('shuma_route_template', JSON.stringify(template));
                          router.push('/dispatcher?from=template');
                        }}
                        className="flex-1 text-xs text-emerald-400 hover:text-emerald-300 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors border border-emerald-500/30 hover:border-emerald-500/50"
                      >
                        ♻️ Usar como plantilla
                      </button>
                    </div>

                    {/* Paradas (Expandible) */}
                    {isExpanded && route.deliveries && (
                      <div className="mt-3 pt-3 border-t border-shuma-border/50 space-y-2">
                        {/* Mapa miniatura */}
                        {(() => {
                          const mapUrl = buildStaticMapUrl(route.deliveries!);
                          return mapUrl ? (
                            <div style={{
                              borderRadius: 12, overflow: 'hidden',
                              border: '1px solid rgba(255,255,255,0.06)',
                              marginBottom: 12,
                              position: 'relative',
                            }}>
                              <img
                                src={mapUrl}
                                alt={`Mapa de ruta ${route.route_alias || route.driver_name}`}
                                style={{
                                  width: '100%', height: 160,
                                  objectFit: 'cover', display: 'block',
                                  filter: 'brightness(0.85) saturate(0.7)',
                                }}
                                loading="lazy"
                              />
                              <div style={{
                                position: 'absolute', bottom: 6, right: 8,
                                fontSize: 9, color: 'rgba(255,255,255,0.4)',
                                fontFamily: "'DM Sans', sans-serif",
                                letterSpacing: '0.05em',
                              }}>
                                {route.deliveries.filter((d: any) => d.address?.lat).length} paradas
                              </div>
                            </div>
                          ) : null;
                        })()}
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
        {selectedForCompare.length > 0 && (
          <div style={{
            position: 'fixed', bottom: 20, left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            background: 'rgba(10,22,40,0.97)',
            border: '1px solid rgba(33,150,243,0.3)',
            borderRadius: 16,
            padding: '10px 16px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: 12,
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
          }}>
            <span style={{ fontSize: 12, color: '#5B7BA0', fontFamily: "'DM Sans', sans-serif" }}>
              {selectedForCompare.length === 1
                ? '1 ruta seleccionada — elige otra para comparar'
                : '2 rutas listas para comparar'}
            </span>
            {selectedForCompare.length === 2 && (
              <button
                onClick={() => setShowCompareModal(true)}
                style={{
                  padding: '6px 14px', borderRadius: 9,
                  background: 'linear-gradient(135deg, #1565C0, #2196F3)',
                  border: 'none', color: 'white', cursor: 'pointer',
                  fontFamily: "'Exo 2', sans-serif",
                  fontSize: 12, fontWeight: 700,
                }}
              >
                Comparar →
              </button>
            )}
            <button
              onClick={() => setSelectedForCompare([])}
              style={{
                background: 'none', border: 'none', color: '#5B7BA0',
                cursor: 'pointer', fontSize: 16, lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {showCompareModal && selectedForCompare.length === 2 && (() => {
          const r1 = routes.find(r => r.id === selectedForCompare[0])!;
          const r2 = routes.find(r => r.id === selectedForCompare[1])!;

          const fmt = (route: typeof r1) => ({
            name:      route.route_alias || route.route_code || route.driver_name || 'Sin nombre',
            driver:    route.driver_name || 'Sin chofer',
            date:      new Date(route.date + 'T12:00:00').toLocaleDateString('es-MX',
                        { weekday: 'short', day: 'numeric', month: 'short' }),
            total:     route.stats.total,
            delivered: route.stats.delivered + route.stats.partial,
            failed:    route.stats.failed,
            pending:   route.stats.pending,
            tasa:      route.stats.total > 0
                        ? Math.round(((route.stats.delivered + route.stats.partial) / route.stats.total) * 100)
                        : 0,
            km:        route.total_km?.toFixed(1) || '0',
            mins:      route.total_minutes || 0,
            color:     route.color || '#2196F3',
          });

          const a = fmt(r1);
          const b = fmt(r2);

          const Row = ({ label, va, vb, better }: {
            label: string; va: string; vb: string; better?: 'a' | 'b' | 'equal'
          }) => (
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '8px 12px', fontSize: 11, color: '#5B7BA0',
                fontFamily: "'DM Sans', sans-serif", textAlign: 'center' }}>
                {label}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 13,
                fontWeight: 600, fontFamily: "'Exo 2', sans-serif",
                color: better === 'a' ? '#34d399' : '#E8EFF8' }}>
                {va} {better === 'a' && '↑'}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 13,
                fontWeight: 600, fontFamily: "'Exo 2', sans-serif",
                color: better === 'b' ? '#34d399' : '#E8EFF8' }}>
                {vb} {better === 'b' && '↑'}
              </td>
            </tr>
          );

          return (
            <div
              onClick={() => setShowCompareModal(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 60,
                background: 'rgba(5,12,28,0.8)',
                backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'linear-gradient(160deg, #0D1E38, #0A1628)',
                  border: '1px solid rgba(33,150,243,0.2)',
                  borderRadius: 20,
                  width: '100%', maxWidth: 560,
                  maxHeight: '90vh', overflowY: 'auto',
                  boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
                  animation: 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
                }}
              >
                {/* Header */}
                <div style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#E8EFF8',
                    fontFamily: "'Exo 2', sans-serif" }}>
                    Comparación de rutas
                  </span>
                  <button
                    onClick={() => setShowCompareModal(false)}
                    style={{ background: 'none', border: 'none', color: '#5B7BA0',
                      cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>

                {/* Tabla comparativa */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '10px 12px', width: '30%' }} />
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%',
                            background: a.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#E8EFF8',
                            fontFamily: "'Exo 2', sans-serif" }}>{a.name}</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#5B7BA0', marginTop: 2 }}>
                          {a.driver} · {a.date}
                        </div>
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%',
                            background: b.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#E8EFF8',
                            fontFamily: "'Exo 2', sans-serif" }}>{b.name}</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#5B7BA0', marginTop: 2 }}>
                          {b.driver} · {b.date}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <Row label="Entregas totales"
                      va={String(a.total)} vb={String(b.total)}
                      better={a.total > b.total ? 'a' : b.total > a.total ? 'b' : 'equal'} />
                    <Row label="Entregadas"
                      va={String(a.delivered)} vb={String(b.delivered)}
                      better={a.delivered > b.delivered ? 'a' : b.delivered > a.delivered ? 'b' : 'equal'} />
                    <Row label="Fallidas"
                      va={String(a.failed)} vb={String(b.failed)}
                      better={a.failed < b.failed ? 'a' : b.failed < a.failed ? 'b' : 'equal'} />
                    <Row label="Pendientes"
                      va={String(a.pending)} vb={String(b.pending)}
                      better={a.pending < b.pending ? 'a' : b.pending < a.pending ? 'b' : 'equal'} />
                    <Row label="Tasa de éxito"
                      va={`${a.tasa}%`} vb={`${b.tasa}%`}
                      better={a.tasa > b.tasa ? 'a' : b.tasa > a.tasa ? 'b' : 'equal'} />
                    <Row label="Km recorridos"
                      va={`${a.km} km`} vb={`${b.km} km`}
                      better={Number(a.km) < Number(b.km) ? 'a' : Number(b.km) < Number(a.km) ? 'b' : 'equal'} />
                    <Row label="Tiempo total"
                      va={`${a.mins} min`} vb={`${b.mins} min`}
                      better={a.mins < b.mins ? 'a' : b.mins < a.mins ? 'b' : 'equal'} />
                  </tbody>
                </table>

                {/* Footer */}
                <div style={{ padding: '12px 20px', textAlign: 'center' }}>
                  <button
                    onClick={() => { setShowCompareModal(false); setSelectedForCompare([]); }}
                    style={{
                      padding: '8px 20px', borderRadius: 10,
                      background: 'rgba(33,150,243,0.1)',
                      border: '1px solid rgba(33,150,243,0.2)',
                      color: '#5B7BA0', cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>

              <style>{`
                @keyframes scaleIn {
                  from { transform: scale(0.95); opacity: 0; }
                  to   { transform: scale(1); opacity: 1; }
                }
                @keyframes slideUp {
                  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
                  to   { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
              `}</style>
            </div>
          );
        })()}
      </div>
    </AuthGuard>
  );
}
