'use client';

import { useEffect, useRef } from 'react';
import type { Address, Route } from '@/types';

interface Props {
  addresses: Address[];
  routes: Route[];
  depot: { lat: number; lng: number; label: string } | null;
}

/** SVG string para marcador de chofer */
function driverSvg(color: string, label: string | number) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z"
            fill="${color}" opacity="0.95"/>
      <circle cx="16" cy="16" r="9" fill="white" opacity="0.9"/>
      <text x="16" y="20" text-anchor="middle" font-size="10" font-weight="bold"
            fill="${color}" font-family="Inter,sans-serif">${label}</text>
    </svg>`;
}

/** SVG string para marcador de bodega */
function depotSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="36" height="46">
      <path d="M18 0C8.059 0 0 8.059 0 18c0 11 18 28 18 28S36 29 36 18C36 8.059 27.941 0 18 0z"
            fill="#F59E0B"/>
      <circle cx="18" cy="18" r="11" fill="white" opacity="0.95"/>
      <text x="18" y="23" text-anchor="middle" font-size="14" fill="#F59E0B"
            font-family="Inter,sans-serif">🏭</text>
    </svg>`;
}

export default function MapView({ addresses, routes, depot }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);

  // ── Inicializar mapa (todo Leaflet es async para evitar SSR) ───────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Inyectar CSS de Leaflet dinámicamente
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    let destroyed = false;

    import('leaflet').then((L) => {
      if (destroyed || !containerRef.current || mapRef.current) return;

      // Fix iconos con webpack/Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current, {
        center: [23.6345, -102.5528],
        zoom: 5,
        zoomControl: true,
      });

      const hereKey = process.env.NEXT_PUBLIC_HERE_API_KEY;
      L.tileLayer(
        `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png?apiKey=${hereKey}&style=explore.day`,
        {
          attribution: '© HERE 2024',
          maxZoom: 20,
        }
      ).addTo(map);

      mapRef.current = map;
    });

    return () => {
      destroyed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Actualizar markers y polylines ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Limpiar capas anteriores
    markersRef.current.forEach((layer) => layer.remove());
    markersRef.current = [];

    import('leaflet').then((L) => {
      const bounds: [number, number][] = [];

      const makeDriverIcon = (color: string, label: string | number) =>
        L.divIcon({ html: driverSvg(color, label), iconSize: [32, 42], iconAnchor: [16, 42], popupAnchor: [0, -42], className: '' });

      const makeDepotIcon = () =>
        L.divIcon({ html: depotSvg(), iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46], className: '' });

      if (routes.length > 0) {
        // Dibujar bodegas únicas
        const uniqueDepots = Array.from(
          new Map(routes.map((r) => [r.depot.id, r.depot])).values()
        );
        uniqueDepots.forEach((d) => {
          const marker = L.marker([d.lat, d.lng], { icon: makeDepotIcon() })
            .bindPopup(`<b>🏭 ${d.name}</b><br/><small>${d.address}</small>`)
            .addTo(map);
          markersRef.current.push(marker);
          bounds.push([d.lat, d.lng]);
        });

        // Dibujar rutas
        routes.forEach((route) => {
          const startCoord: [number, number] = [route.depot.lat, route.depot.lng];
          const endCoord: [number, number]   = [
            (route.endDepot ?? route.depot).lat,
            (route.endDepot ?? route.depot).lng,
          ];

          // Construir el array manualmente: depot → stops en orden de Vroom → endDepot
          const stopsCoords: [number, number][] = route.stops
            .filter((s) => s.address.lat !== null && s.address.lng !== null)
            .map((s) => [s.address.lat!, s.address.lng!]);

          const coordArray: [number, number][] = [
            startCoord,
            ...stopsCoords,
            endCoord,
          ];

          if (coordArray.length >= 2) {
            const polyline = L.polyline(coordArray, {
              color: route.color,
              weight: 4,
              opacity: 0.85,
            }).addTo(map);
            markersRef.current.push(polyline);
          }

          route.stops.forEach((stop, idx) => {
            if (stop.address.lat === null || stop.address.lng === null) return;
            const lat = stop.address.lat;
            const lng = stop.address.lng;
            const marker = L.marker([lat, lng], { icon: makeDriverIcon(route.color, idx + 1) })
              .bindPopup(`
                <div style="font-family:Inter,sans-serif;min-width:160px">
                  <div style="font-weight:600;color:${route.color};margin-bottom:4px">
                    Parada ${stop.sequence} · ${route.driverName}
                  </div>
                  <div style="font-weight:500;color:#1e293b">${stop.address.name}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:2px">${stop.address.raw}</div>
                </div>
              `)
              .addTo(map);
            markersRef.current.push(marker);
            bounds.push([lat, lng]);
          });
        });
      } else {
        // Sin rutas: depósito global + direcciones
        if (depot) {
          const marker = L.marker([depot.lat, depot.lng], { icon: makeDepotIcon() })
            .bindPopup(`<b>🏭 Depósito</b><br/><small>${depot.label}</small>`)
            .addTo(map);
          markersRef.current.push(marker);
          bounds.push([depot.lat, depot.lng]);
        }

        addresses
          .filter((a) => a.lat !== null && a.lng !== null)
          .forEach((addr) => {
            const marker = L.marker([addr.lat!, addr.lng!], { icon: makeDriverIcon('#64748B', '·') })
              .bindPopup(`
                <div style="font-family:Inter,sans-serif">
                  <div style="font-weight:500;color:#1e293b">${addr.name}</div>
                  <div style="font-size:12px;color:#64748b">${addr.raw}</div>
                </div>
              `)
              .addTo(map);
            markersRef.current.push(marker);
            bounds.push([addr.lat!, addr.lng!]);
          });
      }

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    });
  }, [addresses, routes, depot]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ minHeight: '400px' }}
    />
  );
}
