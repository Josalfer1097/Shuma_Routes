'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import type { Route, GlobalConfig } from '@/types';
import { Package, Truck, Clock, Map as MapIcon, ArrowLeft } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const role = sessionStorage.getItem('shuma_role');
    if (!role || role === 'driver') {
      router.push('/');
      return;
    }

    try {
      const storedRoutes = sessionStorage.getItem('shuma_routes');
      const storedConfig = sessionStorage.getItem('shuma_global_config');
      
      if (storedRoutes) setRoutes(JSON.parse(storedRoutes));
      if (storedConfig) setGlobalConfig(JSON.parse(storedConfig));
    } catch (e) {
      console.error('Error al cargar datos del dashboard', e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  if (loading) return null;

  const totalDrivers = routes.length;
  const totalStops = routes.reduce((acc, r) => acc + r.stops.length, 0);
  const totalDistanceMeters = routes.reduce((acc, r) => acc + (r.totalDistance || 0), 0);
  const totalDistanceKm = (totalDistanceMeters / 1000).toFixed(1);
  const maxStops = Math.max(...routes.map(r => r.stops.length), 1);

  const [dHour, dMin] = (globalConfig?.deadlineTime || '17:45').split(':').map(Number);
  const deadlineMins = dHour * 60 + dMin;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg p-6 space-y-6">
        {/* HEADER */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.back()}
            className="p-2 bg-shuma-surface border border-shuma-border rounded-xl hover:bg-shuma-blue/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard del Día</h1>
            <p className="text-sm text-shuma-muted">Monitoreo de viabilidad y KPIs de la jornada actual</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-shuma-surface p-4 rounded-xl border border-shuma-border flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg"><Truck size={20} /></div>
            <div>
              <p className="text-xs text-shuma-muted font-bold uppercase tracking-wider">Choferes</p>
              <p className="text-2xl font-bold text-white">{totalDrivers}</p>
            </div>
          </div>
          <div className="bg-shuma-surface p-4 rounded-xl border border-shuma-border flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg"><Package size={20} /></div>
            <div>
              <p className="text-xs text-shuma-muted font-bold uppercase tracking-wider">Entregas</p>
              <p className="text-2xl font-bold text-white">{totalStops}</p>
            </div>
          </div>
          <div className="bg-shuma-surface p-4 rounded-xl border border-shuma-border flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg"><MapIcon size={20} /></div>
            <div>
              <p className="text-xs text-shuma-muted font-bold uppercase tracking-wider">Distancia</p>
              <p className="text-2xl font-bold text-white">{totalDistanceKm} km</p>
            </div>
          </div>
          <div className="bg-shuma-surface p-4 rounded-xl border border-shuma-border flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg"><Clock size={20} /></div>
            <div>
              <p className="text-xs text-shuma-muted font-bold uppercase tracking-wider">Límite</p>
              <p className="text-2xl font-bold text-white">{globalConfig?.deadlineTime || '17:45'}</p>
            </div>
          </div>
        </div>

        {/* TABLA DE VIABILIDAD Y BARRAS */}
        <div className="bg-shuma-surface rounded-xl border border-shuma-border overflow-hidden">
          <div className="p-4 border-b border-shuma-border">
            <h2 className="text-lg font-bold text-white">Desglose de Rutas y Viabilidad</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-shuma-muted uppercase bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3">Chofer</th>
                  <th className="px-4 py-3 text-center">Entregas</th>
                  <th className="px-4 py-3 w-48">Volumen</th>
                  <th className="px-4 py-3 text-center">Salida</th>
                  <th className="px-4 py-3 text-center">Regreso Est.</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-shuma-border/50">
                {routes.map((route) => {
                  let depTimeStr = route.departureTime || globalConfig?.departureTime || '08:00';
                  const [h, m] = depTimeStr.split(':').map(Number);
                  const totalMins = Math.round((route.totalDuration || 0) / 60);
                  const returnMins = (h * 60 + m) + totalMins;
                  
                  let status = 'En tiempo';
                  let statusClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                  if (returnMins > deadlineMins) {
                    status = 'Fuera de tiempo';
                    statusClass = 'bg-red-500/10 text-red-400 border-red-500/20';
                  } else if (returnMins > deadlineMins - 30) {
                    status = 'Riesgo';
                    statusClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                  }

                  const retH = Math.floor(returnMins / 60) % 24;
                  const retM = returnMins % 60;
                  const etaReturn = `${retH.toString().padStart(2, '0')}:${retM.toString().padStart(2, '0')}`;

                  const percent = Math.round((route.stops.length / maxStops) * 100);

                  return (
                    <tr key={route.vehicleId} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-200">
                        {route.driverName}
                        <span className="block text-[10px] text-shuma-muted">{route.vehicleType}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-300">{route.stops.length}</td>
                      <td className="px-4 py-3">
                        <div className="w-full bg-slate-900 rounded-full h-2 border border-shuma-border">
                          <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">{depTimeStr}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-200">{etaReturn}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border ${statusClass}`}>
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
