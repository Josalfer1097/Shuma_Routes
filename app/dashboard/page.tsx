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
  total_minutes?: number;
  stats: RouteStats;
  total_merchandise_value?: number;
  deliveries?: any[];
}

export default function DashboardPage() {
  const [allRoutes, setAllRoutes] = useState<APIRoute[]>([]);
  const [prevRoutes, setPrevRoutes] = useState<APIRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d');
  const [drillDown, setDrillDown] = useState<{
    type: 'total' | 'exitosas' | 'fallidas' | 'valor' | 'choferes' | null;
    title: string;
  }>({ type: null, title: '' });
  const [routesAtRisk, setRoutesAtRisk] = useState<string[]>([]);
  const [compareDrivers, setCompareDrivers] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [drillSearch, setDrillSearch] = useState('');
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

        // ── Fetch período anterior para deltas ──
        const now2 = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
        let prevUrl = '';
        if (period === 'today') {
          const yesterday = new Date(now2); yesterday.setDate(yesterday.getDate() - 1);
          prevUrl = `/api/routes/history?date=${yesterday.toLocaleDateString('en-CA')}`;
        } else if (period === '7d') {
          const from = new Date(now2); from.setDate(from.getDate() - 13);
          const to   = new Date(now2); to.setDate(to.getDate() - 7);
          prevUrl = `/api/routes/history?dateFrom=${from.toLocaleDateString('en-CA')}&dateTo=${to.toLocaleDateString('en-CA')}`;
        } else if (period === '30d') {
          const from = new Date(now2); from.setDate(from.getDate() - 59);
          const to   = new Date(now2); to.setDate(to.getDate() - 30);
          prevUrl = `/api/routes/history?dateFrom=${from.toLocaleDateString('en-CA')}&dateTo=${to.toLocaleDateString('en-CA')}`;
        }

        if (prevUrl) {
          try {
            const resPrev = await fetch(prevUrl);
            const jsonPrev = await resPrev.json();
            if (jsonPrev.ok && jsonPrev.routes) {
              setPrevRoutes(jsonPrev.routes.map((r: any) => ({
                ...r,
                total_merchandise_value: (r.deliveries || []).reduce(
                  (acc: number, d: any) => acc + (Number(d.merchandiseValue || d.address?.merchandiseValue) || 0), 0
                ),
              })));
            } else {
              setPrevRoutes([]);
            }
          } catch { setPrevRoutes([]); }
        }
      } catch (e) {
        console.error(e);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [period]);

  useEffect(() => {
    const checkRisk = async () => {
      try {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
        const res = await fetch(`/api/routes/active?date=${today}`);
        const j = await res.json();
        if (!j.ok || !j.routes) return;
        // Considerar en riesgo si hay entregas pendientes y han pasado más de 6 horas
        const now = new Date();
        const atRisk = j.routes.filter((r: any) => {
          const pending = r.stats?.pending || 0;
          if (pending === 0) return false;
          if (!r.departure_time) return false;
          const dep = new Date(`${today}T${r.departure_time}`);
          const elapsed = (now.getTime() - dep.getTime()) / 60000; // minutos
          return elapsed > 360 && pending > 0; // más de 6h con pendientes
        }).map((r: any) => r.route_alias || r.route_code || r.driver_name || 'Ruta sin nombre');
        setRoutesAtRisk(atRisk);
      } catch {}
    };
    checkRisk();
    const interval = setInterval(checkRisk, 120000); // cada 2 min
    return () => clearInterval(interval);
  }, []);

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

  // Tiempo promedio por entrega
  let totalMinutes = 0;
  let totalStops = 0;
  allRoutes.forEach(r => {
    totalMinutes += (r.total_minutes || 0);
    totalStops += (r.stats?.total || 0);
  });
  const avgMinPerStop = totalStops > 0 ? Math.round(totalMinutes / totalStops) : 0;

  let prevTotal = 0;
  let prevEntregadas = 0;
  let prevKm = 0;
  let prevMercValue = 0;
  prevRoutes.forEach(r => {
    prevTotal      += (r.stats?.total || 0);
    prevEntregadas += (r.stats?.delivered || 0) + (r.stats?.partial || 0);
    prevKm         += (r.total_km || 0);
    prevMercValue  += (r.total_merchandise_value || 0);
  });
  const prevTasa = prevTotal > 0 ? Math.round((prevEntregadas / prevTotal) * 100) : 0;

  // Helper para calcular delta
  const delta = (curr: number, prev: number): { pct: number; dir: 'up' | 'down' | 'flat' } => {
    if (prev === 0) return { pct: 0, dir: 'flat' };
    const pct = Math.round(((curr - prev) / prev) * 100);
    return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
  };

  const deltaTotal = delta(totalEntregas, prevTotal);
  const deltaTasa  = delta(tasaExito, prevTasa);
  const deltaKm    = delta(totalKm, prevKm);
  const deltaMerc  = delta(totalMercValue, prevMercValue);

  const DeltaBadge = ({ d }: { d: { pct: number; dir: 'up' | 'down' | 'flat' } }) => {
    if (d.dir === 'flat' || d.pct === 0) return null;
    const isGood = d.dir === 'up'; // para entregas/tasa/km UP es bueno; para fallidas DOWN es bueno
    return (
      <span
        key={`${d.dir}-${d.pct}-${period}`}
        style={{
          fontSize: 10, fontWeight: 700,
          color: isGood ? '#34d399' : '#f87171',
          fontFamily: "'Exo 2', sans-serif",
          display: 'inline-flex', alignItems: 'center', gap: 2,
          animation: d.dir === 'up' ? 'deltaUp 0.4s ease both' : 'deltaDown 0.4s ease both',
        }}
      >
        {d.dir === 'up' ? '↑' : '↓'}{d.pct}%
      </span>
    );
  };

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

  const dateRangeLabel = (() => {
    const fmt = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    if (period === 'today') return fmt(now);
    const from = new Date(now);
    from.setDate(from.getDate() - (period === '7d' ? 6 : 29));
    return `${fmt(from)} – ${fmt(now)}`;
  })();

  // Sparklines: últimos 7 días siempre (independiente del período)
  const sparkData = daysList.slice(-7).map(d => d.total);
  const sparkMax = Math.max(...sparkData, 1);

  const Sparkline = ({ data, color = '#2196F3' }: { data: number[]; color?: string }) => {
    const w = 64, h = 24;
    const step = w / Math.max(data.length - 1, 1);
    const points = data.map((v, i) => `${i * step},${h - (v / sparkMax) * (h - 2)}`).join(' ');
    return (
      <svg width={w} height={h} style={{ overflow: 'visible' }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.7}
        />
        {/* Dot en el último punto */}
        {data.length > 0 && (
          <circle
            cx={(data.length - 1) * step}
            cy={h - (data[data.length - 1] / sparkMax) * (h - 2)}
            r={2.5}
            fill={color}
          />
        )}
      </svg>
    );
  };

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

  // Calcular listas para drill-down
  const drillDeliveries: any = {
    total: allRoutes.flatMap(r => r.deliveries || []),
    exitosas: allRoutes.flatMap(r =>
      (r.deliveries || []).filter((d: any) =>
        d.status === 'delivered' || d.status === 'completed' || d.status === 'partial'
      )
    ),
    fallidas: allRoutes.flatMap(r =>
      (r.deliveries || []).filter((d: any) => d.status === 'failed')
    ),
    valor: allRoutes.flatMap(r =>
      (r.deliveries || []).filter((d: any) =>
        (d.merchandiseValue || d.address?.merchandiseValue || 0) > 0
      )
    ),
    choferes: Array.from(driverStats.entries()).map(([name, st]) => ({
      name, ...st,
      tasa: st.total > 0 ? Math.round((st.success / st.total) * 100) : 0,
    })),
  };

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
          {/* Exportar PDF */}
          <button
            onClick={() => window.print()}
            className="no-print flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-shuma-surface border border-shuma-border text-xs font-semibold text-shuma-muted hover:text-white hover:border-blue-500/40 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Imprimir / PDF
          </button>
          
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
          <div style={{
            background: 'rgba(33,150,243,0.08)',
            border: '1px solid rgba(33,150,243,0.2)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 11,
            color: '#60a5fa',
            fontFamily: "'Exo 2', sans-serif",
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
          }}>
            {dateRangeLabel}
          </div>
          <div className="bg-shuma-surface border border-shuma-border px-3 py-1.5 rounded-lg">
            <p className="text-xs font-bold text-shuma-text">
              <span className="text-blue-400">{allRoutes.length}</span> rutas
            </p>
          </div>
        </div>
      </header>

      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          header { position: static !important; border-bottom: 2px solid #e2e8f0 !important; background: white !important; }
          header h1 { color: #1e293b !important; }
          header p  { color: #64748b !important; }
          .shuma-card { background: white !important; border: 1px solid #e2e8f0 !important; box-shadow: none !important; }
          .shuma-card p, .shuma-card span, .shuma-card td, .shuma-card th { color: #1e293b !important; }
          [class*="text-shuma-muted"] { color: #64748b !important; }
          [class*="text-white"] { color: #1e293b !important; }
          [class*="bg-shuma"] { background: white !important; }
          .fixed { position: static !important; }
          @page { margin: 1.5cm; size: A4 landscape; }
        }
      `}</style>

      <main id="dashboard-print-area" className="p-6 max-w-7xl mx-auto space-y-6">
        
        {routesAtRisk.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 12,
            animation: 'fadeIn 0.4s ease',
          }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🚨</span>
            <div style={{ flex: 1 }}>
              <p style={{
                fontSize: 12, fontWeight: 700, color: '#f87171',
                fontFamily: "'Exo 2', sans-serif", letterSpacing: '0.06em',
                textTransform: 'uppercase', margin: 0,
              }}>
                Alerta de operación
              </p>
              <p style={{
                fontSize: 11, color: '#fca5a5',
                fontFamily: "'DM Sans', sans-serif", margin: '2px 0 0',
              }}>
                {routesAtRisk.length === 1
                  ? `${routesAtRisk[0]} lleva más de 6h activa con entregas pendientes`
                  : `${routesAtRisk.length} rutas con más de 6h activas y entregas pendientes: ${routesAtRisk.join(', ')}`
                }
              </p>
            </div>
            <a
              href="/dispatcher"
              style={{
                fontSize: 11, color: '#f87171', fontWeight: 700,
                fontFamily: "'Exo 2', sans-serif",
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6, padding: '4px 10px',
                textDecoration: 'none', flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              Ver mapa →
            </a>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div 
            onClick={() => { setDrillDown({ type: 'total', title: 'Todas las entregas' }); setDrillSearch(''); }}
            className="shuma-card rounded-2xl p-5 border border-shuma-border cursor-pointer hover:border-blue-500/40 transition-colors" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Entregas totales</p>
                <p className="text-[28px] font-bold text-white leading-tight">{totalEntregas}</p>
                <DeltaBadge d={deltaTotal} />
                <div style={{ marginTop: 8 }}><Sparkline data={sparkData} color="#2196F3" /></div>
              </div>
              <span className="text-3xl opacity-80">📦</span>
            </div>
            <div className="mt-2 text-xs font-medium text-blue-400 bg-blue-500/10 inline-block px-2 py-0.5 rounded border border-blue-500/20">
              vs. {period === 'today' ? 'ayer' : period === '7d' ? '7 días anteriores' : '30 días anteriores'}
            </div>
          </div>

          <div 
            onClick={() => { setDrillDown({ type: 'exitosas', title: 'Entregas exitosas' }); setDrillSearch(''); }}
            className="shuma-card rounded-2xl p-5 border border-shuma-border cursor-pointer hover:border-blue-500/40 transition-colors" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Tasa de éxito</p>
                <p className="text-[28px] font-bold text-white leading-tight">{tasaExito}%</p>
                <DeltaBadge d={deltaTasa} />
                <div style={{ marginTop: 8 }}><Sparkline data={sparkData} color="#10B981" /></div>
              </div>
              <span className="text-3xl opacity-80">✓</span>
            </div>
            <div className={`mt-2 text-xs font-medium inline-block px-2 py-0.5 rounded border ${tasaExito >= 80 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'}`}>
              vs. {period === 'today' ? 'ayer' : period === '7d' ? '7 días anteriores' : '30 días anteriores'}
            </div>
          </div>

          <div className="shuma-card rounded-2xl p-5 border border-shuma-border" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Km recorridos</p>
                <p className="text-[28px] font-bold text-white leading-tight">{totalKm.toFixed(0)} <span className="text-lg text-shuma-muted font-normal">km</span></p>
                <DeltaBadge d={deltaKm} />
                <div style={{ marginTop: 8 }}><Sparkline data={sparkData} color="#06B6D4" /></div>
              </div>
              <span className="text-3xl opacity-80">🛣</span>
            </div>
            <div className="mt-2 text-xs font-medium text-cyan-400 bg-cyan-500/10 inline-block px-2 py-0.5 rounded border border-cyan-500/20">
              vs. {period === 'today' ? 'ayer' : period === '7d' ? '7 días anteriores' : '30 días anteriores'}
            </div>
          </div>

          <div 
            onClick={() => { setDrillDown({ type: 'choferes', title: 'Choferes del período' }); setDrillSearch(''); }}
            className="shuma-card rounded-2xl p-5 border border-shuma-border cursor-pointer hover:border-blue-500/40 transition-colors" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Choferes activos</p>
                <p className="text-[28px] font-bold text-white leading-tight">{choferesActivos}</p>
              </div>
              <span className="text-3xl opacity-80">👤</span>
            </div>
            <div className="mt-2 text-xs font-medium text-violet-400 bg-violet-500/10 inline-block px-2 py-0.5 rounded border border-violet-500/20">
              vs. {period === 'today' ? 'ayer' : period === '7d' ? '7 días anteriores' : '30 días anteriores'}
            </div>
          </div>

          <div 
            onClick={() => { setDrillDown({ type: 'valor', title: 'Entregas con valor de mercancía' }); setDrillSearch(''); }}
            className="shuma-card rounded-2xl p-5 border border-shuma-border cursor-pointer hover:border-blue-500/40 transition-colors" style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">Valor Mercancía</p>
                <p className="text-[22px] font-bold text-white leading-tight">
                  ${totalMercValue.toLocaleString('es-MX', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </p>
                <DeltaBadge d={deltaMerc} />
                <div style={{ marginTop: 8 }}><Sparkline data={sparkData} color="#F59E0B" /></div>
              </div>
              <span className="text-3xl opacity-80">💰</span>
            </div>
            <div className="mt-2 text-xs font-medium text-amber-400 bg-amber-500/10 inline-block px-2 py-0.5 rounded border border-amber-500/20">
              vs. {period === 'today' ? 'ayer' : period === '7d' ? '7 días anteriores' : '30 días anteriores'}
            </div>
          </div>

          <div
            className="shuma-card rounded-2xl p-5 border border-shuma-border"
            style={{ backgroundColor: 'rgba(17,32,64,0.82)' }}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold text-shuma-muted uppercase tracking-wider mb-1 font-['Exo_2']">
                  Tiempo / entrega
                </p>
                <p className="text-[28px] font-bold text-white leading-tight">
                  {avgMinPerStop > 0 ? `${avgMinPerStop}` : '—'}
                  {avgMinPerStop > 0 && <span className="text-lg text-shuma-muted font-normal"> min</span>}
                </p>
                <span style={{ fontSize: 10, color: '#5B7BA0', fontFamily: "'Exo 2', sans-serif" }}>
                  promedio por entrega
                </span>
              </div>
              <span className="text-3xl opacity-80">⏱</span>
            </div>
            <div className="mt-2 text-xs font-medium text-teal-400 bg-teal-500/10 inline-block px-2 py-0.5 rounded border border-teal-500/20">
              {totalMinutes > 0 ? `${totalMinutes.toFixed(0)} min totales` : 'Sin datos'}
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
                  <div
                    className="w-full sm:w-10 rounded-t-md relative flex items-end justify-center overflow-hidden group-hover:opacity-90 transition-opacity"
                    style={{
                      height: `${totalHeight}%`,
                      minHeight: d.total > 0 ? '4px' : '0',
                      background: 'linear-gradient(to top, rgba(30,41,59,0.9), rgba(51,65,85,0.5))',
                    }}
                  >
                    {/* Barra de éxito con gradiente */}
                    <div
                      className="w-full absolute bottom-0 rounded-t-sm"
                      style={{
                        height: `${successHeight}%`,
                        background: 'linear-gradient(to top, #059669, #34d399)',
                        animation: `barGrow 0.6s ease-out ${i * 60}ms both`,
                      }}
                    />
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
            {compareDrivers.length === 2 && (
              <button
                onClick={() => setShowCompare(true)}
                style={{
                  fontSize: 11, padding: '4px 12px',
                  background: 'rgba(33,150,243,0.15)',
                  border: '1px solid rgba(33,150,243,0.35)',
                  borderRadius: 99, cursor: 'pointer',
                  color: '#60a5fa', fontFamily: "'Exo 2', sans-serif",
                  fontWeight: 700, letterSpacing: '0.06em',
                  animation: 'fadeIn 0.3s ease',
                  marginTop: 8,
                }}
              >
                Comparar {compareDrivers[0].split(' ')[0]} vs {compareDrivers[1].split(' ')[0]} →
              </button>
            )}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-xs text-shuma-muted bg-slate-900/40 uppercase font-['Exo_2']">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
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
                    <tr
                      key={ch.name}
                      style={{
                        background: idx % 2 === 0
                          ? 'transparent'
                          : 'rgba(255,255,255,0.025)',
                        transition: 'background 0.15s',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(33,150,243,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.025)')}
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={compareDrivers.includes(ch.name)}
                          onChange={e => {
                            if (e.target.checked) {
                              if (compareDrivers.length < 2) setCompareDrivers(prev => [...prev, ch.name]);
                            } else {
                              setCompareDrivers(prev => prev.filter(n => n !== ch.name));
                            }
                          }}
                          onClick={e => e.stopPropagation()}
                          style={{ accentColor: '#2196F3', width: 14, height: 14, cursor: 'pointer' }}
                        />
                      </td>
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
        {/* Drill-down drawer */}
        {drillDown.type && (
          <div
            className="fixed inset-0 z-50 flex"
            onClick={() => setDrillDown({ type: null, title: '' })}
          >
            {/* Backdrop */}
            <div className="flex-1 bg-black/40 backdrop-blur-sm" />

            {/* Panel */}
            <div
              className="w-full max-w-md bg-shuma-bg border-l border-shuma-border overflow-hidden flex flex-col shadow-2xl"
              style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16,1,0.3,1) forwards' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header del drawer */}
              <div className="p-5 border-b border-shuma-border flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white">{drillDown.title}</h3>
                  <p className="text-xs text-shuma-muted mt-0.5">
                    {drillDown.type === 'choferes'
                      ? `${drillDeliveries.choferes.length} choferes`
                      : `${(drillDeliveries[drillDown.type!] || []).length} registros`}
                  </p>
                </div>
                <button
                  onClick={() => setDrillDown({ type: null, title: '' })}
                  className="p-2 rounded-lg text-shuma-muted hover:text-white hover:bg-shuma-surface transition-colors"
                >
                  ✕
                </button>
              </div>

              {drillDown.type !== 'choferes' && (
                <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <input
                    type="text"
                    placeholder="Buscar cliente, factura..."
                    value={drillSearch}
                    onChange={e => setDrillSearch(e.target.value)}
                    style={{
                      width: '100%', padding: '7px 12px',
                      background: '#060F1D', border: '1px solid #0d1f3a',
                      borderRadius: 8, color: '#E8EFF8', fontSize: 12,
                      fontFamily: "'DM Sans', sans-serif", outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* Contenido */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {drillDown.type === 'choferes' ? (
                  // Vista de choferes
                  drillDeliveries.choferes
                    .sort((a: any, b: any) => b.tasa - a.tasa)
                    .map((ch: any, i: number) => (
                      <div key={ch.name}
                        className="p-3 rounded-xl bg-shuma-surface border border-shuma-border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-shuma-muted w-5">#{i+1}</span>
                            <span className="font-semibold text-white text-sm">{ch.name}</span>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            ch.tasa >= 90 ? 'bg-emerald-500/15 text-emerald-400' :
                            ch.tasa >= 70 ? 'bg-amber-500/15 text-amber-400' :
                                            'bg-red-500/15 text-red-400'
                          }`}>{ch.tasa}%</span>
                        </div>
                        <div className="flex gap-3 text-xs text-shuma-muted">
                          <span className="text-emerald-400">✓ {ch.success}</span>
                          <span className="text-red-400">✗ {ch.failed}</span>
                          <span>Total: {ch.total}</span>
                          <span>{ch.km.toFixed(1)} km</span>
                        </div>
                      </div>
                    ))
                ) : (
                  // Vista de entregas
                  (() => {
                    const filteredDrillItems = (drillDeliveries[drillDown.type!] || []).filter((d: any) => {
                      if (!drillSearch) return true;
                      const addr = d.address || d;
                      const s = drillSearch.toLowerCase();
                      return (
                        (addr.clientName || addr.name || '').toLowerCase().includes(s) ||
                        (addr.invoice || '').toLowerCase().includes(s) ||
                        (addr.label || addr.raw || '').toLowerCase().includes(s)
                      );
                    });
                    return filteredDrillItems.map((d: any, i: number) => {
                    const addr = d.address || d;
                    const val = addr.merchandiseValue || d.merchandiseValue || 0;
                    const statusColor =
                      d.status === 'delivered' || d.status === 'completed' ? 'text-emerald-400' :
                      d.status === 'partial' ? 'text-amber-400' :
                      d.status === 'failed' ? 'text-red-400' : 'text-shuma-muted';

                    return (
                      <div key={i}
                        className="p-3 rounded-xl bg-shuma-surface border border-shuma-border">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-white text-sm truncate">
                              {addr.clientName || addr.name || 'Sin nombre'}
                            </p>
                            {addr.invoice && (
                              <p className="text-xs text-blue-400 font-mono mt-0.5">{addr.invoice}</p>
                            )}
                            <p className="text-xs text-shuma-muted mt-0.5 truncate">
                              {addr.label || addr.raw || ''}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-xs font-bold ${statusColor}`}>
                              {d.status === 'delivered' || d.status === 'completed' ? '✓ Entregado' :
                               d.status === 'partial' ? '◑ Parcial' :
                               d.status === 'failed' ? '✗ Fallido' : '○ Pendiente'}
                            </span>
                            {val > 0 && (
                              <span className="text-[10px] text-amber-400 font-semibold">
                                💰 ${val.toLocaleString('es-MX')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })})()
                )}
              </div>
            </div>
          </div>
        )}

        {showCompare && compareDrivers.length === 2 && (() => {
          const getStats = (name: string) => {
            const s = driverStats.get(name) || { total: 0, success: 0, failed: 0, km: 0 };
            return { ...s, tasa: s.total > 0 ? Math.round((s.success / s.total) * 100) : 0 };
          };
          const a = getStats(compareDrivers[0]);
          const b = getStats(compareDrivers[1]);

          const Row = ({ label, va, vb, suffix = '', higherIsBetter = true }: {
            label: string; va: number; vb: number; suffix?: string; higherIsBetter?: boolean;
          }) => {
            const aWins = higherIsBetter ? va >= vb : va <= vb;
            return (
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '10px 16px', fontSize: 12, color: aWins ? '#34d399' : '#f87171', fontWeight: 700, textAlign: 'right' }}>
                  {va.toFixed(va % 1 === 0 ? 0 : 1)}{suffix}
                </td>
                <td style={{ padding: '10px 16px', fontSize: 11, color: '#5B7BA0', textAlign: 'center', fontFamily: "'Exo 2', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {label}
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: !aWins ? '#34d399' : '#f87171', fontWeight: 700 }}>
                  {vb.toFixed(vb % 1 === 0 ? 0 : 1)}{suffix}
                </td>
              </tr>
            );
          };

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(5,12,28,0.85)', backdropFilter: 'blur(8px)' }}
              onClick={() => setShowCompare(false)}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'linear-gradient(160deg, #0D1E38, #0A1628)',
                  border: '1px solid rgba(33,150,243,0.2)',
                  borderRadius: 20, maxWidth: 520, width: '100%',
                  boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
                  animation: 'fadeIn 0.3s ease',
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ flex: 1, padding: '20px', textAlign: 'right', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#E8EFF8', fontFamily: "'Exo 2', sans-serif", margin: 0 }}>
                      {compareDrivers[0]}
                    </p>
                  </div>
                  <div style={{ padding: '20px 16px', textAlign: 'center', alignSelf: 'center' }}>
                    <span style={{ fontSize: 12, color: '#3B5270', fontFamily: "'Exo 2', sans-serif" }}>VS</span>
                  </div>
                  <div style={{ flex: 1, padding: '20px' }}>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#E8EFF8', fontFamily: "'Exo 2', sans-serif", margin: 0 }}>
                      {compareDrivers[1]}
                    </p>
                  </div>
                </div>
                {/* Tabla */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <Row label="Entregas" va={a.total} vb={b.total} />
                    <Row label="Exitosas" va={a.success} vb={b.success} />
                    <Row label="Fallidas" va={a.failed} vb={b.failed} higherIsBetter={false} />
                    <Row label="Tasa éxito" va={a.tasa} vb={b.tasa} suffix="%" />
                    <Row label="Km recorridos" va={a.km} vb={b.km} />
                  </tbody>
                </table>
                {/* Footer */}
                <div style={{ padding: '14px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button
                    onClick={() => setShowCompare(false)}
                    style={{
                      background: 'rgba(33,150,243,0.1)', border: '1px solid rgba(33,150,243,0.2)',
                      borderRadius: 10, padding: '8px 24px', color: '#60a5fa',
                      fontSize: 12, cursor: 'pointer', fontFamily: "'Exo 2', sans-serif", fontWeight: 600,
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      </main>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes barGrow {
          from { height: 0; }
          to   { height: var(--bar-h); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes deltaUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes deltaDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
