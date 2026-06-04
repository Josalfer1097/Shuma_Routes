'use client';

import { useEffect, useRef, useState } from 'react';
import type { Cluster } from '@/types';

interface Props {
  clusters: Cluster[];
  onConfirm: () => void;
  onRegroup: () => void;
}

// Monotone chain algorithm to find the convex hull of a set of 2D points
function getConvexHull(points: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  if (points.length <= 3) return points;

  // Sort by lng, then by lat
  const sorted = [...points].sort((a, b) => a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng);

  const cross = (o: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  };

  const lower: { lat: number; lng: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: { lat: number; lng: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function createClusterLabel(cluster: Cluster) {
  const div = document.createElement('div');
  div.className = 'flex flex-col items-center justify-center px-3 py-1.5 rounded-lg shadow-lg text-xs font-bold text-white border-2';
  div.style.backgroundColor = 'rgba(15, 23, 42, 0.9)'; // slate-900/90
  div.style.borderColor = cluster.color;
  div.style.transform = 'translateY(-15px)'; // Float above
  
  div.innerHTML = `
    <div style="color: ${cluster.color}">${cluster.name}</div>
    <div class="text-[10px] font-normal text-slate-300">${cluster.addresses.length} paradas</div>
    <div class="text-[9px] font-normal text-slate-400">Salida: ${cluster.depot.name}</div>
  `;
  return div;
}

function createStopPin(color: string) {
  const div = document.createElement('div');
  div.className = 'w-3 h-3 rounded-full border-2 border-white shadow-sm';
  div.style.backgroundColor = color;
  return div;
}

export default function ZoneMap({ clusters, onConfirm, onRegroup }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let active = true;

    const initMap = async () => {
      const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary;
      await google.maps.importLibrary('marker');

      if (!active || !containerRef.current || mapRef.current) return;

      const map = new Map(containerRef.current, {
        center: { lat: 19.4326, lng: -99.1332 }, // CDMX
        zoom: 11,
        mapId: 'shuma-rutas-zone-map',
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false,
      });

      mapRef.current = map;
    };

    initMap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    
    // Clear old elements
    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current = [];
    markersRef.current.forEach(m => m.map = null);
    markersRef.current = [];

    if (clusters.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    clusters.forEach(cluster => {
      // Draw convex hull polygon
      const coords = cluster.addresses.map(a => ({ lat: a.lat!, lng: a.lng! }));
      if (coords.length > 2) {
        const hull = getConvexHull(coords);
        const polygon = new google.maps.Polygon({
          paths: hull,
          strokeColor: cluster.color,
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: cluster.color,
          fillOpacity: 0.15,
          map
        });
        polygonsRef.current.push(polygon);
      }

      // Add markers for addresses
      cluster.addresses.forEach(addr => {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: addr.lat!, lng: addr.lng! },
          content: createStopPin(cluster.color),
          title: addr.name,
        });
        markersRef.current.push(marker);
        bounds.extend({ lat: addr.lat!, lng: addr.lng! });
      });

      // Add label at centroid
      const centroidMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: cluster.centroid,
        content: createClusterLabel(cluster),
      });
      markersRef.current.push(centroidMarker);
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
    }

  }, [clusters]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full bg-slate-800" />
      
      {/* Floating Panel for Actions */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-3 p-3 bg-slate-900/90 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl">
        <button
          onClick={onRegroup}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Reagrupar
        </button>
        <button
          onClick={onConfirm}
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl shadow-md transition-all hover:scale-105"
        >
          Confirmar Zonas ({clusters.length})
        </button>
      </div>
    </div>
  );
}
