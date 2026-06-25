'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  Address, Vehicle, Route, AppState, AppStep, SharedRouteState,
} from '@/types';
import { getWeatherCDMX, type WeatherData } from '@/lib/weather';
import { geocodeBatch, geocodeAddress } from '@/lib/nominatim';
import { optimizeRoutes, optimizeRoutesGoogle, assignVehicleColors, optimizeSingleVehicle, redrawPolylineForRoute } from '@/lib/vroom';
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
import { BarChart2, History, LogOut, Maximize2, Minimize2, RefreshCw, Search, Truck } from 'lucide-react';
import Image from 'next/image';
import WeatherIntelPanel from '@/components/dispatcher/WeatherIntelPanel';
import AuditLogModal from '@/components/dispatcher/AuditLogModal';
import FontScaleButton from '@/components/dispatcher/FontScaleButton';
import { useFontSize } from '@/lib/fontScaleContext';
import NotificationBell from '@/components/notifications/NotificationBell';
import { supabase } from '@/lib/supabase-client';

import type { MapViewRef } from '@/components/dispatcher/MapView';

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
}) as any;

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
  | { type: 'SET_CLUSTERING_CONFIG'; payload: ClusteringConfig }
  | { type: 'RESET_STATE' };

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
    case 'RESET_STATE':
      return { ...initialState };
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

// Helper: calcular ETA de una ruta activa
const calcRouteETA = (
  departureTime: string,        // 'HH:MM'
  totalMinutes: number,         // tiempo total estimado de la ruta
  pending: number,              // paradas pendientes
  total: number,                // total de paradas
  deadlineTime: string          // 'HH:MM' límite del día
): { etaStr: string; isAtRisk: boolean } => {
  try {
    // Tiempo promedio por parada (mínimo 10 min)
    const avgMinPerStop = total > 0 ? Math.max(totalMinutes / total, 10) : 15;
    // Tiempo restante estimado
    const remainingMin = Math.round(pending * avgMinPerStop);

    // Hora actual en CDMX
    const nowCDMX = new Date().toLocaleTimeString('en-CA', {
      timeZone: 'America/Mexico_City', hour12: false
    });
    const [nowH, nowM] = nowCDMX.split(':').map(Number);
    const nowTotalMin = nowH * 60 + nowM;

    // ETA = ahora + tiempo restante
    const etaTotalMin = nowTotalMin + remainingMin;
    const etaH = Math.floor(etaTotalMin / 60) % 24;
    const etaM = etaTotalMin % 60;
    const etaStr = `${String(etaH).padStart(2, '0')}:${String(etaM).padStart(2, '0')}`;

    // ¿Supera el deadline?
    const [dlH, dlM] = (deadlineTime || '17:45').split(':').map(Number);
    const deadlineMin = dlH * 60 + dlM;
    const isAtRisk = etaTotalMin > deadlineMin;

    return { etaStr, isAtRisk };
  } catch {
    return { etaStr: '--:--', isAtRisk: false };
  }
};

// ─── Helper: rol badge text ────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  admin: 'ADMIN',
  logistics: 'LOGÍSTICA',
  viewer: 'SUPERVISOR',
  driver: 'CHOFER',
};

// ─── Helper: FAB config per tab ────────────────────────────
const FAB_CONFIG: Record<string, { icon: string; label: string }> = {
  config: { icon: '⚙', label: 'Crear Rutas' },
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
  const [optimizeMode, setOptimizeMode] = useState<'zones' | 'google'>('zones');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [geocodingDone, setGeocodingDone] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const { logout } = useAuth();
  const router = useRouter();

  // ── New layout states ──
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [isActiveRoutesOpen, setIsActiveRoutesOpen] = useState(false);
  const [activeRoutesData, setActiveRoutesData] = useState<any[]>([]);
  const [loadingActiveRoutes, setLoadingActiveRoutes] = useState(false);
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [aliasValue, setAliasValue] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'warn' | 'error' | 'ok' } | null>(null);

  const showToast = (msg: string, type: 'warn' | 'error' | 'ok' = 'warn') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditEntityId, setAuditEntityId] = useState<string | undefined>(undefined);

  // ── Map Search ──
  const mapViewRef = useRef<MapViewRef>(null);
  const [showMapSearch, setShowMapSearch] = useState(false);
  const [mapSearchText, setMapSearchText] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<any[]>([]);

  const openAuditForRoute = (routeId: string) => {
    setAuditEntityId(routeId);
    setIsAuditModalOpen(true);
  };
  const [fleetMode, setFleetMode] = useState<'auto' | 'manual'>('auto');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const handleViewOnMap = (route: any, onlyThis: boolean) => {
    setIsActiveRoutesOpen(false);

    if (state.routes.length > 0) {
      if (onlyThis) {
        const match = state.routes.find(r => r.driverName === route.driver_name || r.vehicleId === route.id);
        if (match) {
          setHiddenRouteIds(state.routes.filter(r => r.vehicleId !== match.vehicleId).map(r => r.vehicleId));
        }
      } else {
        setHiddenRouteIds([]);
      }
      return;
    }

    const reconstructed: Route[] = activeRoutesData
      .filter(r => r.deliveries && r.deliveries.length > 0)
      .map(r => ({
        vehicleId: r.id,
        driverName: r.driver_name || (r.route_alias || r.route_code || 'Sin chofer'),
        matricula: '',
        color: r.color || '#2196F3',
        depot: r.depot,
        endDepot: r.endDepot,
        stops: r.deliveries,
        invoices: '',
        totalDistance: r.total_km,
        polyline: r.polyline || [],
        metrics: {
          totalDistanceKm: r.total_km || 0,
          totalDurationMin: r.total_minutes || 0,
          stopCount: r.deliveries.length,
        },
      }));

    if (reconstructed.length === 0) {
      showToast('No hay rutas con direcciones geocodificadas para mostrar', 'warn');
      return;
    }

    dispatch({ 
      type: 'SET_DEPOT', 
      payload: reconstructed[0].depot ? {
        lat: reconstructed[0].depot.lat,
        lng: reconstructed[0].depot.lng,
        label: reconstructed[0].depot.name
      } : null 
    });
    dispatch({ type: 'SET_ROUTES', payload: reconstructed });
    
    if (onlyThis) {
      const match = reconstructed.find(r => r.driverName === route.driver_name || r.vehicleId === route.id);
      if (match) {
        setHiddenRouteIds(reconstructed.filter(r => r.vehicleId !== match.vehicleId).map(r => r.vehicleId));
      }
    } else {
      setHiddenRouteIds([]);
    }
    
    setActiveTab('routes');
    dispatch({ type: 'SET_STEP', payload: 'results' });
  };

  // ── Session data (client-only) ──
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [liveDeliveryStatus, setLiveDeliveryStatus] = useState<Record<string, string>>({});

  const fetchActiveRoutes = useCallback(async () => {
    setLoadingActiveRoutes(true);
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
      const res   = await fetch(`/api/routes/active?date=${today}`);
      const json  = await res.json();
      if (json.ok) setActiveRoutesData(json.routes || []);
    } catch (e) {
      console.error('Error fetching active routes:', e);
    } finally {
      setLoadingActiveRoutes(false);
    }
  }, []);

  useEffect(() => {
    // ── Realtime: escuchar cambios de estado en routes ──
    // Cuando una ruta cambia de status (ej. cerrada, aprobada),
    // recargamos el panel de rutas activas automáticamente.
    const routesChannel = supabase
      .channel('dispatcher_routes_realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'routes',
          filter: `date=eq.${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })}`,
        },
        (_payload) => {
          // Re-fetch rutas activas cuando hay cambio en alguna ruta de hoy
          fetchActiveRoutes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(routesChannel);
    };
  }, [fetchActiveRoutes]);

  const saveAlias = async (routeId: string) => {
    await fetch('/api/routes/alias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId, alias: aliasValue }),
    });
    setActiveRoutesData(prev =>
      prev.map(r => r.id === routeId ? { ...r, route_alias: aliasValue } : r)
    );
    setEditingAlias(null);
    setAliasValue('');
  };

  const alertedRiskyRoutes = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeRoutesData.length) return;

    const deadline = state.globalConfig?.deadlineTime || '17:45';

    activeRoutesData.forEach((route: any) => {
      const { total, delivered, partial, failed, pending } = route.stats || {};
      const isDone = pending === 0 && total > 0;
      if (isDone) return;

      const { isAtRisk } = calcRouteETA(
        route.departure_time,
        route.total_minutes,
        pending,
        total,
        deadline
      );

      if (isAtRisk && !alertedRiskyRoutes.current.has(route.id)) {
        alertedRiskyRoutes.current.add(route.id);
        showToast(
          `⚠ Ruta en riesgo: ${route.route_alias || route.route_code || route.driver_name} — puede no llegar antes de las ${deadline}`,
          'warn'
        );
      }
    });
  }, [activeRoutesData, state.globalConfig?.deadlineTime]);
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
    // ── Carga inicial de statuses ──
    const loadStatuses = async () => {
      try {
        const res  = await fetch('/api/deliveries/status');
        const json = await res.json();
        if (json.ok && json.statuses) setLiveDeliveryStatus(json.statuses);
      } catch (err) {
        console.error('Error loading delivery statuses:', err);
      }
    };
    loadStatuses();

    // ── Realtime: escuchar cambios en deliveries ──
    // Realtime via Supabase (reemplazó polling 30s — Jun 2026)
    const channel = supabase
      .channel('dispatcher_deliveries_realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deliveries' },
        (payload) => {
          const updated = payload.new as {
            invoice?: string;
            status?: string;
            id?: string;
          };
          if (updated.invoice && updated.status) {
            // Actualizar el status del marcador en el mapa
            setLiveDeliveryStatus(prev => ({
              ...prev,
              [updated.invoice!]: updated.status!,
            }));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Suscrito a deliveries ✓');
        }
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Error de canal, recargando statuses...');
          loadStatuses(); // fallback: recargar via REST si falla el canal
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMoreMenuOpen(false);
        setShowMapSearch(false);
      }
      if (e.key === 'F1' || (e.ctrlKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        setShowMapSearch(prev => !prev);
        if (!showMapSearch) {
          // autofocus in the render
          setTimeout(() => document.getElementById('map-search-input')?.focus(), 50);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showMapSearch]);

  useEffect(() => {
    if (!mapSearchText) {
      setMapSearchResults([]);
      return;
    }
    const txt = mapSearchText.toLowerCase();
    const results: any[] = [];
    state.routes.forEach(r => {
      r.stops.forEach(s => {
        if (s.address.name.toLowerCase().includes(txt) || s.address.clientName?.toLowerCase().includes(txt) || s.address.invoice?.toLowerCase().includes(txt) || s.address.raw.toLowerCase().includes(txt)) {
          results.push({ ...s, route: r });
        }
      });
    });
    setMapSearchResults(results);
  }, [mapSearchText, state.routes]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserName(sessionStorage.getItem('shuma_name') || '');
      setUserRole(sessionStorage.getItem('shuma_role') || '');

      // Detectar plantilla del histórico
      const templateRaw = sessionStorage.getItem('shuma_route_template');
      if (templateRaw && window.location.search.includes('from=template')) {
        try {
          const template = JSON.parse(templateRaw);
          sessionStorage.removeItem('shuma_route_template');

          showToast(
            `Plantilla cargada: ${template.routeAlias || template.routeCode || template.driverName} · ${template.deliveries?.length || 0} entregas`,
            'ok'
          );

          if (template.deliveries && template.deliveries.length > 0) {
            const templateAddresses = template.deliveries.map((d: any, idx: number) => ({
              id:       `tmpl-${idx}`,
              name:     d.name,
              raw:      d.raw,
              invoice:  d.invoice,
              lat:      d.lat ?? null,
              lng:      d.lng ?? null,
              geocoded: d.lat != null && d.lng != null,
              label:    d.raw,
            }));
            dispatch({ type: 'SET_ADDRESSES', payload: templateAddresses });
            setIsSlideOverOpen(true);
            setActiveTab('upload');
          }
        } catch (e) {
          console.warn('Error cargando plantilla:', e);
        }
      }

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

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchActiveRoutes();
      const res = await fetch('/api/deliveries/status');
      const json = await res.json();
      if (json.ok && json.statuses) {
        setLiveDeliveryStatus(json.statuses);
      }
      const lat = state.globalConfig?.departureDepot?.lat || 19.4326;
      const lng = state.globalConfig?.departureDepot?.lng || -99.1332;
      getWeatherCDMX(lat, lng).then(setWeather).catch(console.error);
    } catch (err) {
      console.error('Error refreshing all data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchActiveRoutes, state.globalConfig?.departureDepot]);

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
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }),
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
    if (state.addresses.length === 0) {
      showToast('Primero carga un archivo CSV con las direcciones');
      return;
    }
    if (state.addresses.some(a => !a.geocoded)) {
      showToast('Espera a que terminen de geocodificarse las direcciones');
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

  const handleGoogleIntelligence = useCallback(async () => {
    if (state.vehicles.length === 0) {
      showToast('Agrega al menos un chofer antes de optimizar');
      return;
    }
    if (state.addresses.length === 0) {
      showToast('Primero carga un archivo CSV con las direcciones');
      return;
    }
    if (state.addresses.some(a => !a.geocoded)) {
      showToast('Espera a que terminen de geocodificarse las direcciones');
      return;
    }

    setIsOptimizing(true);
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_STEP', payload: 'optimizing' });
    setIsSlideOverOpen(false);

    try {
      const today = new Date();
      const timeParts = (state.globalConfig?.departureTime || '08:00').split(':');
      today.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
      const departureTime = today.toISOString();

      // Asignar depósitos a los vehículos
      const assignedVehicles = state.vehicles.map(v => {
        const startDepot = state.globalConfig?.departureDepot || v.depot;
        const endDepot = state.globalConfig?.returnDepot === 'same'
          ? startDepot
          : (state.globalConfig?.returnDepot || v.depot);
        return { ...v, depot: startDepot, endDepot };
      });

      const routes = await optimizeRoutesGoogle(
        state.addresses,
        assignedVehicles,
        departureTime,
        state.globalConfig?.unloadConfig
      );

      dispatch({ type: 'SET_ROUTES', payload: routes });
      saveRoutesData(routes);
      setActiveTab('routes');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      setIsOptimizing(false);
    }
  }, [state.addresses, state.vehicles, state.globalConfig]);

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

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchActiveRoutes();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchActiveRoutes]);

  const chofresEnRuta = activeRoutesData.filter((r: any) => {
    const { pending, total } = r.stats || {};
    return pending > 0 && total > 0;
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050C1A', overflow: 'hidden' }}>
      {toast && (
        <div style={{
          position: 'absolute', top: 16, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 18px', borderRadius: 20,
          background: toast.type === 'ok'    ? 'rgba(16,185,129,0.15)'
                    : toast.type === 'error' ? 'rgba(239,68,68,0.15)'
                                             : 'rgba(245,158,11,0.15)',
          border: `1px solid ${
            toast.type === 'ok' ? 'rgba(16,185,129,0.4)'
            : toast.type === 'error' ? 'rgba(239,68,68,0.4)'
            : 'rgba(245,158,11,0.4)'}`,
          backdropFilter: 'blur(8px)',
          color: toast.type === 'ok' ? '#10B981' : toast.type === 'error' ? '#ef4444' : '#f59e0b',
          fontSize: 12, fontWeight: 600,
          fontFamily: "'Exo 2', sans-serif",
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          animation: 'fadeInDown 0.3s ease-out',
          whiteSpace: 'nowrap', maxWidth: '90vw',
          pointerEvents: 'none',
        }}>
          <span>{toast.type === 'ok' ? '✅' : toast.type === 'error' ? '🚫' : '⚠️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}


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
                          { icon: <BarChart2 size={14} />, label: 'Dashboard', href: '/dashboard' },
                          { icon: <History size={14} />, label: 'Histórico', href: '/history' },
                          { icon: <Search size={14} />, label: 'Bitácora', action: () => { setIsAuditModalOpen(true); setIsMoreMenuOpen(false); } },
                          { 
                            icon: (
                              <div className="relative">
                                <Truck size={14} />
                                {chofresEnRuta > 0 && (
                                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center pointer-events-none border border-shuma-bg">
                                    {chofresEnRuta}
                                  </span>
                                )}
                              </div>
                            ),
                            label: `Rutas Activas${chofresEnRuta > 0 ? ` (${chofresEnRuta} activos)` : ''}`,
                            action: () => { fetchActiveRoutes(); setIsActiveRoutesOpen(true); setIsMoreMenuOpen(false); } 
                          },
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
                            {item.icon}
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
              onClick={refreshAll}
              disabled={isRefreshing}
              title="Actualizar datos"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                background: 'rgba(33,150,243,0.1)',
                border: '1px solid rgba(33,150,243,0.3)',
                borderRadius: 6,
                color: '#2196F3',
                fontSize: fs(11),
                cursor: isRefreshing ? 'not-allowed' : 'pointer',
                opacity: isRefreshing ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isRefreshing) {
                  e.currentTarget.style.background = 'rgba(33,150,243,0.2)';
                  e.currentTarget.style.borderColor = '#2196F3';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRefreshing) {
                  e.currentTarget.style.background = 'rgba(33,150,243,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(33,150,243,0.3)';
                }
              }}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span className="hidden-mobile">Actualizar</span>
            </button>

            <NotificationBell 
              targetRole="admin" 
              onNavigateToRoute={(entityId) => {
                const route = activeRoutesData.find((r: any) => r.id === entityId);
                if (route) {
                  const firstStop = (route.deliveries || []).find(
                    (d: any) => d.address?.lat && d.address?.lng
                  );
                  if (firstStop && mapViewRef.current) {
                    mapViewRef.current.panToDelivery(
                      firstStop.address.lat,
                      firstStop.address.lng
                    );
                  }
                } else {
                  setAuditEntityId(entityId);
                  setIsAuditModalOpen(true);
                }
              }}
            />

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
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', height: mapHeight }}>
        {/* Map */}
        <MapView
          ref={mapViewRef}
          addresses={state.addresses}
          routes={state.routes}
          depot={state.depot}
          hiddenRouteIds={hiddenRouteIds}
          liveDeliveryStatus={liveDeliveryStatus}
        />

        {/* ── Buscador de mapa (F1 o Ctrl+F) ── */}
        {showMapSearch && (
          <div className="absolute top-4 left-4 z-40 bg-shuma-bg border border-shuma-border rounded-xl shadow-2xl p-4 w-80 font-['DM_Sans'] flex flex-col max-h-[70vh]">
            <div className="flex items-center gap-2 mb-3">
              <Search className="text-shuma-muted" size={16} />
              <input
                id="map-search-input"
                type="text"
                placeholder="Buscar cliente, factura..."
                value={mapSearchText}
                onChange={e => setMapSearchText(e.target.value)}
                className="flex-1 bg-transparent border-none focus:outline-none text-sm text-shuma-text placeholder:text-shuma-muted"
              />
              <button onClick={() => setShowMapSearch(false)} className="text-shuma-muted hover:text-white transition-colors text-xs px-2 py-1 bg-shuma-surface rounded border border-shuma-border/50">Esc</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {mapSearchText && mapSearchResults.length === 0 && (
                <div className="text-xs text-shuma-muted text-center py-4">No se encontraron paradas</div>
              )}
              {mapSearchResults.map((res, i) => (
                <div 
                  key={i}
                  className="bg-shuma-surface hover:bg-slate-800 border border-shuma-border rounded-lg p-3 cursor-pointer transition-colors"
                  onClick={() => {
                    if (res.address.lat && res.address.lng) {
                      mapViewRef.current?.panToDelivery(res.address.lat, res.address.lng);
                      setShowMapSearch(false);
                      setMapSearchText('');
                    }
                  }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-xs font-bold text-white line-clamp-1">{res.address.clientName || res.address.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: res.route.color + '20', color: res.route.color }}>
                      Parada {res.sequence}
                    </span>
                  </div>
                  {res.address.invoice && <p className="text-[11px] text-blue-400 font-medium">Factura: {res.address.invoice}</p>}
                  <p className="text-[10px] text-shuma-muted line-clamp-2 mt-1">{res.address.raw}</p>
                  <p className="text-[10px] text-shuma-muted font-bold mt-1.5">Ruta: {res.route.driverName}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Weather widget (bottom-left) ── */}
        {weather && (
          <div style={{ position: 'absolute', bottom: 70, left: 12, zIndex: 10 }}>
            <WeatherBanner weather={weather} />
          </div>
        )}

        {/* ── Bienvenida premium (sin trazo, capas de profundidad) ── */}
        {state.step === 'config' && state.addresses.length === 0 && !isSlideOverOpen && !welcomeDismissed && (
          <>
            <style>{`
              @keyframes orb-breathe-v3 {
                0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
                50%      { opacity: 1;   transform: translate(-50%, -50%) scale(1.08); }
              }
              @keyframes fade-card-v3 {
                from { opacity: 0; transform: translate(-50%,-46%); }
                to   { opacity: 1; transform: translate(-50%,-50%); }
              }
              @keyframes ring-rotate-v3 {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
              }
              @keyframes pulse-out-v3 {
                0%   { transform: scale(0.78); opacity: 0; }
                40%  { opacity: 0.7; }
                100% { transform: scale(1.5); opacity: 0; }
              }
              @keyframes sheen-sweep-v3 {
                0%   { left: -60%; }
                50%  { left: 130%; }
                100% { left: 130%; }
              }
              @keyframes arrow-nudge-v3 {
                0%, 100% { transform: translateX(0); }
                50%      { transform: translateX(4px); }
              }
            `}</style>

            {/* Capa de fondo: glow orb detrás de la card */}
            <div style={{
              position: 'absolute', width: 420, height: 420,
              left: '50%', top: '48%', transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(33,150,243,0.16) 0%, transparent 65%)',
              pointerEvents: 'none',
              animation: 'orb-breathe-v3 5s ease-in-out infinite',
              zIndex: 9,
            }} />

            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
              animation: 'fade-card-v3 0.4s ease-out',
            }}>
              <div style={{
                position: 'relative',
                width: 304,
                background: 'linear-gradient(165deg, rgba(22,40,74,0.94) 0%, rgba(13,25,48,0.96) 100%)',
                border: '0.5px solid rgba(86,140,220,0.28)',
                borderRadius: 20,
                padding: '30px 28px 26px',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 32px 90px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(0,0,0,0.3)',
                textAlign: 'center',
              }}>
                {/* Sheen superior */}
                <div style={{
                  position: 'absolute', top: 0, left: '14%', right: '14%', height: 1,
                  background: 'linear-gradient(90deg, transparent, rgba(120,180,255,0.5), transparent)',
                }} />

                {/* Botón X */}
                <button
                  onClick={() => setWelcomeDismissed(true)}
                  style={{
                    position: 'absolute', top: 14, right: 14,
                    width: 24, height: 24,
                    background: 'rgba(120,160,210,0.1)',
                    border: '0.5px solid rgba(120,160,210,0.22)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#6E8AAE', fontSize: 10, lineHeight: 1,
                    padding: 0, transition: 'all 0.18s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#E8EFF8'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#6E8AAE'; }}
                >✕</button>

                {/* Stack de ícono con anillo orbital + pulso radar */}
                <div style={{ position: 'relative', width: 64, height: 64, margin: '2px auto 18px' }}>
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '1px solid rgba(91,168,255,0.35)',
                    animation: 'pulse-out-v3 2.6s cubic-bezier(0.4,0,0.2,1) infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '0.5px solid rgba(33,150,243,0.18)',
                    animation: 'ring-rotate-v3 12s linear infinite',
                  }}>
                    <div style={{
                      position: 'absolute', top: -1.5, left: '50%', width: 4, height: 4,
                      marginLeft: -2, background: '#5BA8FF', borderRadius: '50%',
                      boxShadow: '0 0 8px 2px rgba(91,168,255,0.7)',
                    }} />
                  </div>
                  <div style={{
                    position: 'absolute', inset: 8, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 30%, rgba(70,140,230,0.45), rgba(20,45,90,0.55) 70%)',
                    border: '0.5px solid rgba(120,180,255,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 24px rgba(33,100,200,0.35), 0 0 0 1px rgba(255,255,255,0.04) inset',
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BFDBFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                      <circle cx="12" cy="9" r="2.5"/>
                    </svg>
                  </div>
                </div>

                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.16em',
                  color: '#4A7FC4', textTransform: 'uppercase', margin: '0 0 8px',
                  fontFamily: "'DM Sans', sans-serif" }}>
                  Grupo Shuma
                </p>

                <p style={{ fontSize: 19, fontWeight: 700, color: '#F2F6FC',
                  margin: '0 0 8px', letterSpacing: '-0.01em',
                  fontFamily: "'Exo 2', sans-serif" }}>
                  Bienvenido a Shuma Rutas
                </p>

                <p style={{ fontSize: 12.5, color: '#7C9AC2', lineHeight: 1.6,
                  margin: '0 0 24px', padding: '0 6px',
                  fontFamily: "'DM Sans', sans-serif" }}>
                  Optimiza las rutas de entrega de tu flota en minutos, con seguimiento en tiempo real.
                </p>

                <div style={{
                  height: 1, margin: '0 0 22px',
                  background: 'linear-gradient(90deg, transparent, rgba(91,168,255,0.18), transparent)',
                }} />

                {/* CTA con sheen animado */}
                <button
                  onClick={() => setIsSlideOverOpen(true)}
                  style={{
                    position: 'relative', width: '100%', padding: '14px 20px',
                    background: 'linear-gradient(135deg, #1976D2 0%, #2196F3 50%, #42A5F5 100%)',
                    border: 'none', borderRadius: 13,
                    color: 'white', fontFamily: "'Exo 2', sans-serif",
                    fontSize: 13.5, fontWeight: 700, letterSpacing: '0.03em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                    cursor: 'pointer', overflow: 'hidden',
                    boxShadow: '0 8px 28px rgba(33,150,243,0.4), 0 1px 0 rgba(255,255,255,0.25) inset',
                    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 36px rgba(33,150,243,0.55), 0 1px 0 rgba(255,255,255,0.3) inset';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 8px 28px rgba(33,150,243,0.4), 0 1px 0 rgba(255,255,255,0.25) inset';
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 0, left: '-60%', width: '40%', height: '100%',
                    background: 'linear-gradient(120deg, transparent, rgba(255,255,255,0.35), transparent)',
                    transform: 'skewX(-20deg)',
                    animation: 'sheen-sweep-v3 3.2s ease-in-out infinite',
                    pointerEvents: 'none',
                  }} />
                  <span style={{ fontSize: 15 }}>⚙</span>
                  Crear rutas
                  <span style={{ display: 'inline-flex', animation: 'arrow-nudge-v3 1.5s ease-in-out infinite' }}>→</span>
                </button>

                {/* Meta-row con datos reales del sistema */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 16 }}>
                  <div style={{ fontSize: 10, color: '#4A6B95', display: 'flex', alignItems: 'center', gap: 5,
                    fontFamily: "'DM Sans', sans-serif" }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%', background: '#2EBD6B',
                      boxShadow: '0 0 6px 1px rgba(46,189,107,0.6)',
                    }} />
                    {state.vehicles?.length || 3} choferes activos
                  </div>
                  <div style={{ fontSize: 10, color: '#4A6B95', fontFamily: "'DM Sans', sans-serif" }}>
                    2 bodegas
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Overlay: progreso de geocoding ── */}
        {state.step === 'geocoding' && (() => {
          const total  = state.addresses.length;
          const done   = state.addresses.filter(a => a.geocoded).length;
          const pct    = total > 0 ? Math.round((done / total) * 100) : 0;
          const errors = state.addresses.filter(a => a.geocoded && a.geocodeError).length;
          const lastAddr = [...state.addresses].filter(a => a.geocoded).at(-1)?.raw || '';
          const isComplete = pct === 100;

          // posición del camión: 0% → 8% de la pista, 100% → 78% (para que el camión "frene")
          const truckPos = isComplete ? 78 : 8 + (pct / 100) * 70;

          return (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(5,12,28,0.75)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                background: 'linear-gradient(160deg, #0D1E38 0%, #0A1628 100%)',
                border: '1px solid rgba(33,150,243,0.25)',
                borderRadius: 20,
                padding: '28px 32px',
                width: 340,
                backdropFilter: 'blur(20px)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(33,150,243,0.05)',
                overflow: 'hidden',
                position: 'relative',
              }}>

                {/* Título */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: '#5B7BA0', fontFamily: "'Exo 2', sans-serif", marginBottom: 4 }}>
                    {isComplete ? '✓ Geocodificación completa' : 'Geocodificando direcciones'}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#E8EFF8',
                    fontFamily: "'Exo 2', sans-serif" }}>
                    {pct}<span style={{ fontSize: 14, color: '#5B7BA0' }}>%</span>
                  </div>
                </div>

                {/* Pista de camión */}
                <div style={{ position: 'relative', height: 64, marginBottom: 16 }}>
                  {/* Carretera */}
                  <div style={{
                    position: 'absolute', bottom: 16, left: 0, right: 0,
                    height: 6, borderRadius: 3,
                    background: 'rgba(33,150,243,0.08)',
                    border: '1px solid rgba(33,150,243,0.12)',
                  }} />
                  {/* Línea central punteada */}
                  <div style={{
                    position: 'absolute', bottom: 18, left: 0, right: 0, height: 2,
                    backgroundImage: 'repeating-linear-gradient(90deg, rgba(33,150,243,0.3) 0px, rgba(33,150,243,0.3) 12px, transparent 12px, transparent 22px)',
                  }} />
                  {/* Progreso de carretera */}
                  <div style={{
                    position: 'absolute', bottom: 16, left: 0,
                    width: `${pct}%`, height: 6, borderRadius: 3,
                    background: 'linear-gradient(90deg, #1565C0, #2196F3, #42A5F5)',
                    transition: 'width 0.35s ease-out',
                    boxShadow: '0 0 8px rgba(33,150,243,0.4)',
                  }} />

                  {/* CAMIÓN SVG */}
                  <div style={{
                    position: 'absolute', bottom: 20,
                    left: `${truckPos}%`,
                    transition: isComplete ? 'left 0.8s cubic-bezier(0.22,1,0.36,1)' : 'left 0.35s ease-out',
                    transform: 'translateX(-50%)',
                  }}>
                    <svg width="52" height="32" viewBox="0 0 52 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* Cabina */}
                      <rect x="30" y="6" width="18" height="18" rx="3" fill="#1565C0" />
                      {/* Ventana cabina */}
                      <rect x="35" y="9" width="10" height="7" rx="1.5" fill="#90CAF9" opacity="0.8" />
                      {/* Cuerpo */}
                      <rect x="4" y="4" width="28" height="20" rx="3" fill="#1976D2" />
                      {/* Franja */}
                      <rect x="4" y="16" width="28" height="3" fill="#2196F3" opacity="0.5" />
                      {/* Logo Shuma minimalista */}
                      <rect x="10" y="8" width="16" height="8" rx="1" fill="rgba(33,150,243,0.2)" />
                      <text x="18" y="15" textAnchor="middle" fill="#90CAF9"
                        style={{ fontSize: '5px', fontFamily: "'Exo 2', sans-serif", fontWeight: 700 }}>
                        SHUMA
                      </text>
                      {/* Ruedas */}
                      <circle cx="13" cy="26" r="5" fill="#0D1E38" stroke="#2196F3" strokeWidth="1.5" />
                      <circle cx="13" cy="26" r="2.5" fill="#1565C0" />
                      <circle cx="39" cy="26" r="5" fill="#0D1E38" stroke="#2196F3" strokeWidth="1.5" />
                      <circle cx="39" cy="26" r="2.5" fill="#1565C0" />
                      {/* Parachoque */}
                      <rect x="46" y="17" width="5" height="6" rx="1" fill="#0D1E38" stroke="#2196F3" strokeWidth="1" />
                      {/* Humo / velocidad si no es complete */}
                      {!isComplete && (
                        <>
                          <circle cx="1" cy="10" r="3" fill="rgba(91,123,160,0.3)" />
                          <circle cx="5" cy="8" r="2" fill="rgba(91,123,160,0.2)" />
                        </>
                      )}
                    </svg>

                    {/* PAQUETE: solo aparece al 100% con bounce */}
                    {isComplete && (
                      <div style={{
                        position: 'absolute', top: -28, left: '50%',
                        transform: 'translateX(-50%)',
                        animation: 'pkgBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards',
                      }}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <rect x="2" y="5" width="16" height="13" rx="2" fill="#F59E0B" />
                          <path d="M2 9h16" stroke="#B45309" strokeWidth="1" />
                          <path d="M10 5v14" stroke="#B45309" strokeWidth="1" />
                          <rect x="5" y="5" width="10" height="4" rx="1" fill="#FCD34D" opacity="0.6" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dirección actual */}
                {lastAddr && !isComplete && (
                  <div style={{
                    fontSize: 10.5, color: '#5B7BA0', marginBottom: 10,
                    fontFamily: "'DM Sans', sans-serif",
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    textAlign: 'center',
                  }}>
                    {lastAddr}
                  </div>
                )}

                {/* Contador done/total */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  fontSize: 11, color: '#5B7BA0', marginBottom: 6,
                  fontFamily: "'DM Sans', sans-serif" }}>
                  <span>{done} de {total} direcciones</span>
                  {errors > 0 && (
                    <span style={{ color: '#F59E0B' }}>⚠ {errors} sin match</span>
                  )}
                </div>

                {/* Barra de progreso */}
                <div style={{ width: '100%', height: 5, borderRadius: 99,
                  background: 'rgba(33,150,243,0.08)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: isComplete
                      ? 'linear-gradient(90deg, #16a34a, #22c55e)'
                      : 'linear-gradient(90deg, #1565C0, #2196F3, #42A5F5)',
                    borderRadius: 99,
                    transition: 'width 0.35s ease-out, background 0.5s ease',
                    boxShadow: isComplete ? '0 0 6px rgba(34,197,94,0.4)' : '0 0 6px rgba(33,150,243,0.3)',
                  }} />
                </div>
              </div>

              {/* Keyframes para el paquete */}
              <style>{`
                @keyframes pkgBounce {
                  0%   { transform: translateX(-50%) translateY(-20px); opacity: 0; }
                  60%  { transform: translateX(-50%) translateY(4px); opacity: 1; }
                  80%  { transform: translateX(-50%) translateY(-4px); }
                  100% { transform: translateX(-50%) translateY(0px); opacity: 1; }
                }
              `}</style>
            </div>
          );
        })()}

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
              padding: state.addresses.length === 0 && !welcomeDismissed ? '14px 22px' : '10px 16px',
              background: state.addresses.length === 0 && !welcomeDismissed
                ? 'linear-gradient(135deg, #0047AB, #1565C0)'
                : '#0047AB',
              border: state.addresses.length === 0 && !welcomeDismissed
                ? '2px solid rgba(33,150,243,0.6)'
                : 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: state.addresses.length === 0 && !welcomeDismissed ? 14 : 12,
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
            Crear Rutas
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
              {state.addresses.length > 0 && state.vehicles.length > 0 ? (
                <div className="mt-3 space-y-2 ml-auto w-full max-w-sm">
                  <p className="text-xs text-shuma-muted font-semibold uppercase tracking-wider">
                    Modo de optimización
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setOptimizeMode('zones')}
                      className={`p-3 rounded-xl border text-xs font-semibold text-left transition-all ${
                        optimizeMode === 'zones'
                          ? 'bg-blue-500/15 border-blue-500/50 text-blue-400'
                          : 'bg-shuma-surface border-shuma-border text-shuma-muted hover:border-blue-500/30'
                      }`}
                    >
                      <div className="text-base mb-1">🗺️</div>
                      <div>Zonas manuales</div>
                      <div className="text-[10px] opacity-70 mt-0.5 font-normal">
                        Tú defines las zonas, Google ordena
                      </div>
                    </button>
                    <button
                      onClick={() => setOptimizeMode('google')}
                      className={`p-3 rounded-xl border text-xs font-semibold text-left transition-all ${
                        optimizeMode === 'google'
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                          : 'bg-shuma-surface border-shuma-border text-shuma-muted hover:border-amber-500/30'
                      }`}
                    >
                      <div className="text-base mb-1">⚡</div>
                      <div>Google Intelligence</div>
                      <div className="text-[10px] opacity-70 mt-0.5 font-normal">
                        Google distribuye y ordena todo
                      </div>
                    </button>
                  </div>

                  {optimizeMode === 'google' ? (
                    <button
                      onClick={handleGoogleIntelligence}
                      disabled={isOptimizing}
                      className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {isOptimizing ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Calculando rutas...
                        </>
                      ) : (
                        <>⚡ Optimizar con Google Intelligence</>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        dispatch({ type: 'SET_STEP', payload: 'zones' });
                        setActiveTab('zones');
                      }}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors"
                    >
                      Continuar a Zonas →
                    </button>
                  )}
                </div>
              ) : (
                <button
                  className="so-btn-primary ml-auto"
                  disabled={true}
                >
                  Continuar a Zonas →
                </button>
              )}
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
                  if (s === 'zones' && state.vehicles.length === 0) {
                    showToast('Agrega al menos un chofer antes de continuar');
                    return;
                  }
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
            onReset={() => {
              if (confirm('¿Estás seguro de reiniciar toda la configuración y vaciar los datos actuales?')) {
                sessionStorage.removeItem('shuma_rutas_session');
                dispatch({ type: 'RESET_STATE' });
              }
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
                  const regenerated = clusterDeliveries(state.addresses, state.vehicles, state.clusteringConfig, numClusters);
                  dispatch({ type: 'SET_CLUSTERS', payload: regenerated });
                }}
              />
            </div>
            <div className="bg-slate-700/50 p-3 rounded-xl border border-shuma-border space-y-3">
              {/* Header: zonas actuales + botón agregar */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Zonas ({numClusters})
                  </h3>
                  <p className="text-xs text-shuma-muted">
                    {state.vehicles.length} camión{state.vehicles.length !== 1 ? 'es' : ''}
                    {' · '}{numClusters} zona{numClusters !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => setShowInlineVehicleForm(!showInlineVehicleForm)}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-600 hover:bg-slate-500 rounded-lg text-white"
                >
                  {showInlineVehicleForm ? 'Cancelar' : '+ Agregar camión'}
                </button>
              </div>

              {/* Slider de rutas a generar */}
              {state.vehicles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-shuma-muted uppercase tracking-wider">
                      Rutas a generar
                    </label>
                    <span className="text-xs font-bold text-shuma-accent bg-blue-500/10
                      border border-blue-500/20 rounded-full px-2.5 py-0.5">
                      {numClusters}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(state.vehicles.length * 2, state.addresses.length > 0
                      ? Math.min(state.addresses.length, state.vehicles.length * 3)
                      : state.vehicles.length * 2)}
                    value={numClusters}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setNumClusters(n);
                      const regenerated = clusterDeliveries(
                        state.addresses, state.vehicles, state.clusteringConfig, n
                      );
                      dispatch({ type: 'SET_CLUSTERS', payload: regenerated });
                    }}
                    className="w-full accent-blue-500"
                    style={{ accentColor: '#2196F3' }}
                  />
                  <div className="flex justify-between text-[10px] text-shuma-muted mt-1">
                    <span>1</span>
                    <span className="text-[10px] text-shuma-muted font-normal">
                      Arrastra para reagrupar automáticamente
                    </span>
                    <span>{Math.max(state.vehicles.length * 2, state.addresses.length > 0
                      ? Math.min(state.addresses.length, state.vehicles.length * 3)
                      : state.vehicles.length * 2)}</span>
                  </div>
                </div>
              )}
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
              onUpdateDriverVehicle={(vehicleId, newDriverName, newMatricula) => {
                // Actualizar en state.vehicles
                dispatch({
                  type: 'UPDATE_VEHICLE',
                  payload: {
                    id: vehicleId,
                    changes: { driverName: newDriverName, matricula: newMatricula }
                  }
                });
                // Actualizar en state.routes
                dispatch({
                  type: 'SET_ROUTES',
                  payload: state.routes.map(r =>
                    r.vehicleId === vehicleId
                      ? { ...r, driverName: newDriverName, matricula: newMatricula }
                      : r
                  )
                });
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



      {/* ── Modal: Rutas Activas ── */}
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
              style={{ maxHeight: 'min(85vh, 640px)' }}
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchActiveRoutes}
                    className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-colors"
                  >
                    ↻ Actualizar
                  </button>
                  <button
                    onClick={() => setIsActiveRoutesOpen(false)}
                    className="p-2 hover:bg-shuma-surface rounded-lg transition-colors text-shuma-muted hover:text-shuma-text"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingActiveRoutes ? (
                  <div className="flex items-center justify-center h-40">
                    <p className="text-shuma-muted text-sm">Cargando rutas...</p>
                  </div>
                ) : activeRoutesData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2">
                    <p className="text-shuma-muted text-sm">No hay rutas para hoy</p>
                    <p className="text-xs text-shuma-muted opacity-50">Acepta una ruta para verla aquí</p>
                  </div>
                ) : (
                  activeRoutesData.map(route => {
                    const { total, delivered, partial, failed, pending } = route.stats;
                    const processed = delivered + partial + failed;
                    const pct       = total > 0 ? Math.round((processed / total) * 100) : 0;
                    const isDone    = pending === 0 && total > 0;
                    const hasFails  = failed > 0 || partial > 0;

                    const deadline = state.globalConfig?.deadlineTime || '17:45';
                    const { etaStr, isAtRisk } = !isDone
                      ? calcRouteETA(route.departure_time, route.total_minutes, pending, route.stats.total, deadline)
                      : { etaStr: '', isAtRisk: false };

                    return (
                      <div key={route.id}
                        className="p-4 rounded-xl border border-shuma-border bg-shuma-surface/30 space-y-3">

                        {/* Cabecera de ruta */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: route.color }} />
                            <div className="min-w-0">
                              {/* Alias editable */}
                              {editingAlias === route.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    value={aliasValue}
                                    onChange={e => setAliasValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveAlias(route.id); if (e.key === 'Escape') setEditingAlias(null); }}
                                    placeholder="Nombre corto de ruta..."
                                    autoFocus
                                    className="bg-shuma-surface border border-blue-500/50 rounded-lg px-2 py-1 text-sm text-shuma-text outline-none w-40"
                                  />
                                  <button onClick={() => saveAlias(route.id)}
                                    className="text-xs text-blue-400 font-semibold hover:text-blue-300">
                                    ✓
                                  </button>
                                  <button onClick={() => setEditingAlias(null)}
                                    className="text-xs text-shuma-muted hover:text-shuma-text">
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <h3 className="font-semibold text-sm text-shuma-text truncate">
                                    {route.route_alias || route.route_code || 'Sin nombre'}
                                  </h3>
                                  <button
                                    onClick={() => { setEditingAlias(route.id); setAliasValue(route.route_alias || ''); }}
                                    className="text-shuma-muted hover:text-blue-400 transition-colors shrink-0"
                                    title="Editar nombre corto"
                                  >
                                    <span style={{ fontSize: 11 }}>✏️</span>
                                  </button>
                                </div>
                              )}
                              <p className="text-xs text-shuma-muted mt-0.5">
                                <button
                                  onClick={() => {
                                    const firstStop = (route.deliveries || []).find(
                                      (d: any) => d.address?.lat && d.address?.lng
                                    );
                                    if (firstStop?.address?.lat && mapViewRef.current) {
                                      setIsActiveRoutesOpen(false);
                                      setTimeout(() => {
                                        mapViewRef.current?.panToDelivery(
                                          firstStop.address.lat,
                                          firstStop.address.lng
                                        );
                                      }, 200);
                                    }
                                  }}
                                  className="text-blue-400 hover:text-blue-300 hover:underline transition-colors cursor-pointer bg-transparent border-none p-0 font-inherit text-inherit"
                                  title="Ir a la ruta en el mapa"
                                >
                                  {route.driver_name || 'Sin chofer asignado'}
                                </button>
                                {route.route_code && route.route_alias && (
                                  <span className="ml-1.5 opacity-40">· {route.route_code}</span>
                                )}
                                {route.total_km > 0 && ` · ${route.total_km.toFixed(1)} km`}
                                {!isDone && etaStr && etaStr !== '--:--' && (
                                  <span className="ml-1.5">· ETA <span className={isAtRisk ? 'text-red-400 font-semibold' : 'text-shuma-text'}>{etaStr}</span></span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Badge de status y riesgo */}
                          <div className="flex flex-col items-end gap-1">
                            <button
                              onClick={() => hasFails ? openAuditForRoute(route.id) : undefined}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 border ${
                                isDone && !hasFails
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 cursor-default'
                                  : isDone && hasFails
                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25 cursor-pointer transition-colors'
                                    : hasFails
                                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25 cursor-pointer transition-colors'
                                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30 cursor-default'
                              }`}
                            >
                              {isDone && !hasFails ? '✓ Completada'
                                : isDone ? '⚠ Con incidencias'
                                : pending > 0 ? `● ${pending} pendientes`
                                : '● En curso'}
                            </button>
                            {isAtRisk && !isDone && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse shrink-0">
                                ⚠ En riesgo
                              </span>
                            )}
                          </div>
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
                              style={{ width: `${pct}%`, backgroundColor: route.color }} />
                          </div>
                        </div>

                        {/* Acción: ver en mapa */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewOnMap(route, true)}
                            className="flex-1 text-xs text-blue-400 hover:text-blue-300 py-1.5 rounded-lg hover:bg-blue-500/5 transition-colors text-center border border-transparent hover:border-blue-500/20"
                          >
                            Ver esta ruta
                          </button>
                          <button
                            onClick={() => handleViewOnMap(route, false)}
                            className="flex-1 text-xs text-blue-400 hover:text-blue-300 py-1.5 rounded-lg hover:bg-blue-500/5 transition-colors text-center border border-transparent hover:border-blue-500/20"
                          >
                            Ver todas
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-shuma-border text-xs text-shuma-muted shrink-0 flex justify-between">
                <span>{activeRoutesData.length} ruta(s) hoy</span>
                <span className="opacity-50">✏️ Click en el ícono para editar nombre</span>
              </div>
            </div>
          </div>
        </>
      )}

      <AuditLogModal 
        isOpen={isAuditModalOpen}
        onClose={() => {
          setIsAuditModalOpen(false);
          setAuditEntityId(undefined);
        }}
        userRole={userRole}
        initialEntityId={auditEntityId}
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
  onSave,
  onReset
}: { 
  currentConfig: any, 
  vehicles: Vehicle[],
  onAddVehicle: (v: Vehicle) => void,
  onRemoveVehicle: (id: string) => void,
  onSave: (conf: any) => void,
  onReset: () => void 
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

      <div className="pt-4 border-t border-shuma-border mt-6">
        <button
          onClick={onReset}
          className="w-full py-2.5 rounded-xl border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 font-semibold text-sm transition-colors"
        >
          🗑️ Reiniciar Configuración
        </button>
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
