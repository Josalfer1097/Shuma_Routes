import type { OSRMRouteResult } from '@/types';

const OSRM_BASE = 'http://localhost:5000';

/**
 * Decodifica una polyline encoded en formato Google/OSRM.
 * Retorna array de [lat, lng].
 */
function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = Math.pow(10, precision);
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / factor, lng / factor]);
  }

  return coords;
}

/**
 * Obtiene la ruta entre múltiples waypoints usando OSRM.
 * Las coordenadas de entrada son [lat, lng].
 */
export async function getRoute(
  coordinates: [number, number][]
): Promise<OSRMRouteResult> {
  if (coordinates.length < 2) {
    throw new Error('Se necesitan al menos 2 coordenadas para calcular una ruta.');
  }

  // OSRM usa [lon, lat]
  const coords = coordinates
    .map(([lat, lng]) => `${lng},${lat}`)
    .join(';');

  console.log('[OSRM] waypoints enviados:', coordinates);
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=polyline6&continue_straight=false`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`OSRM error ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();

  if (data.code !== 'Ok' || !data.routes?.[0]) {
    throw new Error(`OSRM no pudo calcular la ruta: ${data.code}`);
  }

  const route = data.routes[0];
  console.log('[OSRM] geometría raw (primeros 80 chars):', route.geometry?.slice(0, 80));
  const decoded = decodePolyline(route.geometry);

  // Garantizar que el último punto de la polyline coincide con el último waypoint (depot_end)
  const lastWp = coordinates[coordinates.length - 1];
  const lastDecoded = decoded[decoded.length - 1];
  const dist = lastDecoded
    ? Math.abs(lastDecoded[0] - lastWp[0]) + Math.abs(lastDecoded[1] - lastWp[1])
    : 1;
  if (dist > 0.0001) {
    // El último punto decodificado difiere del depot_end → agregarlo explícitamente
    decoded.push(lastWp);
  }

  return {
    polyline: decoded,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

/**
 * Calcula la duración estimada entre dos puntos (tabla de duraciones).
 * Usado para construir la matriz de costos para Vroom.
 */
export async function getDurationMatrix(
  coordinates: [number, number][]
): Promise<number[][]> {
  // OSRM usa [lon, lat]
  const coords = coordinates
    .map(([lat, lng]) => `${lng},${lat}`)
    .join(';');

  const url = `${OSRM_BASE}/table/v1/driving/${coords}?annotations=duration`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`OSRM table error ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();

  if (data.code !== 'Ok') {
    throw new Error(`OSRM table error: ${data.code}`);
  }

  return data.durations;
}

/**
 * Formatea segundos en texto legible (ej: "1h 23min")
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

/**
 * Formatea metros en texto legible (ej: "12.4 km")
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}
