'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  Address, Vehicle, Route, AppState, AppStep, SharedRouteState,
} from '@/types';
import { getWeatherCDMX, type WeatherData } from '@/lib/weather';
import { geocodeBatch, geocodeAddress } from '@/lib/nominatim';
import { optimizeRoutes, assignVehicleColors, optimizeSingleVehicle, redrawPolylineForRoute } from '@/lib/vroom';
import CSVUploader from '@/components/dispatcher/CSVUploader';
import VehicleForm from '@/components/dispatcher/VehicleForm';
import RoutePanel from '@/components/dispatcher/RoutePanel';
import OptimizeButton from '@/components/dispatcher/OptimizeButton';
import ReportButton from '@/components/dispatcher/ReportButton';
import WeatherBanner from '@/components/dispatcher/WeatherBanner';
import SlideOver from '@/components/dispatcher/SlideOver';
import { clusterDeliveries } from '@/lib/clustering';
import type { Cluster, GlobalConfig, ClusteringConfig, Stop } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { BarChart2, History, LogOut, Maximize2, Minimize2 } from 'lucide-react';
import Image from 'next/image';
import WeatherIntelPanel from '@/components/dispatcher/WeatherIntelPanel';
import AuditLogModal from '@/components/dispatcher/AuditLogModal';
import FontScaleButton from '@/components/dispatcher/FontScaleButton';
import { useFontSize } from '@/lib/fontScaleContext';

// Leaflet NO es compatible con SSR → dynamic import
const MapView = dynamic(() => import('@/components/dispatcher/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-shuma-surface rounded-xl">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-shuma-muted">Cargando mapa…</span>
      </div>
    </div>
  ),
});

const ZoneMap = dynamic(() => import('@/components/dispatcher/ZoneMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-shuma-surface rounded-xl">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-shuma-muted">Cargando zonas…</span>
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

function calcularViabilidad(vehicles: Vehicle[], clusters: Cluster[], globalConfig: GlobalConfig | null) {
  if (!globalConfig) return [];
  const { deadlineTime, unloadConfig, departureTime: globalDepTime } = globalConfig;
  
  const [dHour, dMin] = (deadlineTime || '17:45').split(':').map(Number);
  const deadlineMins = dHour * 60 + dMin;

  return vehicles.map((v, i) => {
    const cluster = clusters[i];
    const stops = cluster?.addresses.length || 0;
    
    const depTimeStr = v.departureTime || globalDepTime || '08:00';
    const [h, m] = depTimeStr.split(':').map(Number);
    
    const transitMinutes = stops * 15;
    
    let unloadPerStop = 15;
    if (v.type === 'Camión grande') unloadPerStop = unloadConfig?.truckLarge ?? 20;
    else if (v.type === 'Camión chico') unloadPerStop = unloadConfig?.truckSmall ?? 18;
    else if (v.type === 'Camioneta') unloadPerStop = unloadConfig?.van ?? 15;
    
    const unloadMinutes = stops * unloadPerStop;
    const totalMinutes = transitMinutes + unloadMinutes;
    
    const returnTotalMins = (h * 60 + m) + totalMinutes;
    const retH = Math.floor(returnTotalMins / 60) % 24;
    const retM = returnTotalMins % 60;
    const estimatedReturn = `${retH.toString().padStart(2, '0')}:${retM.toString().padStart(2, '0')}`;
    
    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (returnTotalMins > deadlineMins) status = 'critical';
    else if (returnTotalMins > deadlineMins - 30) status = 'warning';

    return {
      vehicleId: v.id,
      driverName: v.driverName,
      departureTime: depTimeStr,
      transitMinutes,
      unloadMinutes,
      totalMinutes,
      estimatedReturn,
      deadlineTime: deadlineTime || '17:45',
      status,
      stops
    };
  });
}

// ─── Helper: rol badge text ────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  admin: 'ADMIN',
  logistics: 'LOGÍSTICA',
  viewer: 'SUPERVISOR',
  driver: 'CHOFER',
};

// ─── Helper: FAB config per tab ────────────────────────────
const FAB_CONFIG: Record<string, { icon: string; label: string }> = {
  config: { icon: '⚙', label: 'Configurar ruta' },
  upload: { icon: '📂', label: 'Cargar CSV' },
  zones:  { icon: '🗺', label: 'Ver zonas' },
  routes: { icon: '🚗', label: 'Ver rutas' },
};

// ─── Slide-over widths per tab ─────────────────────────────
const SLIDE_WIDTHS: Record<string, number> = {
  config: 780,
  upload: 700,
  zones: 600,
  routes: 640,
};

// ─── Componente principal ──────────────────────────────────

export default function DispatcherPage() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const fs = useFontSize();
  const [activeTab, setActiveTab] = useState<'config' | 'upload' | 'zones' | 'routes'>('config');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [geocodingDone, setGeocodingDone] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const fabRef = useRef<HTMLButtonElement>(null);
  const [fabPos, setFabPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const measure = () => {
      if (mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        setMapSize({ w: rect.width, h: rect.height });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const { logout } = useAuth();
  const router = useRouter();

  // ── New layout states ──
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [isActiveRoutesOpen, setIsActiveRoutesOpen] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [fleetMode, setFleetMode] = useState<'auto' | 'manual'>('auto');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  useEffect(() => {
    const updateFabPos = () => {
      if (!fabRef.current || !mapContainerRef.current) return;
      const mapRect = mapContainerRef.current.getBoundingClientRect();
      const fabRect = fabRef.current.getBoundingClientRect();
      // Centro del FAB en coordenadas relativas al contenedor del mapa
      setFabPos({
        x: fabRect.left - mapRect.left + fabRect.width / 2,
        y: fabRect.top  - mapRect.top  + fabRect.height / 2,
      });
    };
    // Medir después de que el DOM renderice
    const timer = setTimeout(updateFabPos, 100);
    window.addEventListener('resize', updateFabPos);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateFabPos);
    };
  }, [mapSize, isMapFullscreen, isSlideOverOpen]);


  // ── Session data (client-only) ──
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [liveDeliveryStatus, setLiveDeliveryStatus] = useState<Record<string, string>>({});
  const [sessionToRestore, setSessionToRestore] = useState<null | {
    savedAt: string;
    vehicleCount: number;
    addressCount: number;
  }>(null);

  const SESSION_KEY = 'shuma_rutas_session';

  const saveSession = useCallback(() => {
    if (!state.globalConfig) return;
    try {
      const sessionData = {
        globalConfig: state.globalConfig,
        vehicles: state.vehicles,
        addresses: state.addresses.map(a => ({ ...a })),
        clusters: state.clusters,
        step: state.step,
        savedAt: new Date().toISOString(),
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    } catch { /* ignore quota errors */ }
  }, [state.globalConfig, state.vehicles, state.addresses, state.clusters, state.step]);

  useEffect(() => {
    if (state.globalConfig) {
      saveSession();
    }
  }, [state.globalConfig, state.vehicles, state.addresses, state.clusters, saveSession]);

  useEffect(() => {
    // Polling 30s para live tracking
    const fetchStatuses = async () => {
      try {
        const res = await fetch('/api/deliveries/status');
        const json = await res.json();
        if (json.ok && json.statuses) {
          setLiveDeliveryStatus(json.statuses);
        }
      } catch (err) {
        console.error('Error fetching live delivery statuses', err);
      }
    };

    fetchStatuses();
    const intv = setInterval(fetchStatuses, 30000);
    return () => clearInterval(intv);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserName(sessionStorage.getItem('shuma_name') || '');
      setUserRole(sessionStorage.getItem('shuma_role') || '');

      // Verificar si hay sesión guardada
      try {
        const saved = sessionStorage.getItem('shuma_rutas_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.globalConfig && (parsed.vehicles?.length > 0 || parsed.addresses?.length > 0)) {
            setSessionToRestore({
              savedAt: parsed.savedAt,
              vehicleCount: parsed.vehicles?.length || 0,
              addressCount: parsed.addresses?.length || 0,
            });
          }
        }
      } catch { /* ignore */ }
    }
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('shuma_auth');
    sessionStorage.removeItem('shuma_role');
    sessionStorage.removeItem('shuma_user');
    sessionStorage.removeItem('shuma_name');
    sessionStorage.removeItem('shuma_driver_id');
    sessionStorage.removeItem('shuma_rutas_session');
    localStorage.removeItem('shuma_auth');
    localStorage.removeItem('shuma-rutas-font-scale');
    document.documentElement.style.setProperty('--font-scale', '1');
    document.documentElement.removeAttribute('data-font-scale');
    document.documentElement.style.removeProperty('font-size');
    document.cookie = "shuma_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = '/';
  };
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
    setIsSlideOverOpen(false);

    // Si todas las direcciones fallaron, mostramos un error global
    const successCount = updatedAddresses.filter(a => a.lat !== null).length;
    if (successCount === 0 && updatedAddresses.length > 0) {
      dispatch({ 
        type: 'SET_ERROR', 
        payload: 'No se pudo geocodificar ninguna dirección. Verifica tu API Key de Google (Geocoding API habilitada y sin restricciones de referrer).' 
      });
    } else if (successCount > 0) {
      setGeocodingDone(true);
      setTimeout(() => setGeocodingDone(false), 4000);
    }
  }, [state.vehicles, state.clusteringConfig]);

  // Helper para persistencia
  const saveRoutesData = (newRoutes: Route[]) => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('shuma_routes', JSON.stringify(newRoutes));
    if (state.globalConfig) {
      sessionStorage.setItem('shuma_global_config', JSON.stringify(state.globalConfig));
    }
    
    fetch('/api/routes/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routes: newRoutes,
        globalConfig: state.globalConfig,
        date: state.globalConfig?.departureTime || new Date().toISOString(),
        user: sessionStorage.getItem('shuma_name') || 'Dispatcher'
      })
    }).catch(e => console.error('Error guardando en BD:', e));
  };

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
    setIsSlideOverOpen(false);

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

      const routes = await optimizeRoutes(state.clusters, assignedVehicles, departureTime, undefined, state.globalConfig?.unloadConfig);
      dispatch({ type: 'SET_ROUTES', payload: routes });
      saveRoutesData(routes);
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

      const routes = await optimizeRoutes(state.clusters, assignedVehicles, departureTime, manualAssignments, state.globalConfig?.unloadConfig);
      dispatch({ type: 'SET_ROUTES', payload: routes });
      saveRoutesData(routes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al reoptimizar';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      dispatch({ type: 'SET_STEP', payload: 'results' });
      setIsOptimizing(false);
    }
  }, [state.clusters, state.vehicles, state.globalConfig]);

  const handleSaveManualOrder = useCallback(async (manualRoutes: Route[]) => {
    // Guarda el orden manual directamente en el state SIN llamar a Google
    dispatch({ type: 'SET_ROUTES', payload: manualRoutes });

    // Luego redibujar polilíneas en background con Google Routes
    setIsOptimizing(true);
    try {
      const routesWithPolylines = await Promise.all(
        manualRoutes.map(route => redrawPolylineForRoute(route))
      );
      dispatch({ type: 'SET_ROUTES', payload: routesWithPolylines });
      saveRoutesData(routesWithPolylines);
    } catch (err) {
      console.warn('No se pudo redibujar polilínea:', err);
      saveRoutesData(manualRoutes);
    } finally {
      setIsOptimizing(false);
    }
  }, []);

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

      const updatedRoute = await optimizeSingleVehicle(vehicle, addresses, departureTime, routeColor, zoneName, state.globalConfig?.unloadConfig);

      dispatch({ 
        type: 'SET_ROUTES', 
        payload: state.routes.map(r => r.vehicleId === vehicleId ? updatedRoute : r)
      });
      saveRoutesData(state.routes.map(r => r.vehicleId === vehicleId ? updatedRoute : r));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al reoptimizar vehículo individual';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      setIsOptimizing(false);
    }
  }, [state.vehicles, state.globalConfig, state.routes]);



  // ── Determine completed tabs ──
  const isTabCompleted = (tabId: string): boolean => {
    if (tabId === 'config' && state.globalConfig) return true;
    if (tabId === 'upload' && state.addresses.length > 0) return true;
    if (tabId === 'zones' && state.clusters.length > 0 && state.routes.length > 0) return true;
    return false;
  };

  // ── Slide-over title per tab ──
  const SLIDE_TITLES: Record<string, string> = {
    config: 'Configuración de Ruta',
    upload: 'Cargar Direcciones',
    zones: 'Zonas y Viabilidad',
    routes: 'Rutas Generadas',
  };

  // ── Map height calculation ──
  const mapHeight = isMapFullscreen ? '100vh' : 'calc(100vh - 48px)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050C1A', overflow: 'hidden' }}>
      {/* ═══════════════════════════════════════════════ */}
      {/* BANNER RGB Y HEADER                            */}
      {/* ═══════════════════════════════════════════════ */}
      {!isMapFullscreen && (
        <>
          <header
            style={{
              height: 48,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              background: '#0A1628',
              borderBottom: '1px solid #112040',
            }}
          >
            {/* ── Left: Logo + Nav ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img
                src="/shuma_logo.png"
                alt="Shuma"
                style={{
                  height: 32,
                  width: 'auto',
                  filter: 'brightness(0) invert(1) drop-shadow(0 0 8px rgba(33,150,243,0.6))',
                  opacity: 0.95
                }}
              />

            {userRole !== 'driver' && (
              <>
                {/* Menú "Más" con Dashboard, Histórico y Bitácora */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setIsMoreMenuOpen(o => !o)}
                    title="Más opciones"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px', background: isMoreMenuOpen ? 'rgba(33,150,243,0.10)' : 'transparent',
                      border: `1px solid ${isMoreMenuOpen ? '#2196F3' : '#112040'}`,
                      borderRadius: 6, color: isMoreMenuOpen ? '#2196F3' : '#5B7BA0',
                      fontSize: fs(11), fontFamily: "'Exo 2', sans-serif",
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2196F3'; e.currentTarget.style.color = '#2196F3'; }}
                    onMouseLeave={e => {
                      if (!isMoreMenuOpen) {
                        e.currentTarget.style.borderColor = '#112040';
                        e.currentTarget.style.color = '#5B7BA0';
                      }
                    }}
                  >
                    <span style={{ fontSize: fs(13) }}>☰</span>
                    <span className="hidden-mobile">Menú</span>
                  </button>

                  {/* Dropdown */}
                  {isMoreMenuOpen && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 100 }}
                        onClick={() => setIsMoreMenuOpen(false)}
                      />
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                        zIndex: 101, minWidth: 160,
                        background: '#0A1628',
                        border: '1px solid #112040',
                        borderRadius: 10,
                        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                        overflow: 'hidden',
                        animation: 'fadeInDown 0.15s ease-out',
                      }}>
                        {[
                          { icon: '📊', label: 'Dashboard', href: '/dashboard' },
                          { icon: '📜', label: 'Histórico', href: '/history' },
                          { icon: '🔍', label: 'Bitácora', action: () => { setIsAuditModalOpen(true); setIsMoreMenuOpen(false); } },
                          { icon: '🚚', label: 'Rutas Activas', action: () => { setIsActiveRoutesOpen(true); setIsMoreMenuOpen(false); } },
                        ].map(item => (
                          <button
                            key={item.label}
                            onClick={() => {
                              if (item.action) item.action();
                              else { window.location.href = item.href!; setIsMoreMenuOpen(false); }
                            }}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 14px', background: 'none', border: 'none',
                              color: '#94a3b8', fontSize: fs(12), cursor: 'pointer',
                              fontFamily: "'Exo 2', sans-serif", textAlign: 'left',
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(33,150,243,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#94a3b8'; }}
                          >
                            <span style={{ fontSize: fs(14) }}>{item.icon}</span>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <style>{`
                  @keyframes fadeInDown {
                    from { opacity: 0; transform: translateY(-6px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>

                {/* Botón tamaño de texto */}
                {userRole !== 'driver' && <FontScaleButton />}

                {/* Widget clima */}
                {weather && (
                  <WeatherIntelPanel weather={weather} />
                )}
              </>
            )}
          </div>

          <span style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: "'Exo 2', sans-serif",
            fontSize: fs(13),
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            background: 'linear-gradient(90deg,#ff0000,#ff6600,#ffff00,#00ff00,#00ffff,#0066ff,#cc00ff,#ff0000)',
            backgroundSize: '400% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'rgbRoll 5s linear infinite',
            opacity: 0.8,
            pointerEvents: 'none',
            userSelect: 'none',
          }}>
            Design &amp; Developed by Shuma Sistemas IT
          </span>

          {/* ── Right: User info + Logout ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {userName && (
              <span className="hidden-mobile" style={{ fontSize: fs(12), color: '#E8EFF8', fontWeight: 500 }}>
                {userName}
              </span>
            )}

            {userRole && (
              <span
                style={{
                  background: 'rgba(33,150,243,0.12)',
                  border: '1px solid rgba(33,150,243,0.25)',
                  borderRadius: 20,
                  padding: '2px 8px',
                  fontSize: fs(9),
                  color: '#4a90d9',
                  fontFamily: "'Exo 2', sans-serif",
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {ROLE_LABELS[userRole] || userRole}
              </span>
            )}

            <button
              onClick={handleLogout}
              title="Salir"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                background: 'transparent',
                border: '1px solid #112040',
                borderRadius: 6,
                color: '#5B7BA0',
                fontSize: fs(11),
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#EF4444';
                e.currentTarget.style.color = '#EF4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#112040';
                e.currentTarget.style.color = '#5B7BA0';
              }}
            >
              <LogOut size={14} />
              <span className="hidden-mobile">Salir</span>
            </button>
          </div>
        </header>
        </>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* MAP AREA — full width                          */}
      {/* ═══════════════════════════════════════════════ */}
      <main ref={mapContainerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', height: mapHeight }}>
        {/* Map */}
        <MapView
          addresses={state.addresses}
          routes={state.routes}
          depot={state.depot}
          hiddenRouteIds={hiddenRouteIds}
          liveDeliveryStatus={liveDeliveryStatus}
        />

        {/* ── Weather widget (bottom-left) ── */}
        {weather && (
          <div style={{ position: 'absolute', bottom: 70, left: 12, zIndex: 10 }}>
            <WeatherBanner weather={weather} />
          </div>
        )}

        {/* ── Bienvenida GPS ── */}
        {state.step === 'config' && state.addresses.length === 0 && !isSlideOverOpen && !welcomeDismissed && mapSize.w > 0 && fabPos.x > 0 && (
          <>
            <style>{`
              @keyframes traza-ruta {
                0%   { stroke-dashoffset: 1200; opacity: 0; }
                5%   { opacity: 1; }
                100% { stroke-dashoffset: 0; opacity: 1; }
              }
              @keyframes aparece-pin {
                0%,89% { opacity: 0; transform: translateY(-12px) scale(0.5); }
                90%    { opacity: 1; transform: translateY(2px) scale(1.1); }
                100%   { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes aparece-pin-2 {
                0%,70% { opacity: 0; transform: translateY(-12px) scale(0.5); }
                80%    { opacity: 1; transform: translateY(2px) scale(1.1); }
                100%   { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes aparece-pin-3 {
                0%,50% { opacity: 0; transform: translateY(-12px) scale(0.5); }
                65%    { opacity: 1; transform: translateY(2px) scale(1.1); }
                100%   { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes pulso-origen {
                0%,100% { transform: scale(1); opacity: 1; }
                50%     { transform: scale(1.6); opacity: 0.3; }
              }
              @keyframes pulso-destino {
                0%,100% { r: 8; opacity: 0.9; }
                50%     { r: 13; opacity: 0.4; }
              }
              @keyframes halo-destino {
                0%   { r: 10; opacity: 0.4; }
                100% { r: 30; opacity: 0; }
              }
              @keyframes fade-card {
                from { opacity: 0; transform: translate(-50%,-46%); }
                to   { opacity: 1; transform: translate(-50%,-50%); }
              }
              @keyframes camion-move {
                0%   { offset-distance: 0%; opacity: 0; }
                5%   { opacity: 1; }
                95%  { opacity: 1; }
                100% { offset-distance: 100%; opacity: 0; }
              }
              @keyframes fab-pulse {
                0%, 100% {
                  box-shadow: 0 0 0 0 rgba(33,150,243,0.5), 0 4px 20px rgba(0,71,171,0.5);
                }
                50% {
                  box-shadow: 0 0 0 12px rgba(33,150,243,0), 0 4px 30px rgba(0,71,171,0.7);
                }
              }
            `}</style>

            {/* SVG — ruta desde card hacia botón Configuración */}
            <svg
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                zIndex: 9,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              {(() => {
                const W = mapSize.w;
                const H = mapSize.h;

                // Origen: debajo de la card (card está en top:42%, ~160px alto)
                const ox = W * 0.5;
                const oy = H * 0.42 + 100;

                // Destino: centro del botón Configuración
                // FAB: bottom:20 right:20, ancho ~130px, alto ~40px
                const dx = W - 20 - 65;
                const dy = H - 20 - 20;

                // Paradas intermedias — entre card y FAB
                const p1x = ox + (dx - ox) * 0.25, p1y = oy + (dy - oy) * 0.35;
                const p2x = ox + (dx - ox) * 0.55, p2y = oy + (dy - oy) * 0.60;
                const p3x = ox + (dx - ox) * 0.80, p3y = oy + (dy - oy) * 0.80;

                // Path: curva Bézier desde card hasta FAB
                const c1x = ox, c1y = oy + (dy - oy) * 0.45;
                const c2x = dx - (dx - ox) * 0.1, c2y = dy - (dy - oy) * 0.15;
                const path = `M ${ox} ${oy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${dx} ${dy}`;

                return (
                  <>
                    <defs>
                      <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor="#1565C0" />
                        <stop offset="60%"  stopColor="#2196F3" />
                        <stop offset="100%" stopColor="#42A5F5" />
                      </linearGradient>
                    </defs>

                    {/* ── Sombra de la línea ── */}
                    <path d={path} fill="none"
                      stroke="rgba(0,20,60,0.5)" strokeWidth="6"
                      strokeLinecap="round" strokeDasharray="1000" strokeDashoffset="1000">
                      <animate attributeName="stroke-dashoffset"
                        from="1000" to="0" dur="2s" begin="0.3s"
                        fill="freeze" calcMode="spline"
                        keyTimes="0;1" keySplines="0.4 0 0.2 1" />
                    </path>

                    {/* ── Línea principal azul ── */}
                    <path d={path} fill="none"
                      stroke="url(#line-grad)" strokeWidth="3.5"
                      strokeLinecap="round" strokeDasharray="1000" strokeDashoffset="1000">
                      <animate attributeName="stroke-dashoffset"
                        from="1000" to="0" dur="2s" begin="0.3s"
                        fill="freeze" calcMode="spline"
                        keyTimes="0;1" keySplines="0.4 0 0.2 1" />
                    </path>

                    {/* ── Brillo encima ── */}
                    <path d={path} fill="none"
                      stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"
                      strokeLinecap="round" strokeDasharray="1000" strokeDashoffset="1000">
                      <animate attributeName="stroke-dashoffset"
                        from="1000" to="0" dur="2s" begin="0.3s"
                        fill="freeze" calcMode="spline"
                        keyTimes="0;1" keySplines="0.4 0 0.2 1" />
                    </path>

                    {/* ── Punto origen bajo la card — pulsa ── */}
                    <circle cx={ox} cy={oy} r="5" fill="#2196F3">
                      <animate attributeName="r" values="5;9;5" dur="1.4s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={ox} cy={oy} r="12" fill="none" stroke="#2196F3" strokeWidth="1" opacity="0.2">
                      <animate attributeName="r" values="8;20;8" dur="1.4s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.3;0;0.3" dur="1.4s" repeatCount="indefinite" />
                    </circle>

                    {/* ── Pines decorativos que aparecen a lo largo ── */}
                    {[
                      { cx: p1x, cy: p1y, label: '1', delay: '1.0s' },
                      { cx: p2x, cy: p2y, label: '2', delay: '1.5s' },
                      { cx: p3x, cy: p3y, label: '3', delay: '2.0s' },
                    ].map(({ cx, cy, label, delay }) => (
                      <g key={label} opacity="0">
                        <animate attributeName="opacity" values="0;1" dur="0.4s" begin={delay} fill="freeze" />
                        <circle cx={cx} cy={cy} r="9" fill="#1565C0" stroke="#42A5F5" strokeWidth="1.5" />
                        <text x={cx} y={cy + 3.5} textAnchor="middle"
                          fill="white" fontSize="8" fontWeight="bold">{label}</text>
                      </g>
                    ))}

                    {/* ── Destino: halo expansivo + pin al llegar ── */}
                    <circle cx={dx} cy={dy} r="0" fill="none" stroke="#2196F3" strokeWidth="1.5" opacity="0">
                      <animate attributeName="r"       values="0;25"   dur="0.8s" begin="2.2s" fill="freeze" />
                      <animate attributeName="opacity" values="0.6;0"  dur="0.8s" begin="2.2s" fill="freeze" />
                    </circle>
                    <circle cx={dx} cy={dy} r="0" fill="#0047AB" stroke="#42A5F5" strokeWidth="2" opacity="0">
                      <animate attributeName="r"       values="0;10;7" dur="0.4s" begin="2.2s" fill="freeze" />
                      <animate attributeName="opacity" values="0;1"    dur="0.2s" begin="2.2s" fill="freeze" />
                    </circle>
                    <text x={dx} y={dy + 4} textAnchor="middle" fill="white" fontSize="10" opacity="0">
                      <animate attributeName="opacity" values="0;1" dur="0.3s" begin="2.4s" fill="freeze" />
                      ⚙
                    </text>
                  </>
                );
              })()}
            </svg>

            {/* ── Card de bienvenida ── */}
            <div style={{
              position: 'absolute', top: '38%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10, textAlign: 'center',
              animation: 'fade-card 0.4s ease-out',
            }}>
              <div style={{
                background: 'rgba(5,15,35,0.95)',
                border: '1px solid rgba(33,150,243,0.3)',
                borderRadius: 20,
                padding: '24px 32px 20px',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(33,150,243,0.08)',
                maxWidth: 290, position: 'relative',
              }}>
                {/* Botón X */}
                <button
                  onClick={() => setWelcomeDismissed(true)}
                  style={{
                    position: 'absolute', top: 10, right: 12,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#3B5270', fontSize: 16, lineHeight: 1,
                    padding: 4, transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#E8EFF8'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#3B5270'; }}
                >✕</button>

                <div style={{ fontSize: 34, marginBottom: 8 }}>🗺️</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#E8EFF8',
                  fontFamily: "'Exo 2', sans-serif", margin: '0 0 6px' }}>
                  Bienvenido a Shuma Rutas
                </p>
                <p style={{ fontSize: 11, color: '#5B7BA0', lineHeight: 1.5, margin: '0 0 14px' }}>
                  Optimiza las rutas de entrega de tu flota en minutos.
                </p>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  justifyContent: 'center', fontSize: 11,
                  color: '#2196F3', fontFamily: "'Exo 2', sans-serif",
                }}>
                  <span style={{ fontSize: 13 }}>⚙️</span>
                  <span>Toca <strong>Configuración</strong> para comenzar</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Banner: geocodificación completada ── */}
        {geocodingDone && state.step !== 'geocoding' && (
          <div style={{
            position: 'absolute',
            top: 16, left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 11,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 18px',
            borderRadius: 20,
            background: 'rgba(16,185,129,0.15)',
            border: '1px solid rgba(16,185,129,0.4)',
            backdropFilter: 'blur(8px)',
            color: '#10B981',
            fontSize: 12,
            fontFamily: "'Exo 2', sans-serif",
            fontWeight: 600,
            boxShadow: '0 4px 20px rgba(16,185,129,0.2)',
            animation: 'fadeInDown 0.3s ease-out',
            whiteSpace: 'nowrap',
          }}>
            <span>✅</span>
            <span>
              {state.addresses.filter(a => a.geocoded && !a.geocodeError).length} direcciones
              geocodificadas — listo para continuar
            </span>
          </div>
        )}

        {/* ── Badge: geocoding ── */}
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

        {/* ── Badge: optimizing ── */}
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

        {/* ── Route legend badges (top-right, offset if fullscreen btn) ── */}
        {state.routes.length > 0 && (
          <div style={{ position: 'absolute', top: 16, right: 52, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {state.routes.map((r) => (
              <div
                key={r.vehicleId}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-colors ${
                  hiddenRouteIds.includes(r.vehicleId) 
                    ? 'bg-slate-900/50 border-slate-700/50 opacity-60' 
                    : 'bg-slate-900/90 backdrop-blur border-shuma-border'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hiddenRouteIds.includes(r.vehicleId) ? '#64748b' : r.color }} />
                <span className="text-shuma-text font-medium">{r.driverName}</span>
                <span className="text-shuma-muted">{r.stops.length} paradas</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHiddenRouteIds(prev => 
                      prev.includes(r.vehicleId) 
                        ? prev.filter(id => id !== r.vehicleId) 
                        : [...prev, r.vehicleId]
                    );
                  }}
                  className="ml-1 p-1 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center text-shuma-muted hover:text-white"
                  title={hiddenRouteIds.includes(r.vehicleId) ? "Mostrar ruta" : "Ocultar ruta"}
                >
                  {hiddenRouteIds.includes(r.vehicleId) ? '👁️‍🗨️' : '👁️'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Fullscreen toggle (top-right corner) ── */}
        <button
          onClick={() => setIsMapFullscreen((prev) => !prev)}
          title={isMapFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 12,
            width: 32,
            height: 32,
            background: '#0A1628',
            border: '1px solid #112040',
            borderRadius: 6,
            color: '#5B7BA0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#2196F3';
            e.currentTarget.style.color = '#2196F3';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#112040';
            e.currentTarget.style.color = '#5B7BA0';
          }}
        >
          {isMapFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        {/* ── FAB (bottom-right) — always visible including fullscreen ── */}
        {FAB_CONFIG[activeTab] && (
          <button
            ref={fabRef}
            onClick={() => {
              if (activeTab === 'routes' && state.routes.length === 0) {
                setActiveTab('config');
                dispatch({ type: 'SET_STEP', payload: 'config' });
              }
              setIsSlideOverOpen(true);
            }}
            style={{
              position: 'absolute',
              bottom: 20,
              right: 20,
              zIndex: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              background: state.addresses.length === 0 && !welcomeDismissed
                ? 'linear-gradient(135deg, #0047AB, #1565C0)'
                : '#0047AB',
              border: state.addresses.length === 0 && !welcomeDismissed
                ? '2px solid rgba(33,150,243,0.6)'
                : 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Exo 2', sans-serif",
              letterSpacing: '0.08em',
              boxShadow: state.addresses.length === 0 && !welcomeDismissed
                ? '0 0 0 0 rgba(33,150,243,0.6), 0 4px 20px rgba(0,71,171,0.5)'
                : '0 4px 20px rgba(0,71,171,0.4)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              animation: state.addresses.length === 0 && !welcomeDismissed
                ? 'fab-pulse 2s ease-in-out infinite'
                : 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #1565C0, #1976D2)';
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,71,171,0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = state.addresses.length === 0 && !welcomeDismissed
                ? 'linear-gradient(135deg, #0047AB, #1565C0)'
                : '#0047AB';
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = state.addresses.length === 0 && !welcomeDismissed
                ? '0 0 0 0 rgba(33,150,243,0.6), 0 4px 20px rgba(0,71,171,0.5)'
                : '0 4px 20px rgba(0,71,171,0.4)';
            }}
          >
            <span style={{ fontSize: 14 }}>⚙</span>
            Configuración
          </button>
        )}

        {/* ── Error banner on map ── */}
        {state.error && (
          <div style={{
            position: 'absolute',
            bottom: 70,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            maxWidth: 500,
            width: '90%',
          }}>
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 backdrop-blur">
              <p className="text-xs text-red-400">{state.error}</p>
            </div>
          </div>
        )}
      </main>

      {/* ── Modal de recuperación de sesión ── */}
      {sessionToRestore && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9990,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: '#0A1628', border: '1px solid #1E3A5F',
            borderRadius: 20, padding: '24px', maxWidth: 380, width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>💾</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', textAlign: 'center', marginBottom: 6 }}>
              Sesión anterior encontrada
            </h3>
            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 4 }}>
              Guardada: {new Date(sessionToRestore.savedAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
            </p>
            <div style={{
              display: 'flex', gap: 8, margin: '12px 0',
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(33,150,243,0.08)', border: '1px solid rgba(33,150,243,0.15)',
            }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>{sessionToRestore.vehicleCount}</p>
                <p style={{ fontSize: 10, color: '#5B7BA0', textTransform: 'uppercase' }}>Vehículos</p>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>{sessionToRestore.addressCount}</p>
                <p style={{ fontSize: 10, color: '#5B7BA0', textTransform: 'uppercase' }}>Direcciones</p>
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginBottom: 16 }}>
              ¿Deseas continuar donde lo dejaste?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  sessionStorage.removeItem('shuma_rutas_session');
                  setSessionToRestore(null);
                }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                  background: 'transparent', border: '1px solid #1E3A5F',
                  color: '#5B7BA0', fontSize: 12, fontWeight: 600,
                }}
              >
                Empezar nuevo
              </button>
              <button
                onClick={() => {
                  try {
                    const saved = sessionStorage.getItem('shuma_rutas_session');
                    if (!saved) return;
                    const parsed = JSON.parse(saved);
                    if (parsed.globalConfig) dispatch({ type: 'SET_GLOBAL_CONFIG', payload: parsed.globalConfig });
                    if (parsed.vehicles?.length) parsed.vehicles.forEach((v: any) => dispatch({ type: 'ADD_VEHICLE', payload: v }));
                    if (parsed.addresses?.length) dispatch({ type: 'SET_ADDRESSES', payload: parsed.addresses });
                    if (parsed.clusters?.length) dispatch({ type: 'SET_CLUSTERS', payload: parsed.clusters });
                    if (parsed.step) dispatch({ type: 'SET_STEP', payload: parsed.step });
                  } catch { /* ignore */ }
                  setSessionToRestore(null);
                }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #1E3A8A, #2563EB)',
                  border: '1px solid #3B82F6',
                  color: '#fff', fontSize: 12, fontWeight: 700,
                }}
              >
                ✓ Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* SLIDE-OVER CON PESTAÑAS INTERNAS                */}
      {/* ═══════════════════════════════════════════════ */}
      <SlideOver
        isOpen={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        title={SLIDE_TITLES[activeTab] || 'Configuración'}
        width={['config','zones'].includes(activeTab) ? 920 : 960}
        footer={
          activeTab === 'config' ? (
            <>
              <button className="so-btn-ghost" onClick={() => setIsSlideOverOpen(false)}>
                Cancelar
              </button>
              <button
                className="so-btn-primary"
                id="config-submit-btn"
                onClick={() => {
                  const btn = document.getElementById('config-save-trigger');
                  if (btn) btn.click();
                }}
              >
                Guardar y continuar →
              </button>
            </>
          ) : activeTab === 'upload' ? (
            <>
              <button className="so-btn-ghost" onClick={() => { setActiveTab('config'); }}>
                ← Volver
              </button>
              <button
                className="so-btn-primary"
                disabled={state.addresses.length === 0}
                onClick={() => {
                  if (state.addresses.length > 0) {
                    setActiveTab('zones');
                  }
                }}
              >
                Continuar a Zonas →
              </button>
            </>
          ) : activeTab === 'zones' ? (
            <>
              <button className="so-btn-ghost" onClick={() => { setActiveTab('upload'); }}>
                ← Volver
              </button>
              <button
                className="so-btn-primary"
                onClick={() => {
                  dispatch({ type: 'SET_STEP', payload: 'optimizing' });
                  handleOptimize();
                  setIsSlideOverOpen(false);
                }}
              >
                ⚡ Optimizar Rutas
              </button>
            </>
          ) : activeTab === 'routes' && state.routes.length > 0 ? (
            <>
              <ReportButton 
                routes={state.routes} 
                weather={weather} 
                globalConfig={state.globalConfig} 
                userName={userName}
                userRole={userRole}
              />
            </>
          ) : undefined
        }
      >
        <div style={{
          display: 'flex',
          gap: 4,
          padding: '0 0 16px 0',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          marginBottom: 20
        }}>
          {(['config','upload','zones','routes'] as const).map((s, i) => {
            const tabMeta = [
              { label: 'Conf.',  icon: '⚙️' },
              { label: 'Dir.',   icon: '📂' },
              { label: 'Zonas', icon: '🗺️' },
              { label: 'Rutas', icon: '🚚' },
            ];
            const { label, icon } = tabMeta[i];
            const isActive = activeTab === s;
            const stepsOrder = ['config','upload','zones','routes'];
            const isDone = stepsOrder.indexOf(activeTab) > stepsOrder.indexOf(s) || isTabCompleted(s);
            return (
              <button key={s}
                onClick={() => {
                  setActiveTab(s);
                  if (s === 'config') dispatch({ type: 'SET_STEP', payload: 'config' });
                  if (s === 'upload') dispatch({ type: 'SET_STEP', payload: 'upload' });
                  if (s === 'zones') dispatch({ type: 'SET_STEP', payload: 'zones' });
                  if (s === 'routes') dispatch({ type: 'SET_STEP', payload: 'results' });
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: isActive ? 'rgba(33,150,243,0.12)' : 'transparent',
                  border: isActive ? '1px solid rgba(33,150,243,0.3)' : '1px solid transparent',
                  borderRadius: 8,
                  color: isActive ? '#2196F3' : isDone ? '#10B981' : '#5B7BA0',
                  fontSize: fs(12),
                  cursor: 'pointer',
                  fontFamily: "'Exo 2', sans-serif",
                  letterSpacing: '0.06em',
                  transition: 'all 0.2s',
                  minWidth: 60
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: fs(14), lineHeight: 1 }}>
                    {isDone && !isActive ? '✅' : icon}
                  </span>
                  <span style={{ fontSize: fs(10) }}>{label}</span>
                </span>
              </button>
            );
          })}
        </div>

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

        {activeTab === 'upload' && (
          <CSVUploader
            onAddressesLoaded={handleAddressesLoaded}
            disabled={!state.globalConfig}
            persistedAddresses={state.addresses}
            persistedFileName={state.addresses.length > 0 ? `${state.addresses.length} direcciones cargadas` : undefined}
          />
        )}

        {activeTab === 'zones' && (
          <div className="space-y-4">
            <div className="w-full h-[400px] rounded-xl overflow-hidden border border-shuma-border">
              <ZoneMap
                clusters={state.clusters}
                onConfirm={() => {
                  dispatch({ type: 'SET_STEP', payload: 'optimizing' });
                  handleOptimize();
                  setIsSlideOverOpen(false);
                }}
                onRegroup={() => {
                  const regenerated = clusterDeliveries(state.addresses, state.vehicles, state.clusteringConfig);
                  dispatch({ type: 'SET_CLUSTERS', payload: regenerated });
                }}
              />
            </div>
            <div className="flex items-center justify-between bg-slate-700/50 p-3 rounded-xl border border-shuma-border">
              <div>
                <h3 className="text-sm font-bold text-white">Zonas ({state.clusters.length})</h3>
                <p className="text-xs text-shuma-muted">1 zona por camión</p>
              </div>
              <button
                onClick={() => setShowInlineVehicleForm(!showInlineVehicleForm)}
                className="px-3 py-1.5 text-xs font-bold bg-slate-600 hover:bg-slate-500 rounded-lg text-white"
              >
                {showInlineVehicleForm ? 'Cancelar' : '+ Agregar camión'}
              </button>
            </div>

            {showInlineVehicleForm && (
              <div className="bg-shuma-surface rounded-xl p-3 border border-shuma-border">
                <VehicleForm
                  vehicles={state.vehicles}
                  onAdd={(v) => {
                    dispatch({ type: 'ADD_VEHICLE', payload: v });
                    setShowInlineVehicleForm(false);
                    const newClusters = clusterDeliveries(state.addresses, [...state.vehicles, v], state.clusteringConfig);
                    dispatch({ type: 'SET_CLUSTERS', payload: newClusters });
                    setNumClusters(state.vehicles.length + 1);
                  }}
                  onRemove={(id) => dispatch({ type: 'REMOVE_VEHICLE', payload: id })}
                />
              </div>
            )}

            <div className="bg-shuma-surface p-3 rounded-xl border border-shuma-border space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-shuma-text">Balanceo de Flota</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setFleetMode(m => m === 'auto' ? 'manual' : 'auto')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px',
                      borderRadius: 20,
                      border: `1px solid ${fleetMode === 'auto' ? '#22c55e' : '#f59e0b'}`,
                      background: fleetMode === 'auto' ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)',
                      color: fleetMode === 'auto' ? '#22c55e' : '#f59e0b',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Exo 2', sans-serif",
                      transition: 'all 0.2s',
                    }}
                  >
                    {fleetMode === 'auto' ? '⚡ Automático' : '✋ Manual'}
                  </button>
                </div>
              </div>
              {fleetMode === 'manual' && (
                <p style={{ fontSize: 11, color: '#f59e0b', margin: '8px 0 0', lineHeight: 1.5 }}>
                  Modo manual: arrastra las facturas entre choferes en el paso de Rutas para
                  redistribuir paradas. Google no rebalanceará automáticamente.
                </p>
              )}
              <div className="text-[11px] text-shuma-muted leading-relaxed bg-slate-900/50 p-2 rounded-lg border border-shuma-border">
                <p>
                  Google Route Optimization API distribuye inteligentemente las paradas basándose en las capacidades de los vehículos minimizando el tiempo y costo total para toda la flota.
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {state.clusters.map((cluster, idx) => {
                const assignedVehicle = state.vehicles[idx];
                return (
                  <li key={cluster.id} className="p-3 bg-shuma-surface rounded-lg border-l-4" style={{ borderColor: cluster.color }}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">{cluster.name}</h4>
                        <p className="text-xs text-shuma-muted">{cluster.addresses.length} paradas</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-shuma-muted uppercase font-bold tracking-wider">Chofer Asignado</label>
                      <select
                        value={assignedVehicle?.id || ''}
                        onChange={(e) => {
                          const newVehicleId = e.target.value;
                          const newIdx = state.vehicles.findIndex(v => v.id === newVehicleId);
                          if (newIdx !== -1 && newIdx !== idx) {
                            dispatch({ type: 'SWAP_VEHICLES', payload: { index1: idx, index2: newIdx } });
                          }
                        }}
                        className="w-full bg-slate-900 border border-shuma-border rounded-md p-1.5 text-xs text-slate-200 outline-none"
                      >
                        {state.vehicles.map(v => (
                          <option key={v.id} value={v.id}>{v.driverName} ({v.type})</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 mt-2">
                      <label className="text-[10px] text-shuma-muted uppercase font-bold tracking-wider">Capacidad Máxima (Paradas)</label>
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
                        className="w-full bg-slate-900 border border-shuma-border rounded-md p-1.5 text-xs text-slate-200 outline-none"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* PANEL DE VIABILIDAD ANTES DE OPTIMIZAR */}
            <div className="bg-shuma-surface p-3 rounded-xl border border-shuma-border space-y-3 mt-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-shuma-text">Viabilidad Estimada</label>
                <span className="text-[10px] text-shuma-muted">Pre-optimización Google</span>
              </div>
              <div className="space-y-2">
                {calcularViabilidad(state.vehicles, state.clusters, state.globalConfig).map(viab => {
                  let semaforo = '🟢';
                  let bgClass = 'bg-emerald-500/5';
                  let borderClass = 'border-l-emerald-500';
                  if (viab.status === 'warning') {
                    semaforo = '🟡'; bgClass = 'bg-amber-500/5'; borderClass = 'border-l-amber-500';
                  } else if (viab.status === 'critical') {
                    semaforo = '🔴'; bgClass = 'bg-red-500/5'; borderClass = 'border-l-red-500';
                  }

                  return (
                    <div key={viab.vehicleId} className={`p-2 border-l-[3px] ${borderClass} ${bgClass} rounded-r-lg border-y border-r border-shuma-border/50`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-slate-200">{semaforo} {viab.driverName}</span>
                        <span className="text-[10px] font-medium text-shuma-muted">Límite: {viab.deadlineTime}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                        <span>Salida: {viab.departureTime}</span>
                        <span>Entregas: {viab.stops}</span>
                        <span className={`font-bold ${viab.status === 'critical' ? 'text-red-400' : viab.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>Regreso est: {viab.estimatedReturn}</span>
                      </div>
                      <div className="text-[9px] text-shuma-muted">
                        Tránsito: ~{Math.floor(viab.transitMinutes/60)}h {viab.transitMinutes%60}m + Descarga: ~{Math.floor(viab.unloadMinutes/60)}h {viab.unloadMinutes%60}m = Total: ~{Math.floor(viab.totalMinutes/60)}h {viab.totalMinutes%60}m
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'routes' && (
          <div className="space-y-3">
            <RoutePanel
              routes={state.routes}
              onShareRoute={handleShareRoute}
              onReoptimize={handleReoptimize}
              allVehicles={state.vehicles}
              hiddenRouteIds={hiddenRouteIds}
              onSaveManualOrder={handleSaveManualOrder}
              onReoptimizeSingle={handleReoptimizeSingle}
              globalDepartureTime={state.globalConfig?.departureTime}
              deadlineTime={state.globalConfig?.deadlineTime}
              unloadConfig={state.globalConfig?.unloadConfig}
              onVehicleTimeChange={(vehicleId, timeStr) => {
                dispatch({ 
                  type: 'UPDATE_VEHICLE', 
                  payload: { id: vehicleId, changes: { departureTime: timeStr } } 
                });
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
          </div>
        )}
      </SlideOver>


      {/* ── Responsive CSS ── */}
      <style jsx global>{`
        @media (max-width: 767px) {
          .hidden-mobile {
            display: none !important;
          }
        }
        @media (min-width: 768px) {
          .hidden-mobile {
            display: inline;
          }
        }
      `}</style>

      {/* ── Modal Rutas Activas ── */}
      {isActiveRoutesOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            style={{ zIndex: 9998 }}
            onClick={() => setIsActiveRoutesOpen(false)}
          />
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: 9999, pointerEvents: 'none' }}
          >
            <div
              className="pointer-events-auto bg-shuma-bg border border-shuma-border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col"
              style={{ maxHeight: 'min(85vh, 600px)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-shuma-border shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-shuma-text">🚚 Rutas Activas</h2>
                  <p className="text-xs text-shuma-muted mt-0.5">
                    {new Date().toLocaleDateString('es-MX', {
                      weekday: 'long', day: 'numeric', month: 'long',
                      timeZone: 'America/Mexico_City'
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setIsActiveRoutesOpen(false)}
                  className="p-2 hover:bg-shuma-surface rounded-lg transition-colors"
                >
                  <span style={{ fontSize: 16, color: '#5B7BA0' }}>✕</span>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {state.routes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2">
                    <p className="text-shuma-muted text-sm">No hay rutas activas hoy</p>
                    <p className="text-xs text-shuma-muted opacity-50">Optimiza una ruta para verla aquí</p>
                  </div>
                ) : (
                  state.routes.map((route, i) => {
                    const totalStops     = route.stops.length;
                    const delivered      = route.stops.filter(s => (s as any).status === 'delivered' || (s as any).status === 'completed').length;
                    const failed         = route.stops.filter(s => (s as any).status === 'failed').length;
                    const pending        = totalStops - delivered - failed;
                    const pct            = Math.round((delivered / totalStops) * 100);
                    const isComplete     = pending === 0;

                    return (
                      <div
                        key={route.vehicleId}
                        className="p-4 rounded-xl border border-shuma-border bg-shuma-surface/30 cursor-pointer
                                   hover:border-blue-500/40 hover:bg-blue-500/5 transition-all"
                        onClick={() => {
                          setIsActiveRoutesOpen(false);
                          // Mostrar esta ruta en el mapa
                          const hiddenSet = hiddenRouteIds.filter(id => id !== route.vehicleId);
                          setHiddenRouteIds(
                            state.routes
                              .filter(r => r.vehicleId !== route.vehicleId)
                              .map(r => r.vehicleId)
                          );
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: route.color }} />
                            <span className="font-semibold text-shuma-text text-sm">
                              {route.driverName}
                            </span>
                            <span className="text-xs text-shuma-muted">
                              · {route.matricula} · {((route.totalDistance || 0)/1000).toFixed(1)} km
                            </span>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            isComplete
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : failed > 0
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          }`}>
                            {isComplete ? '✓ Completada' : failed > 0 ? '⚠ Con fallos' : '● En curso'}
                          </span>
                        </div>

                        {/* Barra de progreso */}
                        <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: route.color }}
                          />
                        </div>

                        {/* Stats */}
                        <div className="flex gap-4 text-xs">
                          <span className="text-emerald-400">✓ {delivered} entregadas</span>
                          {failed > 0 && <span className="text-red-400">✗ {failed} fallidas</span>}
                          {pending > 0 && <span className="text-shuma-muted">○ {pending} pendientes</span>}
                          <span className="text-shuma-muted ml-auto">{pct}%</span>
                        </div>

                        <p className="text-xs text-blue-400 mt-2 opacity-70">
                          Click para ver en el mapa →
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-shuma-border text-xs text-shuma-muted shrink-0">
                {state.routes.length} ruta(s) · Click en una ruta para destacarla en el mapa
              </div>
            </div>
          </div>
        </>
      )}

      <AuditLogModal 
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        userRole={userRole}
      />
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
  const [deadlineTime, setDeadlineTime] = useState(currentConfig?.deadlineTime || '17:45');
  const [unloadConfig, setUnloadConfig] = useState(currentConfig?.unloadConfig || { truckLarge: 20, truckSmall: 18, van: 15 });
  const [time, setTime] = useState(() => {
    if (currentConfig?.departureTime) return currentConfig.departureTime;
    const now = new Date();
    now.setMinutes(Math.ceil((now.getMinutes() + 10) / 5) * 5);
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });

  const handleSave = () => {
    const dep = DEPOTS.find(d => d.id === depotId)!;
    const ret = returnDepotId === 'same' ? 'same' : DEPOTS.find(d => d.id === returnDepotId)!;
    onSave({ departureDepot: dep, returnDepot: ret, departureTime: time, deadlineTime, unloadConfig });
  };

  return (
    <div className="space-y-6">
      {/* SECCIÓN 1: Bodegas y horarios */}
      <div className="so-section">
        <h4 className="so-section-title">Bodegas y horarios</h4>
        <div className="space-y-3">
          <div>
            <label className="so-label">Bodega de salida</label>
            <select 
              value={depotId} 
              onChange={(e) => setDepotId(e.target.value)}
              className="so-select"
            >
              {DEPOTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label className="so-label">Bodega de regreso</label>
            <select 
              value={returnDepotId} 
              onChange={(e) => setReturnDepotId(e.target.value)}
              className="so-select"
            >
              <option value="same">Misma que salida</option>
              {DEPOTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="so-label">Hora de salida</label>
              <input 
                type="time" 
                value={time} 
                onChange={(e) => setTime(e.target.value)}
                className="so-input"
                style={(() => {
                  const now = new Date();
                  const currentMins = now.getHours() * 60 + now.getMinutes();
                  const [h, m] = (time || '08:00').split(':').map(Number);
                  return (h * 60 + m) < currentMins ? { borderColor: '#EF4444', color: '#EF4444' } : {};
                })()}
              />
              {(() => {
                const now = new Date();
                const currentMins = now.getHours() * 60 + now.getMinutes();
                const [h, m] = (time || '08:00').split(':').map(Number);
                return (h * 60 + m) < currentMins ? (
                  <p style={{ color: '#EF4444', fontSize: 10, marginTop: 4 }}>⚠️ Esta hora ya pasó</p>
                ) : null;
              })()}
            </div>
            <div>
              <label className="so-label">Límite de regreso</label>
              <input 
                type="time" 
                value={deadlineTime} 
                onChange={(e) => setDeadlineTime(e.target.value)}
                className="so-input"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: Tiempo de descarga */}
      <div className="so-section">
        <h4 className="so-section-title">Tiempo de descarga por entrega (min)</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label className="so-label">Camión grande</label>
            <input 
              type="number" 
              min="1" 
              value={unloadConfig.truckLarge} 
              onChange={e => setUnloadConfig({...unloadConfig, truckLarge: parseInt(e.target.value) || 0})} 
              className="so-input" 
              style={{ textAlign: 'center' }}
            />
          </div>
          <div>
            <label className="so-label">Camión chico</label>
            <input 
              type="number" 
              min="1" 
              value={unloadConfig.truckSmall} 
              onChange={e => setUnloadConfig({...unloadConfig, truckSmall: parseInt(e.target.value) || 0})} 
              className="so-input" 
              style={{ textAlign: 'center' }}
            />
          </div>
          <div>
            <label className="so-label">Camioneta</label>
            <input 
              type="number" 
              min="1" 
              value={unloadConfig.van} 
              onChange={e => setUnloadConfig({...unloadConfig, van: parseInt(e.target.value) || 0})} 
              className="so-input" 
              style={{ textAlign: 'center' }}
            />
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: Flota asignada */}
      <div className="so-section">
        <h4 className="so-section-title">Flota asignada</h4>
        <VehicleForm vehicles={vehicles} onAdd={onAddVehicle} onRemove={onRemoveVehicle} />
      </div>

      {/* Hidden trigger button for external save */}
      <button
        id="config-save-trigger"
        onClick={handleSave}
        disabled={vehicles.length === 0 || (() => {
          const now = new Date();
          const currentMins = now.getHours() * 60 + now.getMinutes();
          const [h, m] = (time || '08:00').split(':').map(Number);
          return (h * 60 + m) < currentMins;
        })()}
        style={{ display: 'none' }}
      >
        Save
      </button>
    </div>
  );
}
