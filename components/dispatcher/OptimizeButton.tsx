'use client';

import type { Address, Vehicle, AppStep } from '@/types';

interface Props {
  step: AppStep;
  addresses: Address[];
  vehicles: Vehicle[];
  isOptimizing: boolean;
  onOptimize: () => void;
}

export default function OptimizeButton({
  step,
  addresses,
  vehicles,
  isOptimizing,
  onOptimize,
}: Props) {
  const geocodedCount = addresses.filter((a) => a.geocoded && a.lat !== null).length;
  const totalAddresses = addresses.length;
  const hasAddresses = geocodedCount > 0;
  const hasVehicles = vehicles.length > 0;
  const canOptimize = hasAddresses && hasVehicles && !isOptimizing;

  const reasons: string[] = [];
  if (!hasAddresses) reasons.push('Carga y geocodifica las direcciones');
  if (!hasVehicles) reasons.push('Agrega al menos un chofer');

  return (
    <div className="space-y-3">
      {/* Estado de geocodificación */}
      {totalAddresses > 0 && (
        <div className="rounded-lg bg-slate-700/30 border border-slate-700 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Geocodificación</span>
            <span className="text-xs font-bold text-slate-300">
              {geocodedCount}/{totalAddresses}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{
                width: totalAddresses > 0 ? `${(geocodedCount / totalAddresses) * 100}%` : '0%',
              }}
            />
          </div>
          {step === 'geocoding' && (
            <p className="text-xs text-blue-400 flex items-center gap-1.5">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Geocodificando…
            </p>
          )}
        </div>
      )}

      {/* Requisitos no cumplidos */}
      {reasons.length > 0 && (
        <ul className="space-y-1">
          {reasons.map((r) => (
            <li key={r} className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              {r}
            </li>
          ))}
        </ul>
      )}

      {/* Botón principal */}
      <button
        id="btn-optimize"
        onClick={onOptimize}
        disabled={!canOptimize}
        className={`
          relative w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl
          font-semibold text-sm transition-all duration-300 overflow-hidden
          ${canOptimize
            ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]'
            : 'bg-slate-700/50 text-slate-500 cursor-not-allowed border border-slate-700'
          }
        `}
      >
        {isOptimizing ? (
          <>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Optimizando rutas…
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Optimizar Rutas
          </>
        )}

        {/* Shimmer effect */}
        {canOptimize && !isOptimizing && (
          <span className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        )}
      </button>

      {/* Info extra */}
      {canOptimize && (
        <p className="text-xs text-center text-slate-600">
          {geocodedCount} entregas · {vehicles.length} {vehicles.length === 1 ? 'vehículo' : 'vehículos'}
        </p>
      )}
    </div>
  );
}
