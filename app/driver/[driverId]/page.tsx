'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Route, Stop, SharedRouteState } from '@/types';
import StopList from '@/components/driver/StopList';

const STORAGE_KEY = 'shuma-rutas-driver-stops';

export default function DriverPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const driverId = params.driverId as string;

  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Cargar ruta desde URL params o localStorage
  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      // 1. Intentar desde URL params (link compartido por administrador)
      const dataParam = searchParams.get('data');
      if (dataParam) {
        const decoded = JSON.parse(decodeURIComponent(atob(dataParam))) as SharedRouteState;
        const targetRoute = decoded.routes.find((r) => r.vehicleId === driverId);

        if (targetRoute) {
          // Restaurar estado de stops desde localStorage si existe
          const savedStops = localStorage.getItem(`${STORAGE_KEY}-${driverId}`);
          let initialStops = targetRoute.stops;

          if (savedStops) {
            const savedData = JSON.parse(savedStops) as { id: string; status: Stop['status'] }[];
            initialStops = targetRoute.stops.map((s) => {
              const saved = savedData.find((d) => d.id === s.address.id);
              return saved ? { ...s, status: saved.status } : s;
            });
          }

          // Guardar en localStorage para acceso futuro sin URL
          localStorage.setItem(
            `${STORAGE_KEY}-${driverId}-route`,
            JSON.stringify(targetRoute)
          );

          setRoute(targetRoute);
          setStops(initialStops);
          setLoading(false);
          return;
        }
      }

      // 2. Intentar desde localStorage (acceso directo sin data param)
      const savedRoute = localStorage.getItem(`${STORAGE_KEY}-${driverId}-route`);
      if (savedRoute) {
        const parsedRoute = JSON.parse(savedRoute) as Route;
        const savedStops = localStorage.getItem(`${STORAGE_KEY}-${driverId}`);
        let initialStops = parsedRoute.stops;

        if (savedStops) {
          const savedData = JSON.parse(savedStops) as { id: string; status: Stop['status'] }[];
          initialStops = parsedRoute.stops.map((s) => {
            const saved = savedData.find((d) => d.id === s.address.id);
            return saved ? { ...s, status: saved.status } : s;
          });
        }

        setRoute(parsedRoute);
        setStops(initialStops);
        setLoading(false);
        return;
      }

      setError('No se encontró información de ruta. Pide al administrador que te comparta el link.');
    } catch {
      setError('Error al cargar la ruta. El link puede estar dañado.');
    }

    setLoading(false);
  }, [driverId, searchParams]);

  // Marcar entrega como completada
  const handleComplete = useCallback(
    (addressId: string) => {
      setStops((prev) => {
        const updated = prev.map((s) =>
          s.address.id === addressId ? { ...s, status: 'completed' as const } : s
        );

        // Persistir en localStorage
        const toSave = updated.map((s) => ({ id: s.address.id, status: s.status }));
        localStorage.setItem(`${STORAGE_KEY}-${driverId}`, JSON.stringify(toSave));

        return updated;
      });
    },
    [driverId]
  );

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A]">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-10 h-10 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-slate-400 text-sm">Cargando tu ruta…</span>
        </div>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0F172A] px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Ruta no encontrada</h2>
        <p className="text-sm text-slate-400 mb-6 max-w-xs">{error}</p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white
                     text-sm font-medium transition-colors"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A]">
      {/* Header fijo */}
      <header className="sticky top-0 z-10 px-4 py-3 border-b border-slate-700/50
                          bg-[#0F172A]/95 backdrop-blur">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: route.color + '22' }}
            >
              <svg className="w-4 h-4" style={{ color: route.color }} fill="none"
                viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-slate-500">Shuma Rutas</p>
              <p className="text-sm font-semibold text-white">{route.driverName}</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs text-slate-500">
              {stops.filter((s) => s.status === 'completed').length}/{stops.length}
            </p>
            <p className="text-xs text-slate-600">entregas</p>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="px-4 py-4 pb-8 max-w-lg mx-auto">
        <StopList
          route={route}
          stops={stops}
          onComplete={handleComplete}
        />
      </main>
    </div>
  );
}
