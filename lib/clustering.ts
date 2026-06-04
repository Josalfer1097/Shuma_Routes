import type { Address, Cluster, Depot } from '@/types';
import DEPOTS from './depots';

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

export function clusterDeliveries(addresses: Address[], numClusters: number): Cluster[] {
  const valid = addresses.filter(a => a.lat !== null && a.lng !== null);
  if (valid.length === 0) return [];
  
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
    
    for (const addr of valid) {
      let minDist = Infinity;
      let closestIdx = 0;
      for (let i = 0; i < k; i++) {
        const d = getDistance(addr.lat!, addr.lng!, centroids[i].lat, centroids[i].lng);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
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
