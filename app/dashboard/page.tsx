'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface RouteStats {
  total: number;
  delivered: number;
  partial: number;
  failed: number;
  pending: number;
}

interface APIRoute {
  id: string;
  date: string;
  driver_name: string | null;
  total_km: number;
  stats: RouteStats;
  total_merchandise_value?: number;
}

export default function DashboardPage() {
  const [allRoutes, setAllRoutes] = useState<APIRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(false);
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
        const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

        let historyUrl = '';
        let activeUrl  = `/api/routes/active?date=${today}`;

        if (period === 'today') {
          historyUrl = `/api/routes/history?date=${today}`;
        } else if (period === '7d') {
          const from = new Date(now); from.setDate(from.getDate() - 6);
          historyUrl = `/api/routes/history?dateFrom=${from.toLocaleDateString('en-CA')}&dateTo=${today}`;
        } else if (period === '30d') {
          const from = new Date(now); from.setDate(from.getDate() - 29);
          historyUrl = `/api/routes/history?dateFrom=${from.toLocaleDateString('en-CA')}&dateTo=${today}`;
        }

        const [resHistory, resActive] = await Promise.all([
          fetch(historyUrl),
          fetch(activeUrl),
        ]);

        const jsonHistory = await resHistory.json();
        const jsonActive  = await resActive.json();

        let combined: APIRoute[] = [];

        if (jsonHistory.ok && jsonHistory.routes) {
          combined = combined.concat(jsonHistory.routes.map((r: any) => ({
            ...r,
            total_merchandise_value: (r.deliveries || []).reduce(
              (acc: number, d: any) => acc + (Number(d.merchandiseValue || d.address?.merchandiseValue) || 0), 0
            ),
          })));
        }
        if (jsonActive.ok && jsonActive.routes) {
          combined = combined.concat(jsonActive.routes.map((r: any) => ({
            ...r,
            total_merchandise_value: (r.deliveries || []).reduce(
              (acc: number, d: any) => acc + (Number(d.merchandiseValue || d.address?.merchandiseValue) || 0), 0
            ),
          })));
        }

        setAllRoutes(combined);
      } catch (e) {
        console.error(e);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [period]);

  if (loading) {
    return (
      <div className="min-h-screen bg-shuma-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 opacity-0 transition-opacity duration-500" style={{ opacity: 1 }}>
          <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-shuma-muted text-sm font-medium">Calculando métricas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-shuma-bg flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center max-w-sm">
          <span className="text-3xl mb-3 block">⚠️</span>
          <h2 className="text-red-400 font-bold mb-2">Error de conexión</h2>
          <p className="text-red-400/70 text-sm mb-4">No pudimos cargar los datos del dashboard.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-bold transition-colors">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (allRoutes.length === 0) {
    return (
      <div className="min-h-screen bg-shuma-bg flex items-center justify-center p-4">
        <div className="text-center">
          <span className="text-4xl mb-4 block">📭</span>
          <h2 className="text-white font-bold text-lg mb-2">Sin datos recientes</h2>
          <p className="text-shuma-muted text-sm mb-6">No hay rutas registradas en los últimos días.</p>
          <Link href="/dispatcher" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors">
            Ir a crear rutas
          </Link>
        </div>
      </div>
    );
  }

  // KPIs
  let totalEntregas = 0;
  let entregadas = 0;
  let totalKm = 0;
  let totalMercValue = 0;
  const driverNames = new Set<string>();

  allRoutes.forEach(r => {
    totalEntregas += (r.stats?.total || 0);
    entregadas += (r.stats?.delivered || 0) + (r.stats?.partial || 0);
    totalKm += (r.total_km || 0);
    totalMercValue += (r.total_merchandise_value || 0);
    if (r.driver_name) driverNames.add(r.driver_name);
  });

  const tasaExito = totalEntregas > 0 ? Math.round((entregadas / totalEntregas) * 100) : 0;
  const choferesActivos = driverNames.size;

  // Gráfico Semanal
  const daysMap = new Map<string, { total: number, success: number }>();
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const daysToShow = period === 'today' ? 1 : period === '7d' ? 7 : 30;
  for (let i = daysToShow - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    daysMap.set(dateStr, { total: 0, success: 0 });
  }

  allRoutes.forEach(r => {
    if (daysMap.has(r.date)) {
      const data = daysMap.get(r.date)!;
      data.total += (r.stats?.total || 0);
      data.success += (r.stats?.delivered || 0) + (r.stats?.partial || 0);
    }
  });

  const daysList = Array.from(daysMap.entries()).map(([dateStr, data]) => {
    const d = new Date(dateStr + 'T12:00:00');
    const label = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
    return { dateStr, label, ...data };
  });

  const maxEntregas = Math.max(...daysList.map(d => d.total), 1);

  // Ranking de choferes
  const driverStats = new Map<string, { total: number, success: number, failed: number, km: number }>();
  allRoutes.forEach(r => {
    if (!r.driver_name) return;
    if (!driverStats.has(r.driver_name)) {
      driverStats.set(r.driver_name, { total: 0, success: 0, failed: 0, km: 0 });
    }
    const st = driverStats.get(r.driver_name)!;
    st.total += (r.stats?.total || 0);
    st.success += (r.stats?.delivered || 0) + (r.stats?.partial || 0);
    st.failed += (r.stats?.failed || 0);
    st.km += (r.total_km || 0);
  });

  const ranking = Array.from(driverStats.entries()).map(([name, st]) => {
    const tasa = st.total > 0 ? Math.round((st.success / st.total) * 100) : 0;
    return { name, ...st, tasa };
  }).sort((a, b) => b.tasa - a.tasa).slice(0, 10);

  return (
    <div className="min-h-screen bg-shuma-bg opacity-0 transition-opacity duration-500 font-['DM_Sans']" style={{ opacity: 1 }}>
      
      <header className="sticky top-0 z-50 bg-shuma-bg/90 backdrop-blur-md border-b border-shuma-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dispatcher" className="w-8 h-8 flex items-center justify-center rounded-lg bg-shuma-surface hover:bg-shuma-border border border-shuma-border transition-colors text-shuma-muted hover:text-white">
            ←
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white font-['Exo_2'] flex items-center gap-2">
              <span className="text-2xl">📊</span> Intelligence Hub
            </h1>
            <p className="text-xs text-shuma-muted font-medium mt-0.5">
              {period === 'today' ? 'Hoy' : period === '7d' ? 'Últimos 7 días' : 'Últimos 30 días'} · CDMX
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de período */}
          <div className="flex items-center bg-shuma-surface border border-shuma-border rounded-xl overflow-hidden text-xs font-bold">
            {(['today', '7d', '30d'] as const).map((p) => {
              const labels = { today: 'Hoy', '7d': '7 días', '30d': '30 días' };
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 transition-colors ${
                    period === p
                      ? 'bg-blue-600 text-white'
                      : 'text-shuma-muted hover:text-white hover:bg-shuma-border'
                  }`}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>
          <div className="bg-shuma-surface border border-shuma-border px-3 py-1.5 rounded-lg">
            <p className="text-xs font-bold text-shuma-text">
              <span className="text-blue-400">{allRoutes.length}</span> rutas
            </p>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        
        {/* KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="shuma-card rounded-2xl p-5 border border-shuma-border" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Entregas totales</p>
                <p className="text-[28px] font-bold text-white">{totalEntregas}</p>
              </div>
              <span className="text-3xl opacity-80">📦</span>
            </div>
            <div className="mt-2 text-xs font-medium text-blue-400 bg-blue-500/10 inline-block px-2 py-0.5 rounded border border-blue-500/20">
              Volumen general
            </div>
          </div>

          <div className="shuma-card rounded-2xl p-5 border border-shuma-border" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Tasa de éxito</p>
                <p className="text-[28px] font-bold text-white">{tasaExito}%</p>
              </div>
              <span className="text-3xl opacity-80">✓</span>
            </div>
            <div className={`mt-2 text-xs font-medium inline-block px-2 py-0.5 rounded border ${tasaExito >= 80 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'}`}>
              Efectividad global
            </div>
          </div>

          <div className="shuma-card rounded-2xl p-5 border border-shuma-border" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Km recorridos</p>
                <p className="text-[28px] font-bold text-white">{totalKm.toFixed(0)} <span className="text-lg text-shuma-muted font-normal">km</span></p>
              </div>
              <span className="text-3xl opacity-80">🛣</span>
            </div>
            <div className="mt-2 text-xs font-medium text-cyan-400 bg-cyan-500/10 inline-block px-2 py-0.5 rounded border border-cyan-500/20">
              Distancia total
            </div>
          </div>

          <div className="shuma-card rounded-2xl p-5 border border-shuma-border" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Choferes activos</p>
                <p className="text-[28px] font-bold text-white">{choferesActivos}</p>
              </div>
              <span className="text-3xl opacity-80">👤</span>
            </div>
            <div className="mt-2 text-xs font-medium text-violet-400 bg-violet-500/10 inline-block px-2 py-0.5 rounded border border-violet-500/20">
              Fuerza laboral
            </div>
          </div>

          <div className="shuma-card rounded-2xl p-5 border border-shuma-border" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Valor Mercancía</p>
                <p className="text-[22px] font-bold text-white">
                  ${totalMercValue.toLocaleString('es-MX', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
              <span className="text-3xl opacity-80">💰</span>
            </div>
            <div className="mt-2 text-xs font-medium text-amber-400 bg-amber-500/10 inline-block px-2 py-0.5 rounded border border-amber-500/20">
              {period === 'today' ? 'Hoy' : period === '7d' ? 'Últimos 7 días' : 'Últimos 30 días'}
            </div>
          </div>
        </div>

        {/* GRAFICO SEMANAL */}
        <div className="shuma-card rounded-2xl p-6 border border-shuma-border bg-shuma-surface">
          <h2 className="text-base font-bold text-white font-['Exo_2'] mb-6 flex items-center gap-2">
            <span className="text-blue-500">■</span> Evolución Semanal
          </h2>
          
          <div className="flex items-end justify-around h-[160px] pb-6 relative">
            {daysList.map((d, i) => {
              const totalHeight = (d.total / maxEntregas) * 100;
              const successHeight = d.total > 0 ? (d.success / d.total) * 100 : 0;
              const dRate = d.total > 0 ? Math.round((d.success / d.total) * 100) : 0;

              return (
                <div key={i} className="flex flex-col items-center justify-end h-full relative group" style={{ width: '10%' }}>
                  
                  {/* Tooltip */}
                  <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs p-2 rounded-lg border border-slate-700 pointer-events-none z-10 w-max text-center shadow-xl">
                    <p className="font-bold border-b border-slate-700 pb-1 mb-1">{d.dateStr}</p>
                    <p>Total: {d.total}</p>
                    <p className="text-emerald-400">Éxito: {d.success} ({dRate}%)</p>
                  </div>

                  {/* Barra contenedor (Total) */}
                  <div className="w-full sm:w-10 bg-slate-800/50 rounded-t-md relative flex items-end justify-center overflow-hidden transition-all group-hover:bg-slate-700/50" style={{ height: `${totalHeight}%`, minHeight: d.total > 0 ? '4px' : '0' }}>
                    
                    {/* Barra de éxito (Verde) */}
                    <div className="w-full bg-emerald-500 rounded-t-sm absolute bottom-0 transition-all duration-700 ease-out" style={{ height: `${successHeight}%` }} />
                    
                  </div>
                  
                  {/* Etiqueta X */}
                  <span className="absolute -bottom-6 text-[10px] sm:text-xs font-medium text-shuma-muted whitespace-nowrap capitalize">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RANKING DE CHOFERES */}
        <div className="shuma-card rounded-2xl border border-shuma-border bg-shuma-surface overflow-hidden">
          <div className="p-5 border-b border-shuma-border">
            <h2 className="text-base font-bold text-white font-['Exo_2'] flex items-center gap-2">
              <span>🏆</span> Top 10 Choferes
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-xs text-shuma-muted bg-slate-900/40 uppercase font-['Exo_2']">
                <tr>
                  <th className="px-5 py-3 font-bold">Pos</th>
                  <th className="px-5 py-3 font-bold">Chofer</th>
                  <th className="px-5 py-3 font-bold text-right">Entregas</th>
                  <th className="px-5 py-3 font-bold text-right">Tasa de éxito</th>
                  <th className="px-5 py-3 font-bold text-right">Km recorridos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-shuma-border/50">
                {ranking.map((ch, idx) => {
                  let badgeClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                  if (ch.tasa < 80) badgeClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                  if (ch.tasa < 60) badgeClass = 'text-red-400 bg-red-500/10 border-red-500/20';

                  let posEmoji = `#${idx + 1}`;
                  if (idx === 0) posEmoji = '🥇';
                  else if (idx === 1) posEmoji = '🥈';
                  else if (idx === 2) posEmoji = '🥉';

                  return (
                    <tr key={ch.name} className={idx % 2 === 0 ? 'bg-transparent hover:bg-slate-800/30 transition-colors' : 'bg-slate-900/20 hover:bg-slate-800/30 transition-colors'}>
                      <td className="px-5 py-3 font-bold text-slate-400 text-center w-12">{posEmoji}</td>
                      <td className="px-5 py-3 font-bold text-white">{ch.name}</td>
                      <td className="px-5 py-3 text-right font-medium text-slate-300">{ch.total}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${ch.tasa}%`, backgroundColor: ch.tasa >= 80 ? '#10b981' : ch.tasa >= 60 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span className={`px-2 py-0.5 rounded border text-[11px] font-bold w-12 text-center ${badgeClass}`}>
                            {ch.tasa}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-slate-400">{ch.km.toFixed(1)} km</td>
                    </tr>
                  );
                })}
                {ranking.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-shuma-muted text-sm">
                      No hay información de choferes para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
