import type {
  Address,
  Vehicle,
  Route,
  Stop,
  Cluster,
} from '@/types';
import { getRouteGoogle } from './here';



/** Colores predeterminados para los choferes (hasta 12) */
const DRIVER_COLORS = [
  '#2196F3', // azul
  '#10B981', // esmeralda
  '#F59E0B', // ámbar
  '#EF4444', // rojo
  '#8B5CF6', // violeta
  '#EC4899', // rosa
  '#06B6D4', // cyan
  '#84CC16', // lima
  '#F97316', // naranja
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#D946EF', // fuchsia
];

/**
 * Llama a la API de Optimización de Rutas de Google Cloud a través del proxy local.
 */
async function callGoogleRouteOptimization(payload: any): Promise<any> {
  const url = '/api/optimize';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Route Optimization proxy error ${res.status}: ${text}`);
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
  clusters: Cluster[],
  vehicles: Vehicle[]
): Promise<Route[]> {
  const routes: Route[] = [];

  for (let idx = 0; idx < vehicles.length; idx++) {
    const vehicle = vehicles[idx];
    const cluster = clusters[idx];
    if (!cluster) continue;
    const color = DRIVER_COLORS[idx % DRIVER_COLORS.length];

    const stops: Stop[] = [];
    const unvisited = [...cluster.addresses];
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
      zoneName: cluster.name,
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
            polylineEncoded: hereResult.polylineEncoded,
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
 * Helper para combinar la fecha global con la hora específica del vehículo.
 */
function buildVehicleStartTime(globalIso: string, specificTime?: string): string {
  if (!specificTime) return globalIso;
  const [hh, mm] = specificTime.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return globalIso;
  
  const dateObj = new Date(); // Base from today
  dateObj.setHours(hh, mm, 0, 0);
  
  return dateObj.toISOString();
}

/**
 * Función principal de optimización.
 * Toma las direcciones y vehículos, llama a Google Route Optimization API
 * y luego obtiene la geometría de Google Routes API.
 */
export async function optimizeSingleVehicle(
  vehicle: Vehicle,
  addresses: Address[],
  departureTime: string,
  color: string,
  zoneName: string,
  unloadConfig?: any
): Promise<Route> {
  const shipments: any[] = [];
  const validAddresses: Address[] = [];
  const datePrefix = departureTime.split('T')[0];

  const endDep = vehicle.endDepot ?? vehicle.depot;
  const vehicleStartTime = buildVehicleStartTime(departureTime, vehicle.departureTime);
  const vehicleStartDate = new Date(vehicleStartTime);
  const vehicleEndTime = new Date(vehicleStartDate.getTime() + 12 * 60 * 60 * 1000).toISOString();

  let maxLoad = vehicle.capacity;
  if (vehicle.type === 'Camión grande') maxLoad = 6;
  if (vehicle.type === 'Camioneta') maxLoad = 4;



  // Fallback seguro para coordenadas (San Pablo como default)
  const DEFAULT_LAT = 19.3550675;
  const DEFAULT_LNG = -99.0939998;

  const startLat = typeof vehicle.depot?.lat === 'number' && isFinite(vehicle.depot.lat) ? vehicle.depot.lat : DEFAULT_LAT;
  const startLng = typeof vehicle.depot?.lng === 'number' && isFinite(vehicle.depot.lng) ? vehicle.depot.lng : DEFAULT_LNG;
  const endLat   = typeof endDep?.lat === 'number' && isFinite(endDep.lat) ? endDep.lat : startLat;
  const endLng   = typeof endDep?.lng === 'number' && isFinite(endDep.lng) ? endDep.lng : startLng;

  const googleVehicle = {
    startLocation: { latitude: startLat, longitude: startLng },
    endLocation:   { latitude: endLat,   longitude: endLng },
    label: vehicle.driverName,
    loadLimits: { parcels: { maxLoad: maxLoad.toString() } },
    startTimeWindows: [{ startTime: vehicleStartTime, endTime: vehicleEndTime }],
  };

  addresses.forEach(addr => {
    validAddresses.push(addr);
    shipments.push({
      deliveries: [{
        arrivalLocation: { latitude: addr.lat!, longitude: addr.lng! },
        duration: '120s'
      }],
      label: addr.name,
      loadDemands: { parcels: { amount: '1' } },
      penaltyCost: 1000000,
    });
  });

  const globalStartDate = new Date(departureTime);
  const globalEndTime = new Date(globalStartDate.getTime() + 12 * 60 * 60 * 1000).toISOString();

  const payload = {
    model: {
      shipments,
      vehicles: [googleVehicle],
      globalStartTime: departureTime, // Fallback base
    },
    unloadConfig,
    vehicleTypes: { [googleVehicle.label]: vehicle.type }
  };

  const googleResult = await callGoogleRouteOptimization(payload);
  if (!googleResult.routes || googleResult.routes.length === 0) {
    throw new Error(`Google API falló o rechazó las paradas para ${vehicle.driverName}`);
  }

  const googleRoute = googleResult.routes[0];
  const stops: Stop[] = (googleRoute.visits || []).map((visit: any, seqIndex: number) => {
    const shipmentIndex = visit.shipmentIndex ?? 0;
    const address = validAddresses[shipmentIndex];
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

  let accumulatedDistance = 0;
  let accumulatedDuration = 0;
  stops.forEach((stop) => {
    accumulatedDistance += stop.distance || 0;
    accumulatedDuration += stop.eta || 0;
    stop.distance = accumulatedDistance;
    stop.eta = accumulatedDuration;
  });

  const lastTransition = googleRoute.transitions?.[googleRoute.transitions.length - 1];
  let finalDistance = 0;
  let finalDuration = 0;
  if (lastTransition) {
    finalDistance = lastTransition.travelDistanceMeters || 0;
    finalDuration = parseInt(lastTransition.travelDuration || '0');
  }

  const totalDistance = accumulatedDistance + finalDistance;
  const totalDuration = accumulatedDuration + finalDuration;

  let polyline: [number, number][] = [];
  let polylineEncoded: string | undefined = undefined;
  let alternatives: [number, number][][] = [];
  if (stops.length > 0) {
    const waypoints: [number, number][] = [
      [vehicle.depot.lat, vehicle.depot.lng],
      ...stops.map((s) => [s.address.lat!, s.address.lng!] as [number, number]),
      [endDep.lat, endDep.lng],
    ];

    try {
      const routesResult = await getRouteGoogle(waypoints);
      polyline = routesResult.polyline;
      polylineEncoded = routesResult.polylineEncoded;
      alternatives = routesResult.alternatives;
    } catch (e) {
      console.warn(`[Google Routes] Falló al trazar polilínea para ${vehicle.driverName}:`, e);
    }
  }

  return {
    vehicleId: vehicle.id,
    driverName: vehicle.driverName,
    matricula: vehicle.matricula,
    vehicleType: vehicle.type,
    color,
    depot: vehicle.depot,
    endDepot: endDep,
    stops,
    invoices: vehicle.invoices,
    polyline,
    polylineEncoded,
    alternatives,
    totalDistance,
    totalDuration,
    departureTime: vehicle.departureTime,
    metrics: {
      totalDistanceKm: Number((totalDistance / 1000).toFixed(2)),
      totalDurationMin: Math.round(totalDuration / 60),
      stopCount: stops.length,
    },
  };
}

/**
 * Función principal de optimización para todas las zonas.
 */
export async function optimizeRoutes(
  clusters: Cluster[],
  vehicles: Vehicle[],
  departureTime: string,
  manualAssignments?: { addressId: string; vehicleIndex: number }[],
  unloadConfig?: any
): Promise<Route[]> {
  if (clusters.length === 0) {
    throw new Error('No hay zonas generadas.');
  }
  if (vehicles.length === 0) {
    throw new Error('No hay vehículos/choferes registrados.');
  }

  try {
    const shipments: any[] = [];
    const googleVehicles: any[] = [];
    const validAddresses: Address[] = [];
    const datePrefix = departureTime.split('T')[0]; // para timeWindows
    
    vehicles.forEach((v, vIdx) => {
      const cluster = clusters[vIdx];
      if (!cluster) return;
      
      const endDep = v.endDepot ?? v.depot;
      const vehicleStartTime = buildVehicleStartTime(departureTime, v.departureTime);
      const vehicleStartDate = new Date(vehicleStartTime);
      const vehicleEndTime = new Date(vehicleStartDate.getTime() + 12 * 60 * 60 * 1000).toISOString();
      
      let maxLoad = v.capacity;
      if (v.type === 'Camión grande') maxLoad = 6;
      if (v.type === 'Camioneta') maxLoad = 4;

      const DEFAULT_LAT = 19.3550675;
      const DEFAULT_LNG = -99.0939998;
      const sLat = typeof v.depot?.lat === 'number' && isFinite(v.depot.lat) ? v.depot.lat : DEFAULT_LAT;
      const sLng = typeof v.depot?.lng === 'number' && isFinite(v.depot.lng) ? v.depot.lng : DEFAULT_LNG;
      const eLat = typeof endDep?.lat === 'number' && isFinite(endDep.lat) ? endDep.lat : sLat;
      const eLng = typeof endDep?.lng === 'number' && isFinite(endDep.lng) ? endDep.lng : sLng;

      googleVehicles.push({
        startLocation: { latitude: sLat, longitude: sLng },
        endLocation:   { latitude: eLat, longitude: eLng },
        label: v.driverName,
        loadLimits: { parcels: { maxLoad: maxLoad.toString() } },
        startTimeWindows: [{ startTime: vehicleStartTime, endTime: vehicleEndTime }],
      });

      cluster.addresses.forEach(addr => {
        validAddresses.push(addr);

        shipments.push({
          deliveries: [{
            arrivalLocation: { latitude: addr.lat!, longitude: addr.lng! },
            duration: '120s'
          }],
          label: addr.name,
          loadDemands: { parcels: { amount: '1' } },
          penaltyCost: 1000000,
        });
      });
    });

    const globalStartDate = new Date(departureTime);
    const globalEndTime = new Date(globalStartDate.getTime() + 12 * 60 * 60 * 1000).toISOString();

    const vehicleTypes = vehicles.reduce((acc, v) => ({ ...acc, [v.driverName]: v.type }), {});

    const payload = {
      model: {
        shipments,
        vehicles: googleVehicles,
        globalStartTime: departureTime, // Fallback base
        globalEndTime: globalEndTime,
      },
      unloadConfig,
      vehicleTypes
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
          const polylineEncoded = routesResult.polylineEncoded;
          alternatives = routesResult.alternatives;
          (alternatives as any)._polylineEncoded = polylineEncoded;
        } catch (e) {
          console.warn(`[Google Routes] Falló al trazar polilínea para ${vehicle.driverName}:`, e);
        }
      }

      routes.push({
        vehicleId: vehicle.id,
        driverName: vehicle.driverName,
        matricula: vehicle.matricula,
        vehicleType: vehicle.type,
        color,
        depot: vehicle.depot,
        endDepot: vehicle.endDepot ?? vehicle.depot,
        stops,
        invoices: vehicle.invoices,
        polyline,
        polylineEncoded: (alternatives as any)._polylineEncoded,
        alternatives,
        totalDistance,
        totalDuration,
        departureTime: vehicle.departureTime,
        metrics: {
          totalDistanceKm: Number((totalDistance / 1000).toFixed(2)),
          totalDurationMin: Math.round(totalDuration / 60),
          stopCount: stops.length,
        },
      });
    }

    return routes;
  } catch (err) {
    console.warn('Google Route Optimization API failed or billing not active. Using client-side routing fallback:', err);
    return fallbackOptimizeRoutes(clusters, vehicles);
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

/**
 * Redibuja la polilínea de una ruta usando Google Routes API
 * respetando el orden de paradas exactamente como viene.
 * NO llama a Route Optimization — solo calcula la geometría.
 */
export async function redrawPolylineForRoute(route: Route): Promise<Route> {
  if (route.stops.length === 0) return route;

  try {
    const depot = route.depot;
    const endDep = route.endDepot ?? route.depot;

    const waypoints: [number, number][] = [
      [depot.lat, depot.lng],
      ...route.stops
        .filter(s => s.address.lat != null && s.address.lng != null)
        .map(s => [s.address.lat!, s.address.lng!] as [number, number]),
      [endDep.lat, endDep.lng],
    ];

    if (waypoints.length < 2) return route;

    const result = await getRouteGoogle(waypoints);

    // Recalcular ETAs y distancias acumuladas basados en la nueva polilínea
    let accDist = 0;
    let accTime = 0;
    const updatedStops = route.stops.map((stop, i) => {
      // Estimación simple: dividir total proporcionalmente
      const fraction = (i + 1) / route.stops.length;
      accDist = result.distanceMeters * fraction;
      accTime = result.durationSeconds * fraction;
      return { ...stop, distance: Math.round(accDist), eta: Math.round(accTime) };
    });

    return {
      ...route,
      stops: updatedStops,
      polyline: result.polyline,
      polylineEncoded: result.polylineEncoded,
      totalDistance: result.distanceMeters,
      totalDuration: result.durationSeconds,
    };
  } catch (err) {
    console.warn('[redrawPolyline] Error obteniendo polilínea:', err);
    return route; // Fallback: retornar ruta sin cambiar polilínea
  }
}
