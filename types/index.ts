// ─────────────────────────────────────────────
//  Entidades de dominio
// ─────────────────────────────────────────────

export type DeliveryStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/** Dirección geocodificada */
export interface Address {
  id: string;
  /** Texto original del CSV */
  raw: string;
  /** Nombre del destinatario */
  name: string;
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
}

/** Vehículo / Chofer */
export interface Vehicle {
  id: string;
  driverName: string;
  matricula: string;
  vehicleId: string;
  capacity: number;
  color: string;
  /** Bodega de salida */
  depot: Depot;
  /** Bodega de regreso (si difiere de la de salida) */
  endDepot: Depot;
  invoices: string;
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
  polyline?: [number, number][];
  /** Rutas alternativas devueltas por HERE (hasta 2) */
  alternatives?: [number, number][][];
  totalDistance?: number;
  totalDuration?: number;
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
  | 'upload'       // Paso 1: cargar CSV
  | 'geocoding'    // Paso 2: geocodificando direcciones
  | 'vehicles'     // Paso 3: agregar choferes
  | 'optimizing'   // Paso 4: calculando rutas
  | 'results';     // Paso 5: mostrando resultados

export interface AppState {
  step: AppStep;
  addresses: Address[];
  vehicles: Vehicle[];
  routes: Route[];
  depot: { lat: number; lng: number; label: string } | null;
  error: string | null;
}
