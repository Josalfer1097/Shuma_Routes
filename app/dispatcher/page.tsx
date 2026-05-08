'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useReducer, useState } from 'react';
import type {
  Address, Vehicle, Route, AppState, AppStep, SharedRouteState,
} from '@/types';
import { getWeatherCDMX, type WeatherData } from '@/lib/weather';
import { geocodeBatch, geocodeAddress } from '@/lib/nominatim';
import { optimizeRoutes, assignVehicleColors } from '@/lib/vroom';
import CSVUploader from '@/components/dispatcher/CSVUploader';
import VehicleForm from '@/components/dispatcher/VehicleForm';
import RoutePanel from '@/components/dispatcher/RoutePanel';
import OptimizeButton from '@/components/dispatcher/OptimizeButton';
import ReportButton from '@/components/dispatcher/ReportButton';

// Leaflet NO es compatible con SSR → dynamic import
const MapView = dynamic(() => import('@/components/dispatcher/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-800/50 rounded-xl">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-slate-400">Cargando mapa…</span>
      </div>
    </div>
  ),
});

// ─── Estado y reducer ──────────────────────────────────────

type Action =
  | { type: 'SET_ADDRESSES'; payload: Address[] }
  | { type: 'UPDATE_ADDRESS'; payload: Address }
  | { type: 'ADD_VEHICLE'; payload: Vehicle }
  | { type: 'REMOVE_VEHICLE'; payload: string }
  | { type: 'SET_ROUTES'; payload: Route[] }
  | { type: 'SET_STEP'; payload: AppStep }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_DEPOT'; payload: { lat: number; lng: number; label: string } | null };

const initialState: AppState = {
  step: 'upload',
  addresses: [],
  vehicles: [],
  routes: [],
  depot: null,
  error: null,
};

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_ADDRESSES':
      return { ...state, addresses: action.payload, routes: [], step: 'geocoding' };
    case 'UPDATE_ADDRESS':
      return {
        ...state,
        addresses: state.addresses.map((a) =>
          a.id === action.payload.id ? action.payload : a
        ),
      };
    case 'ADD_VEHICLE':
      return {
        ...state,
        vehicles: assignVehicleColors([...state.vehicles, action.payload]),
      };
    case 'REMOVE_VEHICLE':
      return {
        ...state,
        vehicles: assignVehicleColors(
          state.vehicles.filter((v) => v.id !== action.payload)
        ),
      };
    case 'SET_ROUTES':
      return { ...state, routes: action.payload, step: 'results', error: null };
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, step: 'vehicles' };
    case 'SET_DEPOT':
      return { ...state, depot: action.payload };
    default:
      return state;
  }
}

// ─── Componente principal ──────────────────────────────────

export default function DispatcherPage() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'vehicles' | 'routes'>('upload');
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    getWeatherCDMX().then(setWeather).catch(console.error);
  }, []);

  // Carga de CSV → geocodificación automática
  const handleAddressesLoaded = useCallback(async (addresses: Address[]) => {
    dispatch({ type: 'SET_ADDRESSES', payload: addresses });
    setActiveTab('vehicles');

    // Depósito por defecto: centro de CDMX (ajustable)
    const depotResult = { lat: 19.4326, lng: -99.1332, label: 'Depósito CDMX' };
    dispatch({ type: 'SET_DEPOT', payload: depotResult });

    // Geocodificar en serie usando async/await
    const updatedAddresses = [...addresses];

    for (let i = 0; i < addresses.length; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1100)); // Nominatim rate limit
      }

      const addr = addresses[i];
      let updated: Address;

      try {
        const geo = await geocodeAddress(addr.raw);
        if (geo) {
          updated = { ...addr, lat: geo.lat, lng: geo.lng, label: geo.label, geocoded: true };
        } else {
          updated = { ...addr, geocoded: true, geocodeError: 'No encontrada' };
        }
      } catch (err) {
        updated = { ...addr, geocoded: true, geocodeError: 'Error al geocodificar' };
      }

      updatedAddresses[i] = updated;
      dispatch({ type: 'UPDATE_ADDRESS', payload: updated });
    }

    dispatch({ type: 'SET_ADDRESSES', payload: updatedAddresses });
    dispatch({ type: 'SET_STEP', payload: 'vehicles' });
  }, []);

  // Optimización de rutas
  const handleOptimize = useCallback(async () => {
    if (!state.depot) {
      dispatch({ type: 'SET_ERROR', payload: 'No hay depósito configurado.' });
      return;
    }

    setIsOptimizing(true);
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_STEP', payload: 'optimizing' });

    try {
      const routes = await optimizeRoutes(state.addresses, state.vehicles, state.depot!);
      dispatch({ type: 'SET_ROUTES', payload: routes });
      setActiveTab('routes');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      setIsOptimizing(false);
    }
  }, [state.addresses, state.vehicles, state.depot]);

  // Compartir link con el chofer
  const handleShareRoute = useCallback((vehicleId: string) => {
    const route = state.routes.find((r) => r.vehicleId === vehicleId);
    if (!route) return;

    const sharedState: SharedRouteState = {
      routes: [route],
      depot: state.depot,
      optimizedAt: new Date().toISOString(),
    };

    const encoded = btoa(encodeURIComponent(JSON.stringify(sharedState)));
    const url = `${window.location.origin}/driver/${vehicleId}?data=${encoded}`;

    // Copiar al portapapeles
    navigator.clipboard.writeText(url).then(() => {
      alert(`✅ Link copiado:\n${url}\n\nCompartelo con ${route.driverName} por WhatsApp`);
    });
  }, [state.routes, state.depot]);

  const tabs = [
    { id: 'upload' as const, label: 'Direcciones', count: state.addresses.length },
    { id: 'vehicles' as const, label: 'Choferes', count: state.vehicles.length },
    { id: 'routes' as const, label: 'Rutas', count: state.routes.length },
  ];

  return (
    <div className="flex h-screen bg-[#0F172A] overflow-hidden">
      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      <aside className="w-[380px] shrink-0 flex flex-col border-r border-slate-700/50 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Shuma Rutas</h1>
              <p className="text-xs text-slate-500">Vista Despachador</p>
            </div>
          </div>
        </div>

        {/* Widget de Clima */}
        {weather && (
          <div className="px-4 py-3 border-b border-slate-700/50 shrink-0 bg-slate-800/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Clima CDMX</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-white">{weather.temp}°C</span>
                  <span className="text-xs text-slate-300 capitalize">{weather.description}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Humedad: {weather.humidity}% · Viento: {weather.windSpeed} km/h
                </div>
              </div>
              <img 
                src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} 
                alt="Clima" 
                className="w-10 h-10 drop-shadow-md"
              />
            </div>
            {weather.alerts.length > 0 && (
              <div className="mt-2 px-2 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                <p className="text-[11px] font-medium text-yellow-400 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {weather.alerts[0]}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-3 pb-2 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg
                          text-xs font-medium transition-all duration-200
                          ${activeTab === tab.id
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold
                  ${activeTab === tab.id ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'}`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Contenido del tab */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Tab: Direcciones */}
          {activeTab === 'upload' && (
            <CSVUploader onAddressesLoaded={handleAddressesLoaded} />
          )}

          {/* Tab: Choferes */}
          {activeTab === 'vehicles' && (
            <VehicleForm
              vehicles={state.vehicles}
              onAdd={(v) => dispatch({ type: 'ADD_VEHICLE', payload: v })}
              onRemove={(id) => dispatch({ type: 'REMOVE_VEHICLE', payload: id })}
            />
          )}

          {/* Tab: Rutas */}
          {activeTab === 'routes' && (
            <div className="space-y-3">
              <RoutePanel
                routes={state.routes}
                onShareRoute={handleShareRoute}
              />
              {state.routes.length > 0 && (
                <ReportButton routes={state.routes} weather={weather} />
              )}
            </div>
          )}
        </div>

        {/* Footer con botón optimizar */}
        <div className="px-4 py-4 border-t border-slate-700/50 shrink-0 space-y-3">
          {/* Error */}
          {state.error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-xs text-red-400">{state.error}</p>
            </div>
          )}
          <OptimizeButton
            step={state.step}
            addresses={state.addresses}
            vehicles={state.vehicles}
            isOptimizing={isOptimizing}
            onOptimize={handleOptimize}
          />
        </div>
      </aside>

      {/* ── MAPA ─────────────────────────────────────────────── */}
      <main className="flex-1 relative overflow-hidden">
        <MapView
          addresses={state.addresses}
          routes={state.routes}
          depot={state.depot}
        />

        {/* Badge de estado */}
        {state.step === 'geocoding' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10
                          flex items-center gap-2 px-4 py-2 rounded-full
                          bg-slate-900/90 backdrop-blur border border-blue-500/30
                          text-xs text-blue-400 font-medium shadow-lg">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Geocodificando direcciones…
          </div>
        )}

        {state.step === 'optimizing' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10
                          flex items-center gap-2 px-4 py-2 rounded-full
                          bg-slate-900/90 backdrop-blur border border-amber-500/30
                          text-xs text-amber-400 font-medium shadow-lg">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Optimizando con Vroom…
          </div>
        )}

        {state.routes.length > 0 && (
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
            {state.routes.map((r) => (
              <div
                key={r.vehicleId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full
                           bg-slate-900/90 backdrop-blur border border-slate-700/50 text-xs"
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="text-slate-300 font-medium">{r.driverName}</span>
                <span className="text-slate-500">{r.stops.length} paradas</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
