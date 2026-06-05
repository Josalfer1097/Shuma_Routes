'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useReducer, useState } from 'react';
import type {
  Address, Vehicle, Route, AppState, AppStep, SharedRouteState,
} from '@/types';
import { getWeatherCDMX, type WeatherData } from '@/lib/weather';
import { geocodeBatch, geocodeAddress } from '@/lib/nominatim';
import { optimizeRoutes, assignVehicleColors, optimizeSingleVehicle } from '@/lib/vroom';
import CSVUploader from '@/components/dispatcher/CSVUploader';
import VehicleForm from '@/components/dispatcher/VehicleForm';
import RoutePanel from '@/components/dispatcher/RoutePanel';
import OptimizeButton from '@/components/dispatcher/OptimizeButton';
import ReportButton from '@/components/dispatcher/ReportButton';
import WeatherBanner from '@/components/dispatcher/WeatherBanner';
import { clusterDeliveries } from '@/lib/clustering';
import type { Cluster, GlobalConfig, ClusteringConfig, Stop } from '@/types';

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

const ZoneMap = dynamic(() => import('@/components/dispatcher/ZoneMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-800/50 rounded-xl">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-slate-400">Cargando zonas…</span>
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
  | { type: 'UPDATE_VEHICLE'; payload: { id: string; changes: Partial<Vehicle> } }
  | { type: 'SWAP_VEHICLES'; payload: { index1: number; index2: number } }
  | { type: 'SET_ROUTES'; payload: Route[] }
  | { type: 'SET_STEP'; payload: AppStep }
  | { type: 'SET_CLUSTERS'; payload: Cluster[] }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_DEPOT'; payload: { lat: number; lng: number; label: string } | null }
  | { type: 'SET_GLOBAL_CONFIG'; payload: GlobalConfig }
  | { type: 'SET_CLUSTERING_CONFIG'; payload: ClusteringConfig };

const initialState: AppState = {
  step: 'config',
  globalConfig: null,
  clusteringConfig: { balanceWeight: 0, vehicleCapacities: [] },
  addresses: [],
  clusters: [],
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
    case 'UPDATE_VEHICLE':
      return {
        ...state,
        vehicles: state.vehicles.map((v) =>
          v.vehicleId === action.payload.id || v.id === action.payload.id
            ? { ...v, ...action.payload.changes }
            : v
        ),
      };
    case 'SWAP_VEHICLES': {
      const newVehicles = [...state.vehicles];
      const temp = newVehicles[action.payload.index1];
      newVehicles[action.payload.index1] = newVehicles[action.payload.index2];
      newVehicles[action.payload.index2] = temp;
      return { ...state, vehicles: newVehicles };
    }
    case 'SET_ROUTES':
      return { ...state, routes: action.payload, step: 'results', error: null };
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'SET_CLUSTERS':
      return { ...state, clusters: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, step: state.step === 'optimizing' ? 'zones' : state.step };
    case 'SET_DEPOT':
      return { ...state, depot: action.payload };
    case 'SET_GLOBAL_CONFIG':
      return { ...state, globalConfig: action.payload };
    case 'SET_CLUSTERING_CONFIG':
      return { ...state, clusteringConfig: action.payload };
    default:
      return state;
  }
}

// ─── Componente principal ──────────────────────────────────

export default function DispatcherPage() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'upload' | 'zones' | 'routes'>('config');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [numClusters, setNumClusters] = useState<number>(1);
  const [showInlineVehicleForm, setShowInlineVehicleForm] = useState(false);
  const [hiddenRouteIds, setHiddenRouteIds] = useState<string[]>([]);

  useEffect(() => {
    const lat = state.globalConfig?.departureDepot?.lat || 19.4326;
    const lng = state.globalConfig?.departureDepot?.lng || -99.1332;
    
    const fetchWeather = () => {
      getWeatherCDMX(lat, lng).then(setWeather).catch(console.error);
    };
    
    fetchWeather();
    const interval = setInterval(fetchWeather, 10 * 60 * 1000); // 10 minutos
    
    return () => clearInterval(interval);
  }, [state.globalConfig?.departureDepot]);

  // Carga de CSV → geocodificación automática
  const handleAddressesLoaded = useCallback(async (addresses: Address[]) => {
    dispatch({ type: 'SET_ADDRESSES', payload: addresses });

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
        let msg = 'Error al geocodificar';
        if (err instanceof Error && err.message.includes('REQUEST_DENIED')) {
          msg = 'API Key rechazada (REQUEST_DENIED)';
        }
        updated = { ...addr, geocoded: true, geocodeError: msg };
      }

      updatedAddresses[i] = updated;
      dispatch({ type: 'UPDATE_ADDRESS', payload: updated });
    }

    dispatch({ type: 'SET_ADDRESSES', payload: updatedAddresses });
    
    const validCount = updatedAddresses.filter(a => a.lat !== null).length;
    let finalClustersCount = state.vehicles.length;
    if (finalClustersCount === 0) finalClustersCount = 1; // Fallback just in case
    
    setNumClusters(finalClustersCount);
    
    const generatedClusters = clusterDeliveries(updatedAddresses, state.vehicles, state.clusteringConfig);
    dispatch({ type: 'SET_CLUSTERS', payload: generatedClusters });
    
    dispatch({ type: 'SET_STEP', payload: 'zones' });
    setActiveTab('zones');

    // Si todas las direcciones fallaron, mostramos un error global
    const successCount = updatedAddresses.filter(a => a.lat !== null).length;
    if (successCount === 0 && updatedAddresses.length > 0) {
      dispatch({ 
        type: 'SET_ERROR', 
        payload: 'No se pudo geocodificar ninguna dirección. Verifica tu API Key de Google (Geocoding API habilitada y sin restricciones de referrer).' 
      });
    }
  }, [state.vehicles, state.clusteringConfig]);

  // Optimización de rutas
  const handleOptimize = useCallback(async () => {
    if (state.clusters.length === 0) {
      dispatch({ type: 'SET_ERROR', payload: 'No hay zonas generadas.' });
      return;
    }
    if (state.vehicles.length === 0) {
      dispatch({ type: 'SET_ERROR', payload: 'No hay choferes registrados.' });
      return;
    }

    setIsOptimizing(true);
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_STEP', payload: 'optimizing' });

    // Transferir depósitos de cluster a vehículo según configuración global
    const assignedVehicles = state.vehicles.map((v, i) => {
      const cluster = state.clusters[i % state.clusters.length];
      const startDepot = state.globalConfig?.departureDepot || cluster.depot;
      const endDepot = state.globalConfig?.returnDepot === 'same' 
        ? startDepot 
        : (state.globalConfig?.returnDepot || cluster.depot);

      return {
        ...v,
        depot: startDepot,
        endDepot: endDepot,
        zoneName: cluster.name,
      };
    });

    try {
      const today = new Date();
      const currentMins = today.getHours() * 60 + today.getMinutes();

      // Check all vehicles for invalid times
      for (const v of assignedVehicles) {
        const timeStr = v.departureTime || state.globalConfig?.departureTime || '08:00';
        const [h, m] = timeStr.split(':').map(Number);
        const targetMins = (h || 0) * 60 + (m || 0);
        if (targetMins < currentMins) {
          dispatch({ type: 'SET_ERROR', payload: `La hora de salida de ${v.driverName} ya pasó. Ajusta la hora antes de optimizar.` });
          setIsOptimizing(false);
          return;
        }
      }

      // Construir la fecha ISO combinando hoy con la hora configurada
      const timeParts = (state.globalConfig?.departureTime || '08:00').split(':');
      today.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
      const departureTime = today.toISOString(); // Para tráfico real

      const routes = await optimizeRoutes(state.clusters, assignedVehicles, departureTime);
      dispatch({ type: 'SET_ROUTES', payload: routes });
      setActiveTab('routes');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      setIsOptimizing(false);
    }
  }, [state.addresses, state.vehicles, state.depot, state.clusters]);

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

  // Re-optimizar después de edición manual
  const handleReoptimize = useCallback(async (manualRoutes: Route[]) => {
    setIsOptimizing(true);
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_STEP', payload: 'optimizing' });

    try {
      const today = new Date();
      const currentMins = today.getHours() * 60 + today.getMinutes();

      // Check all vehicles for invalid times
      for (const v of state.vehicles) {
        const route = manualRoutes.find(r => r.vehicleId === v.id) || state.routes.find(r => r.vehicleId === v.id);
        const timeStr = route?.departureTime || v.departureTime || state.globalConfig?.departureTime || '08:00';
        const [h, m] = timeStr.split(':').map(Number);
        const targetMins = (h || 0) * 60 + (m || 0);
        if (targetMins < currentMins) {
          dispatch({ type: 'SET_ERROR', payload: `La hora de salida de ${v.driverName} ya pasó. Ajusta la hora antes de optimizar.` });
          setIsOptimizing(false);
          return;
        }
      }

      const timeParts = (state.globalConfig?.departureTime || '08:00').split(':');
      today.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
      const departureTime = today.toISOString();

      // Construir manualAssignments map (addressId -> vehicleIndex)
      const manualAssignments = manualRoutes.flatMap((r, vIndex) => 
        r.stops.map(s => ({ addressId: s.address.id, vehicleIndex: vIndex }))
      );

      // Los vehículos deben mantener el orden de las rutas editadas
      const vehiclesInOrder = manualRoutes.map(r => state.vehicles.find(v => v.id === r.vehicleId)!);
      
      const assignedVehicles = vehiclesInOrder.map((v, i) => {
        const startDepot = state.globalConfig?.departureDepot || v.depot;
        const endDepot = state.globalConfig?.returnDepot === 'same' 
          ? startDepot 
          : (state.globalConfig?.returnDepot || v.depot);
        return { ...v, depot: startDepot, endDepot: endDepot };
      });

      const routes = await optimizeRoutes(state.clusters, assignedVehicles, departureTime, manualAssignments);
      dispatch({ type: 'SET_ROUTES', payload: routes });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al reoptimizar';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      dispatch({ type: 'SET_STEP', payload: 'results' });
      setIsOptimizing(false);
    }
  }, [state.clusters, state.vehicles, state.globalConfig]);

  const handleReoptimizeSingle = useCallback(async (vehicleId: string, manualStops: Stop[]) => {
    setIsOptimizing(true);
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const today = new Date();
      const currentMins = today.getHours() * 60 + today.getMinutes();

      const vehicle = state.vehicles.find(v => v.id === vehicleId);
      if (!vehicle) throw new Error('Vehículo no encontrado');

      const route = state.routes.find(r => r.vehicleId === vehicleId);
      const timeStr = route?.departureTime || vehicle.departureTime || state.globalConfig?.departureTime || '08:00';
      const [h, m] = timeStr.split(':').map(Number);
      const targetMins = (h || 0) * 60 + (m || 0);
      if (targetMins < currentMins) {
        dispatch({ type: 'SET_ERROR', payload: `La hora de salida de ${vehicle.driverName} ya pasó. Ajusta la hora antes de optimizar.` });
        setIsOptimizing(false);
        return;
      }

      const timeParts = (state.globalConfig?.departureTime || '08:00').split(':');
      today.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
      const departureTime = today.toISOString();



      const addresses = manualStops.map(s => s.address);
      const routeColor = state.routes.find(r => r.vehicleId === vehicleId)?.color || '#FF6B00';
      const zoneName = vehicle.zoneName || 'Zona';

      const updatedRoute = await optimizeSingleVehicle(vehicle, addresses, departureTime, routeColor, zoneName);

      dispatch({ 
        type: 'SET_ROUTES', 
        payload: state.routes.map(r => r.vehicleId === vehicleId ? updatedRoute : r)
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al reoptimizar vehículo individual';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      setIsOptimizing(false);
    }
  }, [state.vehicles, state.globalConfig, state.routes]);

  const tabs = [
    { id: 'config' as const, label: 'Conf.', count: 0 },
    { id: 'upload' as const, label: 'Dir.', count: state.addresses.length },
    { id: 'zones' as const, label: 'Zonas', count: state.clusters.length },
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
        {weather && <WeatherBanner weather={weather} />}

        {/* Global Config Chip */}
        {state.globalConfig && (
          <div className="px-4 py-2 border-b border-slate-700/50 shrink-0 bg-blue-500/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-blue-300">
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>
                {state.globalConfig.departureDepot.name.split(' ')[0]} → {state.globalConfig.returnDepot === 'same' ? 'Misma' : (state.globalConfig.returnDepot as any).name?.split(' ')[0]} | {state.globalConfig.departureTime}
              </span>
            </div>
            <button 
              onClick={() => setActiveTab('config')}
              className="text-[10px] text-blue-400 hover:text-white transition-colors underline"
            >
              Cambiar
            </button>
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
          {/* Tab: Configuración */}
          {activeTab === 'config' && (
            <ConfigPanel 
              currentConfig={state.globalConfig}
              vehicles={state.vehicles}
              onAddVehicle={(v) => dispatch({ type: 'ADD_VEHICLE', payload: v })}
              onRemoveVehicle={(id) => dispatch({ type: 'REMOVE_VEHICLE', payload: id })}
              onSave={(conf) => {
                dispatch({ type: 'SET_GLOBAL_CONFIG', payload: conf });
                dispatch({ type: 'SET_STEP', payload: 'upload' });
                setActiveTab('upload');
              }}
            />
          )}

          {/* Tab: Direcciones */}
          {activeTab === 'upload' && (
            <CSVUploader onAddressesLoaded={handleAddressesLoaded} disabled={!state.globalConfig} />
          )}

          {/* Tab: Zonas */}
          {activeTab === 'zones' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-700/50 p-3 rounded-xl border border-slate-700">
                <div>
                  <h3 className="text-sm font-bold text-white">Zonas ({state.clusters.length})</h3>
                  <p className="text-xs text-slate-400">1 zona por camión</p>
                </div>
                <button
                  onClick={() => setShowInlineVehicleForm(!showInlineVehicleForm)}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-600 hover:bg-slate-500 rounded-lg text-white"
                >
                  {showInlineVehicleForm ? 'Cancelar' : '+ Agregar camión'}
                </button>
              </div>

              {showInlineVehicleForm && (
                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                  <VehicleForm
                    vehicles={state.vehicles}
                    onAdd={(v) => {
                      dispatch({ type: 'ADD_VEHICLE', payload: v });
                      setShowInlineVehicleForm(false);
                      // Recalcular zonas con el nuevo número de vehículos
                      const newClusters = clusterDeliveries(state.addresses, [...state.vehicles, v], state.clusteringConfig);
                      dispatch({ type: 'SET_CLUSTERS', payload: newClusters });
                      setNumClusters(state.vehicles.length + 1);
                    }}
                    onRemove={(id) => dispatch({ type: 'REMOVE_VEHICLE', payload: id })}
                  />
                </div>
              )}

              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-300">Balanceo Automático</label>
                  <span className="text-xs text-blue-400 font-mono">{(state.clusteringConfig.balanceWeight * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="1" step="0.05"
                  value={state.clusteringConfig.balanceWeight}
                  onChange={(e) => {
                    const weight = parseFloat(e.target.value);
                    const newConfig = { ...state.clusteringConfig, balanceWeight: weight };
                    dispatch({ type: 'SET_CLUSTERING_CONFIG', payload: newConfig });
                    const newClusters = clusterDeliveries(state.addresses, state.vehicles, newConfig);
                    dispatch({ type: 'SET_CLUSTERS', payload: newClusters });
                  }}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                  <span>Geografía pura</span>
                  <span>Igualar cargas</span>
                </div>
              </div>

              <ul className="space-y-2">
                {state.clusters.map((cluster, idx) => {
                  const assignedVehicle = state.vehicles[idx];
                  return (
                    <li key={cluster.id} className="p-3 bg-slate-800 rounded-lg border-l-4" style={{ borderColor: cluster.color }}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="text-sm font-bold text-slate-200">{cluster.name}</h4>
                          <p className="text-xs text-slate-400">{cluster.addresses.length} paradas</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Chofer Asignado</label>
                        <select
                          value={assignedVehicle?.id || ''}
                          onChange={(e) => {
                            const newVehicleId = e.target.value;
                            const newIdx = state.vehicles.findIndex(v => v.id === newVehicleId);
                            if (newIdx !== -1 && newIdx !== idx) {
                              dispatch({ type: 'SWAP_VEHICLES', payload: { index1: idx, index2: newIdx } });
                            }
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-md p-1.5 text-xs text-slate-200 outline-none"
                        >
                          {state.vehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.driverName} ({v.type})</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 mt-2">
                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Capacidad Máxima (Paradas)</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={state.clusteringConfig.vehicleCapacities.find(c => c.vehicleId === assignedVehicle?.id)?.maxStops || (assignedVehicle?.type === 'Camioneta' ? 4 : 6)}
                          onChange={(e) => {
                            if (!assignedVehicle) return;
                            const val = parseInt(e.target.value) || 0;
                            const caps = [...state.clusteringConfig.vehicleCapacities];
                            const idxCap = caps.findIndex(c => c.vehicleId === assignedVehicle.id);
                            if (idxCap >= 0) caps[idxCap].maxStops = val;
                            else caps.push({ vehicleId: assignedVehicle.id, maxStops: val });
                            
                            const newConfig = { ...state.clusteringConfig, vehicleCapacities: caps };
                            dispatch({ type: 'SET_CLUSTERING_CONFIG', payload: newConfig });
                            const newClusters = clusterDeliveries(state.addresses, state.vehicles, newConfig);
                            dispatch({ type: 'SET_CLUSTERS', payload: newClusters });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-md p-1.5 text-xs text-slate-200 outline-none"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Tab: Rutas */}
          {activeTab === 'routes' && (
            <div className="space-y-3">
              <RoutePanel
                routes={state.routes}
                onShareRoute={handleShareRoute}
                onReoptimize={handleReoptimize}
                allVehicles={state.vehicles}
                hiddenRouteIds={hiddenRouteIds}
                onReoptimizeSingle={handleReoptimizeSingle}
                globalDepartureTime={state.globalConfig?.departureTime}
                onVehicleTimeChange={(vehicleId, timeStr) => {
                  dispatch({ 
                    type: 'UPDATE_VEHICLE', 
                    payload: { id: vehicleId, changes: { departureTime: timeStr } } 
                  });
                  // También actualizar la ruta activa para que se refleje inmediatamente
                  dispatch({
                    type: 'SET_ROUTES',
                    payload: state.routes.map(r => 
                      r.vehicleId === vehicleId ? { ...r, departureTime: timeStr } : r
                    )
                  });
                }}
                onToggleRouteVisibility={(vehicleId) => {
                  setHiddenRouteIds((prev) => 
                    prev.includes(vehicleId) 
                      ? prev.filter((id) => id !== vehicleId) 
                      : [...prev, vehicleId]
                  );
                }}
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
          
          {activeTab === 'zones' && (
            <button
              onClick={() => {
                dispatch({ type: 'SET_STEP', payload: 'optimizing' });
                handleOptimize();
              }}
              className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl shadow-md transition-all"
            >
              Confirmar Zonas y Optimizar
            </button>
          )}

          {activeTab !== 'zones' && (
            <OptimizeButton
              step={state.step}
              addresses={state.addresses}
              vehicles={state.vehicles}
              isOptimizing={isOptimizing}
              onOptimize={handleOptimize}
            />
          )}
        </div>
      </aside>

      {/* ── MAPA ─────────────────────────────────────────────── */}
      <main className="flex-1 relative overflow-hidden">
        {state.step === 'zones' ? (
          <ZoneMap
            clusters={state.clusters}
            onConfirm={() => {
              dispatch({ type: 'SET_STEP', payload: 'optimizing' });
              handleOptimize();
            }}
            onRegroup={() => {
              const regenerated = clusterDeliveries(state.addresses, state.vehicles, state.clusteringConfig);
              dispatch({ type: 'SET_CLUSTERS', payload: regenerated });
            }}
          />
        ) : (
          <MapView
            addresses={state.addresses}
            routes={state.routes}
            depot={state.depot}
            hiddenRouteIds={hiddenRouteIds}
          />
        )}

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
            Optimizando con Google…
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

// ─── Componente de Configuración Global ────────────────────────

function ConfigPanel({ 
  currentConfig, 
  vehicles,
  onAddVehicle,
  onRemoveVehicle,
  onSave 
}: { 
  currentConfig: any, 
  vehicles: Vehicle[],
  onAddVehicle: (v: Vehicle) => void,
  onRemoveVehicle: (id: string) => void,
  onSave: (conf: any) => void 
}) {
  const DEPOTS = [
    { id: 'san_pablo', name: 'San Pablo', lat: 19.3550675, lng: -99.0939998, address: 'C. San Pablo 7, El Santuario, Iztapalapa, 09836 CDMX' },
    { id: 'division', name: 'División del Norte', lat: 19.3464401, lng: -99.1501142, address: 'Av. División del Nte. 2825, Parque San Andrés, Coyoacán, 04040 CDMX' }
  ];

  const [depotId, setDepotId] = useState(currentConfig?.departureDepot?.id || 'san_pablo');
  const [returnDepotId, setReturnDepotId] = useState(currentConfig?.returnDepot === 'same' ? 'same' : (currentConfig?.returnDepot?.id || 'same'));
  const [time, setTime] = useState(currentConfig?.departureTime || '08:00');

  const handleSave = () => {
    const dep = DEPOTS.find(d => d.id === depotId)!;
    const ret = returnDepotId === 'same' ? 'same' : DEPOTS.find(d => d.id === returnDepotId)!;
    onSave({ departureDepot: dep, returnDepot: ret, departureTime: time });
  };

  return (
    <div className="space-y-4">
      {/* GLOBAL CONFIGURATION */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4">
        <h3 className="text-sm font-bold text-white mb-2">Configuración Global de Ruta</h3>
        
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Bodega de salida</label>
          <select 
            value={depotId} 
            onChange={(e) => setDepotId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-blue-500"
          >
            {DEPOTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Bodega de regreso</label>
          <select 
            value={returnDepotId} 
            onChange={(e) => setReturnDepotId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="same">Misma que salida</option>
            {DEPOTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-xs font-medium text-slate-400">Hora estimada de salida</label>
          </div>
          <input 
            type="time" 
            value={time} 
            onChange={(e) => setTime(e.target.value)}
            className={`w-full bg-slate-900 border ${(() => {
              const now = new Date();
              const currentMins = now.getHours() * 60 + now.getMinutes();
              const [h, m] = (time || '08:00').split(':').map(Number);
              return (h * 60 + m) < currentMins ? 'border-red-500 text-red-400' : 'border-slate-700 text-slate-200';
            })()} rounded-lg p-2 text-sm outline-none focus:border-blue-500`}
          />
          {(() => {
            const now = new Date();
            const currentMins = now.getHours() * 60 + now.getMinutes();
            const [h, m] = (time || '08:00').split(':').map(Number);
            return (h * 60 + m) < currentMins ? (
              <p className="text-red-500 text-[10px] mt-1">⚠️ Esta hora ya pasó</p>
            ) : null;
          })()}
        </div>
      </div>

      {/* VEHICLES / FLEET CONFIGURATION */}
      <VehicleForm vehicles={vehicles} onAdd={onAddVehicle} onRemove={onRemoveVehicle} />

      <button 
        onClick={handleSave}
        disabled={vehicles.length === 0 || (() => {
          const now = new Date();
          const currentMins = now.getHours() * 60 + now.getMinutes();
          const [h, m] = (time || '08:00').split(':').map(Number);
          return (h * 60 + m) < currentMins;
        })()}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-md text-sm mt-4"
      >
        Continuar al paso 2
      </button>
    </div>
  );
}
