import type {
  Address,
  Vehicle,
  Route,
  Stop,
} from '@/types';
import { getRouteGoogle } from './here';

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const OPTIMIZATION_API_URL = 'https://routeoptimization.googleapis.com/v1/projects/shuma-rutas:optimizeTours';

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
 * Llama a la API de Optimización de Rutas de Google Cloud.
 */
async function callGoogleRouteOptimization(payload: any): Promise<any> {
  const url = `${OPTIMIZATION_API_URL}?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Route Optimization error ${res.status}: ${text}`);
  }

  return await res.json();
}

/**
 * Haversine formula to compute distance in meters between two coordinates.
 */
function getHaversineDistance(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fallback routing optimizer using Clustering + Nearest Neighbor TSP.
 * Executed purely in client-side JS when Google API or local Vroom server is unavailable.
 */
async function fallbackOptimizeRoutes(
  addresses: Address[],
  vehicles: Vehicle[],
  depot: { lat: number; lng: number }
): Promise<Route[]> {
  // 1. Assign each address to the closest vehicle's depot, respecting capacity
  const vehicleRoutesData = vehicles.map((v) => ({
    vehicle: v,
    assignedAddresses: [] as Address[],
    currentLoad: 0,
  }));

  // Sort addresses by distance to the nearest depot to start greedy assignments
  const addressAssignments = addresses.map((addr) => {
    const distances = vehicles.map((v) => ({
      vehicleId: v.id,
      dist: getHaversineDistance({ lat: addr.lat!, lng: addr.lng! }, v.depot),
    }));
    distances.sort((a, b) => a.dist - b.dist);
    return { address: addr, distances };
  });

  // Assign addresses greedy based on capacity
  for (const { address, distances } of addressAssignments) {
    let assigned = false;
    for (const d of distances) {
      const rData = vehicleRoutesData.find((r) => r.vehicle.id === d.vehicleId);
      if (rData && rData.currentLoad < rData.vehicle.capacity) {
        rData.assignedAddresses.push(address);
        rData.currentLoad += 1;
        assigned = true;
        break;
      }
    }
    // If all full, assign to the closest vehicle anyway
    if (!assigned) {
      const closestId = distances[0].vehicleId;
      const rData = vehicleRoutesData.find((r) => r.vehicle.id === closestId);
      if (rData) {
        rData.assignedAddresses.push(address);
        rData.currentLoad += 1;
      }
    }
  }

  // 2. For each vehicle, sort addresses using Greedy Nearest Neighbor TSP
  const routes: Route[] = [];

  for (let idx = 0; idx < vehicleRoutesData.length; idx++) {
    const { vehicle, assignedAddresses } = vehicleRoutesData[idx];
    const color = DRIVER_COLORS[idx % DRIVER_COLORS.length];

    const stops: Stop[] = [];
    const unvisited = [...assignedAddresses];
    let currentPos: { lat: number; lng: number } = vehicle.depot;
    let accumulatedDistance = 0;
    let accumulatedDuration = 0;

    let seq = 1;
    while (unvisited.length > 0) {
      let nearestIndex = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const dist = getHaversineDistance(currentPos, {
          lat: unvisited[i].lat!,
          lng: unvisited[i].lng!,
        });
        if (dist < minDistance) {
          minDistance = dist;
          nearestIndex = i;
        }
      }

      const nextAddr = unvisited.splice(nearestIndex, 1)[0];
      
      // Calculate travel stats (assume average speed of 30 km/h = 8.33 m/s)
      const travelSpeed = 8.33; // m/s
      const travelDuration = minDistance / travelSpeed;
      const serviceDuration = 120; // 2 mins service

      accumulatedDistance += minDistance;
      accumulatedDuration += travelDuration + serviceDuration;

      stops.push({
        sequence: seq++,
        address: nextAddr,
        status: 'pending',
        eta: Math.round(accumulatedDuration),
        distance: Math.round(accumulatedDistance),
      });

      currentPos = { lat: nextAddr.lat!, lng: nextAddr.lng! };
    }

    // Add trip back to end depot
    const endDep = vehicle.endDepot ?? vehicle.depot;
    const finalDistance = getHaversineDistance(currentPos, endDep);
    const finalDuration = finalDistance / 8.33;
    accumulatedDistance += finalDistance;
    accumulatedDuration += finalDuration;

    routes.push({
      vehicleId: vehicle.id,
      driverName: vehicle.driverName,
      matricula: vehicle.matricula,
      color,
      depot: vehicle.depot,
      endDepot: endDep,
      stops,
      invoices: vehicle.invoices,
      polyline: [],
      alternatives: [],
      totalDistance: Math.round(accumulatedDistance),
      totalDuration: Math.round(accumulatedDuration),
    });
  }

  // 3. For each route with stops, call Google routing asynchronously if possible to get real polylines
  return Promise.all(
    routes.map(async (route) => {
      if (route.stops.length > 0) {
        const waypoints: [number, number][] = [
          [route.depot.lat, route.depot.lng],
          ...route.stops.map((s) => [s.address.lat!, s.address.lng!] as [number, number]),
          [route.endDepot.lat, route.endDepot.lng],
        ];

        try {
          const hereResult = await getRouteGoogle(waypoints);
          return {
            ...route,
            polyline: hereResult.polyline,
            alternatives: hereResult.alternatives,
          };
        } catch (e) {
          console.warn(`[Fallback] Google Routes failed for driver ${route.driverName}:`, e);
        }
      }
      return route;
    })
  );
}

/**
 * Función principal de optimización.
 * Toma las direcciones y vehículos, llama a Google Route Optimization API
 * y luego obtiene la geometría de Google Routes API.
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

  try {
    // 1. Construir el payload para Google Route Optimization API
    const shipments = validAddresses.map((addr, idx) => ({
      deliveries: [
        {
          arrivalLocation: {
            latitude: addr.lat!,
            longitude: addr.lng!,
          },
          duration: '120s', // 2 minutos de servicio
        },
      ],
      label: addr.name,
      loadDemands: {
        parcels: {
          amount: '1',
        },
      },
    }));

    const googleVehicles = vehicles.map((v) => {
      const endDep = v.endDepot ?? v.depot;
      return {
        startLocation: {
          latitude: v.depot.lat,
          longitude: v.depot.lng,
        },
        endLocation: {
          latitude: endDep.lat,
          longitude: endDep.lng,
        },
        label: v.driverName,
        loadLimits: {
          parcels: {
            maxLoad: v.capacity.toString(),
          },
        },
      };
    });

    const payload = {
      model: {
        shipments,
        vehicles: googleVehicles,
      },
    };

    const googleResult = await callGoogleRouteOptimization(payload);

    const routes: Route[] = [];

    // Mapear rutas de Google a la estructura de la aplicación
    for (const googleRoute of googleResult.routes || []) {
      const vehicleIndex = googleRoute.vehicleIndex ?? 0;
      const vehicle = vehicles[vehicleIndex];
      if (!vehicle) continue;

      const color = DRIVER_COLORS[vehicleIndex % DRIVER_COLORS.length];

      // Las paradas asignadas al vehículo en orden
      const stops: Stop[] = (googleRoute.visits || []).map((visit: any, seqIndex: number) => {
        const shipmentIndex = visit.shipmentIndex ?? 0;
        const address = validAddresses[shipmentIndex];

        // Sumar estadísticas de transición
        const transition = googleRoute.transitions?.[seqIndex];
        const distance = transition ? transition.travelDistanceMeters || 0 : 0;
        const durationSecs = transition ? parseInt(transition.travelDuration || '0') : 0;

        return {
          sequence: seqIndex + 1,
          address,
          status: 'pending' as const,
          eta: durationSecs,
          distance: distance,
        };
      });

      // Acumular ETAs y distancias de forma secuencial
      let accumulatedDistance = 0;
      let accumulatedDuration = 0;
      for (const stop of stops) {
        accumulatedDistance += stop.distance || 0;
        accumulatedDuration += stop.eta || 0;

        stop.distance = accumulatedDistance;
        stop.eta = accumulatedDuration;

        accumulatedDuration += 120; // 120 segundos de servicio
      }

      // Añadir regreso a la bodega (última transición)
      let finalDistance = 0;
      let finalDuration = 0;
      if (googleRoute.transitions && googleRoute.transitions.length > googleRoute.visits.length) {
        const lastTransition = googleRoute.transitions[googleRoute.transitions.length - 1];
        finalDistance = lastTransition.travelDistanceMeters || 0;
        finalDuration = parseInt(lastTransition.travelDuration || '0');
      }

      const totalDistance = accumulatedDistance + finalDistance;
      const totalDuration = accumulatedDuration + finalDuration;

      // Obtener geometría detallada con Google Routes API
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
          const routesResult = await getRouteGoogle(waypoints);
          polyline = routesResult.polyline;
          alternatives = routesResult.alternatives;
        } catch (e) {
          console.warn(`[Google Routes] Falló al trazar polilínea para ${vehicle.driverName}:`, e);
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
        totalDistance,
        totalDuration,
      });
    }

    return routes;
  } catch (err) {
    console.warn('Google Route Optimization API failed or billing not active. Using client-side routing fallback:', err);
    return fallbackOptimizeRoutes(validAddresses, vehicles, depot);
  }
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
