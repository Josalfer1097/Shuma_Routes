'use client';

import { useState } from 'react';
import AcceptRouteModal from './AcceptRouteModal';
import type { Route, GlobalConfig } from '@/types';
import { formatDuration, formatDistance } from '@/lib/osrm';
import type { WeatherData } from '@/lib/weather';

interface Props {
  routes: Route[];
  weather?: WeatherData | null;
  globalConfig?: GlobalConfig | null;
  userName?: string;
  userRole?: string;
  onRouteAccepted?: () => void;
}

export default function ReportButton({ routes, weather, globalConfig, userName, userRole, onRouteAccepted }: Props) {
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isAccepted, setIsAccepted] = useState(false);

  const handleOpenAcceptModal = async () => {
    setIsChecking(true);
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
      const res = await fetch(`/api/routes/active?date=${today}`);
      const json = await res.json();
      if (json.ok && json.routes) {
        const existingDrivers = [];
        for (const route of routes) {
          if (json.routes.some((active: any) => active.driver_name === route.driverName)) {
            existingDrivers.push(route.driverName);
          }
        }
        if (existingDrivers.length > 0) {
          setDuplicateWarning(`${existingDrivers.join(', ')} ya tiene(n) una ruta activa hoy. Esta nueva ruta se sumará como adicional — no reemplaza la existente. Si tu intención es modificar la ruta actual, ciérrala y usa "Editar ruta" desde el panel de Rutas Activas.`);
        } else {
          setDuplicateWarning(null);
        }
      }
    } catch (e) {
      console.error('Error verificando rutas activas', e);
      setDuplicateWarning(null);
    } finally {
      setIsChecking(false);
      setIsAcceptModalOpen(true);
    }
  };

  if (routes.length === 0) return null;

  const handleGeneratePDF = async () => {
    const { generatePDFReport } = await import('@/lib/pdfReport');
    await generatePDFReport(routes, globalConfig, weather);
  };

  const handleExportCSV = () => {
    const header = ['ID Chofer', 'ID Route', 'Address', 'Status'];
    const rows: string[] = [];
    routes.forEach(route => {
      route.stops.forEach(stop => {
        rows.push([
          route.vehicleId || '',
          (route as any).id || route.vehicleId || '',
          `"${(stop.address.raw || '').replace(/"/g, '""')}"`,
          '1'
        ].join(','));
      });
    });
    const csvContent = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asignaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2.5">
      {!isAccepted ? (
        <button
          onClick={handleOpenAcceptModal}
          disabled={isChecking}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                     bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600
                     border border-green-500 hover:border-green-400
                     text-sm font-semibold text-white transition-all duration-200
                     shadow-lg shadow-green-900/30 hover:shadow-green-800/40 disabled:opacity-50"
        >
          {isChecking ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {isChecking ? 'Verificando...' : 'Aceptar Ruta'}
        </button>
      ) : (
        <>
          <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                           bg-green-600/10 border border-green-500/30 text-sm font-semibold text-green-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Ruta aceptada
          </div>

          <button
            onClick={handleExportCSV}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                       bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 hover:border-indigo-400
                       text-sm font-semibold text-white transition-all duration-200
                       shadow-lg shadow-indigo-900/30 hover:shadow-indigo-800/40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Exportar Asignaciones
          </button>

          <button
            onClick={handleGeneratePDF}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                       bg-blue-600 hover:bg-blue-500 border border-blue-500 hover:border-blue-400
                       text-sm font-semibold text-white transition-all duration-200
                       shadow-lg shadow-blue-900/30 hover:shadow-blue-800/40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Descargar PDF
          </button>
        </>
      )}

      <AcceptRouteModal
        isOpen={isAcceptModalOpen}
        onClose={() => setIsAcceptModalOpen(false)}
        routes={routes}
        userName={userName || 'admin'}
        userRole={userRole || 'admin'}
        onSuccess={() => { setIsAccepted(true); onRouteAccepted?.(); }}
        duplicateWarning={duplicateWarning}
      />
    </div>
  );
}
