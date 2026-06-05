// ─────────────────────────────────────────────
//  Entidades de dominio
// ─────────────────────────────────────────────

export type DeliveryStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/** Dirección geocodificada */
export interface Address {
  id: string;
  /** Texto original del CSV */
  raw: string;
  /** Nombre del destinatario o cliente */
  name: string;
  clientName?: string;
  invoice?: string;
  /** Coordenadas geocodificadas */
  lat: number | null;
  lng: number | null;
  /** Etiqueta devuelta por Nominatim */
  label: string;
  /** Estado de geocodificación */
  geocoded: boolean;
  geocodeError?: string;
}

export interface Depot {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Driver {
  id: string;
  name: string;
  matricula: string;
  defaultType?: 'Camión grande' | 'Camión chico' | 'Camioneta';
}

export interface Cluster {
  id: string;
  name: string;
  centroid: { lat: number; lng: number };
  addresses: Address[];
  depot: Depot;
  color: string;
}

/** Vehículo / Chofer */
export interface Vehicle {
  id: string;
  driverName: string;
  matricula: string;
  vehicleId: string;
  type: 'Camión grande' | 'Camión chico' | 'Camioneta';
  capacity: number;
  color: string;
  zoneName?: string;
  /** Bodega de salida */
  depot: Depot;
  /** Bodega de regreso (si difiere de la de salida) */
  endDepot?: Depot;
  /** Facturas/notas del despachador */
  invoices: string;
  /** Hora de salida individual para este vehículo (ISO string) */
  departureTime?: string;
}

export interface ClusteringConfig {
  balanceWeight: number; // 0.0 to 1.0
  vehicleCapacities: {
    vehicleId: string;
    maxStops: number;
  }[];
}

/** Parada individual en una ruta optimizada */
export interface Stop {
  sequence: number;
  address: Address;
  status: DeliveryStatus;
  /** ETA estimado en segundos desde el depósito */
  eta?: number;
  /** Distancia acumulada en metros */
  distance?: number;
}

/** Ruta completa asignada a un chofer */
export interface Route {
  vehicleId: string;
  driverName: string;
  matricula: string;
  color: string;
  depot: Depot;
  endDepot: Depot;
  stops: Stop[];
  invoices: string;
  /** Hora de salida individual para este vehículo (ISO string) */
  departureTime?: string;
  polyline?: [number, number][];
  /** Rutas alternativas devueltas por HERE (hasta 2) */
  alternatives?: [number, number][][];
  totalDistance?: number;
  totalDuration?: number;
  zoneName?: string;
}

/** Estado compartido despachador → chofer */
export interface SharedRouteState {
  routes: Route[];
  depot: { lat: number; lng: number; label: string } | null;
  optimizedAt: string; // ISO timestamp
}

// ─────────────────────────────────────────────
//  Nominatim
// ─────────────────────────────────────────────

export interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  importance: number;
}

// ─────────────────────────────────────────────
//  OSRM
// ─────────────────────────────────────────────

export interface OSRMRouteResult {
  polyline: [number, number][];  // [lat, lng][]
  distanceMeters: number;
  durationSeconds: number;
}

// ─────────────────────────────────────────────
//  Vroom
// ─────────────────────────────────────────────

export interface VroomCoordinate {
  lat: number;
  lon: number;
}

export interface VroomJob {
  id: number;
  /** Descripción opcional */
  description?: string;
  location: [number, number]; // [lon, lat]
  service?: number;  // segundos de servicio
  amount?: number[];
}

export interface VroomVehicle {
  id: number;
  profile: 'car' | 'bike' | 'foot';
  start: [number, number]; // [lon, lat]
  end?: [number, number];
  capacity?: number[];
  description?: string;
}

export interface VroomStep {
  type: 'start' | 'job' | 'end';
  job?: number;
  location: [number, number];
  arrival: number;
  duration: number;
  distance: number;
}

export interface VroomRouteResult {
  vehicle: number;
  steps: VroomStep[];
  cost: number;
  duration: number;
  distance: number;
}

export interface VroomResponse {
  code: number;
  summary: {
    cost: number;
    routes: number;
    unassigned: number;
    duration: number;
    distance: number;
  };
  routes: VroomRouteResult[];
  unassigned: VroomJob[];
}

export interface VroomPayload {
  jobs: VroomJob[];
  vehicles: VroomVehicle[];
  options?: {
    g?: boolean; // geometry
  };
}

// ─────────────────────────────────────────────
//  UI / Estado de la app
// ─────────────────────────────────────────────

export type AppStep =
  | 'config'       // Paso 1: configuración global y flota
  | 'upload'       // Paso 2: cargar CSV
  | 'geocoding'    // Paso 2 (transición): geocodificando direcciones
  | 'zones'        // Paso 3: validación de zonas/clusters
  | 'optimizing'   // Paso 3 (transición): calculando rutas
  | 'results';     // Paso 4 y 5: mostrando rutas y compartir

export interface GlobalConfig {
  departureDepot: Depot;
  returnDepot: Depot | 'same';
  departureTime: string; // HH:MM
}

export interface AppState {
  step: AppStep;
  globalConfig: GlobalConfig | null;
  clusteringConfig: ClusteringConfig;
  addresses: Address[];
  clusters: Cluster[];
  vehicles: Vehicle[];
  routes: Route[];
  depot: { lat: number; lng: number; label: string } | null;
  error: string | null;
}
