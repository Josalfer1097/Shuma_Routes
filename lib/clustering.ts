import type { Address, Cluster, Depot, ClusteringConfig, Vehicle } from '@/types';
import DEPOTS from './depots';

export interface ClusterResult {
  clusters: Cluster[];
  /** Direcciones válidas que no cupieron en ninguna capacidad configurada */
  overflow: number;
  /** Capacidad total configurada vs direcciones a repartir */
  totalCapacity: number;
  totalAddresses: number;
}

const SAN_PABLO = DEPOTS.find(d => d.id === 'san-pablo')!;
const DIVISION_NORTE = DEPOTS.find(d => d.id === 'division-del-norte')!;

const CLUSTER_COLORS = [
  '#3B82F6', // azul
  '#F59E0B', // ámbar
  '#10B981', // esmeralda
  '#EF4444', // rojo
  '#8B5CF6', // violeta
  '#06B6D4', // cian
];

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getZoneName(centroid: { lat: number, lng: number }): string {
  // Simple heuristic for CDMX
  const centerLat = 19.4326;
  const centerLng = -99.1332;
  
  if (centroid.lat > centerLat + 0.05) return 'Norte';
  if (centroid.lat < centerLat - 0.05) return 'Sur';
  if (centroid.lng > centerLng + 0.05) return 'Oriente';
  if (centroid.lng < centerLng - 0.05) return 'Poniente';
  return 'Centro';
}

export function clusterDeliveries(
  addresses: Address[],
  vehicles: Vehicle[],
  config: ClusteringConfig,
  overrideNumClusters?: number
): Cluster[] {
  // Mantiene la firma original por compatibilidad con los 5 llamados existentes.
  // Para obtener el diagnóstico de capacidad, usar clusterDeliveriesWithDiagnostics().
  const valid = addresses.filter(a => a.lat !== null && a.lng !== null);
  if (valid.length === 0) return [];
  
  const numClusters = overrideNumClusters && overrideNumClusters > 0
    ? overrideNumClusters
    : vehicles.length;
  const k = Math.min(numClusters, valid.length);
  if (k === 0) return [];

  // K-means++ initialization
  const centroids: {lat: number, lng: number}[] = [];
  
  // Start with the first point
  centroids.push({ lat: valid[0].lat!, lng: valid[0].lng! });
  
  for (let i = 1; i < k; i++) {
    let maxDist = -1;
    let nextCentroid = { lat: valid[0].lat!, lng: valid[0].lng! };
    
    for (const addr of valid) {
      let minDist = Infinity;
      for (const c of centroids) {
        const d = getDistance(addr.lat!, addr.lng!, c.lat, c.lng);
        if (d < minDist) minDist = d;
      }
      
      // Weight the distance by the distance to San Pablo to bias clusters
      const distToSanPablo = getDistance(addr.lat!, addr.lng!, SAN_PABLO.lat, SAN_PABLO.lng);
      const weight = 1 + (distToSanPablo / 10); // Farther from San Pablo = slightly higher chance to become centroid
      const weightedDist = minDist * weight;
      
      if (weightedDist > maxDist) {
        maxDist = weightedDist;
        nextCentroid = { lat: addr.lat!, lng: addr.lng! };
      }
    }
    centroids.push(nextCentroid);
  }

  // K-means iteration
  let clusters: Address[][] = Array.from({length: k}, () => []);
  let changed = true;
  let iterations = 0;
  
  while (changed && iterations < 50) {
    changed = false;
    const newClusters: Address[][] = Array.from({length: k}, () => []);
    
    const clusterCapacities = Array(k).fill(Infinity);
    vehicles.slice(0, k).forEach((v, i) => {
      const capMatch = config.vehicleCapacities.find(c => c.vehicleId === v.id);
      if (capMatch && capMatch.maxStops > 0) {
        clusterCapacities[i] = capMatch.maxStops;
      }
    });

    // Si la capacidad total configurada no alcanza para todas las direcciones,
    // se relajan los límites proporcionalmente en vez de perder entregas.
    // El déficit se reporta aparte para que la UI pueda advertirlo.
    const configuredTotal = clusterCapacities.reduce(
      (sum, c) => sum + (c === Infinity ? 0 : c), 0
    );
    const hasFiniteCaps = clusterCapacities.some(c => c !== Infinity);
    if (hasFiniteCaps && configuredTotal < valid.length) {
      const deficit = valid.length - configuredTotal;
      const extraPerCluster = Math.ceil(deficit / k);
      for (let i = 0; i < k; i++) {
        if (clusterCapacities[i] !== Infinity) {
          clusterCapacities[i] += extraPerCluster;
        }
      }
    }

    for (const addr of valid) {
      let minCost = Infinity;
      let closestIdx = -1;
      
      for (let i = 0; i < k; i++) {
        if (newClusters[i].length >= clusterCapacities[i]) continue;
        
        const d = getDistance(addr.lat!, addr.lng!, centroids[i].lat, centroids[i].lng);
        const size = newClusters[i].length;
        // Ponderar la distancia contra el tamaño actual. Multiplicamos por 2 para que el tamaño compita con km.
        const cost = (1 - config.balanceWeight) * d + config.balanceWeight * size * 2;
        
        if (cost < minCost) {
          minCost = cost;
          closestIdx = i;
        }
      }

      if (closestIdx === -1) {
        // Ningún cluster con cupo: asignar al que tenga MENOS paradas
        // (no al más cercano) para no desbalancear la operación.
        // Esta rama solo se alcanza en casos extremos; el ajuste
        // proporcional de arriba debería evitarla.
        let minSize = Infinity;
        for (let i = 0; i < k; i++) {
          if (newClusters[i].length < minSize) {
            minSize = newClusters[i].length;
            closestIdx = i;
          }
        }
      }
      
      newClusters[closestIdx].push(addr);
    }
    
    // Update centroids
    for (let i = 0; i < k; i++) {
      if (newClusters[i].length === 0) continue;
      
      let sumLat = 0;
      let sumLng = 0;
      for (const a of newClusters[i]) {
        sumLat += a.lat!;
        sumLng += a.lng!;
      }
      const newLat = sumLat / newClusters[i].length;
      const newLng = sumLng / newClusters[i].length;
      
      if (Math.abs(centroids[i].lat - newLat) > 0.00001 || Math.abs(centroids[i].lng - newLng) > 0.00001) {
        changed = true;
        centroids[i].lat = newLat;
        centroids[i].lng = newLng;
      }
    }
    clusters = newClusters;
    iterations++;
  }

  // Build final Cluster objects
  // Red de seguridad: ninguna dirección válida puede perderse en el reparto
  const assignedCount = clusters.reduce((sum, c) => sum + c.length, 0);
  if (assignedCount !== valid.length) {
    console.error(
      `[clustering] ERROR: ${valid.length} direcciones válidas pero ${assignedCount} asignadas. ` +
      `Se perdieron ${valid.length - assignedCount}.`
    );
  }

  return clusters.map((addrs, i) => {
    const centroid = centroids[i];
    const distToSanPablo = getDistance(centroid.lat, centroid.lng, SAN_PABLO.lat, SAN_PABLO.lng);
    const distToDivision = getDistance(centroid.lat, centroid.lng, DIVISION_NORTE.lat, DIVISION_NORTE.lng);
    
    let depot = SAN_PABLO;
    // Si está más cerca de División del Norte Y tiene pocas paradas
    if (distToDivision < distToSanPablo && addrs.length <= 12) {
      depot = DIVISION_NORTE;
    }

    const directionName = getZoneName(centroid);
    const name = `Zona ${directionName}`;

    return {
      id: `zone-${i + 1}`,
      name,
      centroid,
      addresses: addrs,
      depot,
      color: CLUSTER_COLORS[i % CLUSTER_COLORS.length]
    };
  });
}

/**
 * Igual que clusterDeliveries, pero además reporta si la capacidad configurada
 * era insuficiente. Úsalo cuando necesites advertir al usuario.
 */
export function clusterDeliveriesWithDiagnostics(
  addresses: Address[],
  vehicles: Vehicle[],
  config: ClusteringConfig,
  overrideNumClusters?: number
): ClusterResult {
  const valid = addresses.filter(a => a.lat !== null && a.lng !== null);
  const clusters = clusterDeliveries(addresses, vehicles, config, overrideNumClusters);

  const k = overrideNumClusters && overrideNumClusters > 0
    ? Math.min(overrideNumClusters, valid.length)
    : Math.min(vehicles.length, valid.length);

  let totalCapacity = 0;
  let hasFiniteCaps = false;
  vehicles.slice(0, k).forEach(v => {
    const capMatch = config.vehicleCapacities.find(c => c.vehicleId === v.id);
    if (capMatch && capMatch.maxStops > 0) {
      totalCapacity += capMatch.maxStops;
      hasFiniteCaps = true;
    }
  });

  const assigned = clusters.reduce((sum, c) => sum + c.addresses.length, 0);

  return {
    clusters,
    overflow: hasFiniteCaps ? Math.max(0, valid.length - totalCapacity) : 0,
    totalCapacity: hasFiniteCaps ? totalCapacity : valid.length,
    totalAddresses: valid.length,
  };
}
