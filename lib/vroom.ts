import type {
  Address,
  Vehicle,
  Route,
  Stop,
  VroomPayload,
  VroomResponse,
  VroomJob,
  VroomVehicle,
} from '@/types';
import { getRouteHERE } from './here';

const VROOM_BASE = 'http://localhost:3000';

/** Colores predeterminados para los choferes (hasta 10) */
const DRIVER_COLORS = [
  '#3B82F6', // azul
  '#F59E0B', // ámbar
  '#10B981', // esmeralda
  '#EF4444', // rojo
  '#8B5CF6', // violeta
  '#06B6D4', // cian
  '#F97316', // naranja
  '#EC4899', // rosa
  '#84CC16', // lima
  '#6366F1', // índigo
];

/**
 * Construye el payload para Vroom a partir de las entidades de la app.
 * El depósito (depot) es el punto de inicio/fin de todos los vehículos.
 */
export function buildVroomPayload(
  addresses: Address[],
  vehicles: Vehicle[],
  depot: { lat: number; lng: number }
): VroomPayload {
  const validAddresses = addresses.filter((a) => a.lat !== null && a.lng !== null);

  const jobs: VroomJob[] = validAddresses.map((addr, idx) => ({
    id: idx + 1,
    description: addr.name,
    location: [addr.lng!, addr.lat!], // Vroom usa [lon, lat]
    service: 120, // 2 minutos por entrega
    // Sin 'amount' para no limitar por capacidad
  }));

  const vroomVehicles: VroomVehicle[] = vehicles.map((v, idx) => {
    const endDep = v.endDepot ?? v.depot;
    return {
      id: idx + 1,
      profile: 'car',
      start: [v.depot.lng, v.depot.lat],
      end: [endDep.lng, endDep.lat],
      // Sin 'capacity' para que Vroom acepte todos los jobs sin restricción
      description: v.driverName,
    };
  });

  return {
    jobs,
    vehicles: vroomVehicles,
    options: { g: false }, // geometría manejada por OSRM separadamente
  };
}

/**
 * Llama al optimizador Vroom y retorna la respuesta cruda.
 */
export async function callVroom(payload: VroomPayload): Promise<VroomResponse> {
  const res = await fetch(VROOM_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vroom error ${res.status}: ${text}`);
  }

  const data: VroomResponse = await res.json();

  if (data.code !== 0) {
    throw new Error(`Vroom retornó código de error: ${data.code}`);
  }

  return data;
}

/**
 * Función principal de optimización.
 * Toma las direcciones y vehículos, llama a Vroom y luego
 * obtiene la geometría de OSRM para cada ruta.
 */
export async function optimizeRoutes(
  addresses: Address[],
  vehicles: Vehicle[],
  depot: { lat: number; lng: number }
): Promise<Route[]> {
  const validAddresses = addresses.filter((a) => a.lat !== null && a.lng !== null);

  if (validAddresses.length === 0) {
    throw new Error('No hay direcciones geocodificadas para optimizar.');
  }
  if (vehicles.length === 0) {
    throw new Error('No hay vehículos/choferes registrados.');
  }

  const payload = buildVroomPayload(validAddresses, vehicles, depot);
  const vroomResult = await callVroom(payload);

  const routes: Route[] = [];

  for (const vroomRoute of vroomResult.routes) {
    const vehicleIndex = vroomRoute.vehicle - 1;
    const vehicle = vehicles[vehicleIndex];
    const color = DRIVER_COLORS[vehicleIndex % DRIVER_COLORS.length];

    // Obtener los jobs asignados a este vehículo en orden
    const jobSteps = vroomRoute.steps.filter((s) => s.type === 'job');

    const stops: Stop[] = jobSteps.map((step, seq) => {
      // job IDs van de 1..N, matchean con validAddresses[id-1]
      const addrIndex = (step.job ?? 1) - 1;
      const address = validAddresses[addrIndex];

      return {
        sequence: seq + 1,
        address,
        status: 'pending',
        eta: step.arrival,
        distance: step.distance,
      };
    });

    // Obtener polyline de HERE Routing para esta ruta
    let polyline: [number, number][] = [];
    let alternatives: [number, number][][] = [];
    if (stops.length > 0) {
      const endDep = vehicle.endDepot ?? vehicle.depot;
      const waypoints: [number, number][] = [
        [vehicle.depot.lat, vehicle.depot.lng],
        ...stops.map((s) => [s.address.lat!, s.address.lng!] as [number, number]),
        [endDep.lat, endDep.lng],
      ];

      try {
        const hereResult = await getRouteHERE(waypoints);
        polyline     = hereResult.polyline;
        alternatives = hereResult.alternatives;
      } catch (e) {
        console.warn('HERE Routing no pudo trazar la polyline:', e);
      }
    }

    routes.push({
      vehicleId: vehicle.id,
      driverName: vehicle.driverName,
      matricula: vehicle.matricula,
      color,
      depot: vehicle.depot,
      endDepot: vehicle.endDepot ?? vehicle.depot,
      stops,
      invoices: vehicle.invoices,
      polyline,
      alternatives,
      totalDistance: vroomRoute.distance,
      totalDuration: vroomRoute.duration,
    });
  }

  return routes;
}

/**
 * Asigna colores a los vehículos para consistencia visual.
 */
export function assignVehicleColors(vehicles: Vehicle[]): Vehicle[] {
  return vehicles.map((v, idx) => ({
    ...v,
    color: DRIVER_COLORS[idx % DRIVER_COLORS.length],
  }));
}
