'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
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

/** SVG string para marcador de bodega de regreso */
function endDepotSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="36" height="46">
      <path d="M18 0C8.059 0 0 8.059 0 18c0 11 18 28 18 28S36 29 36 18C36 8.059 27.941 0 18 0z"
            fill="#10B981"/>
      <circle cx="18" cy="18" r="11" fill="white" opacity="0.95"/>
      <text x="18" y="23" text-anchor="middle" font-size="14" fill="#10B981"
            font-family="Inter,sans-serif">🏁</text>
    </svg>`;
}

export default function MapView({ addresses, routes, depot }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<(google.maps.Marker | google.maps.Polyline)[]>([]);
  const [mapInitialized, setMapInitialized] = useState(false);

  // ── Inicializar Google Maps ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    setOptions({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      v: 'weekly',
    });

    let active = true;

    importLibrary('maps')
      .then(() => {
        if (!active || !containerRef.current || mapRef.current) return;

        const map = new google.maps.Map(containerRef.current, {
          center: { lat: 19.4326, lng: -99.1332 }, // Centro por defecto en CDMX
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            {
              featureType: 'all',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#747474' }],
            },
            {
              featureType: 'administrative.locality',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#d59563' }],
            },
            {
              featureType: 'poi',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#d59563' }],
            },
            {
              featureType: 'road',
              elementType: 'geometry',
              stylers: [{ color: '#f5f5f5' }],
            },
            {
              featureType: 'road.arterial',
              elementType: 'geometry',
              stylers: [{ color: '#ffffff' }],
            },
            {
              featureType: 'road.highway',
              elementType: 'geometry',
              stylers: [{ color: '#f8c967' }],
            },
            {
              featureType: 'water',
              elementType: 'geometry',
              stylers: [{ color: '#c9c9c9' }],
            },
            {
              featureType: 'water',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#9e9e9e' }],
            },
          ],
        });

        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();
        setMapInitialized(true);
      })
      .catch((err: any) => {
        console.error('Error loading Google Maps API:', err);
      });

    return () => {
      active = false;
      markersRef.current.forEach((obj) => obj.setMap(null));
      markersRef.current = [];
      mapRef.current = null;
      infoWindowRef.current = null;
      setMapInitialized(false);
    };
  }, []);

  // ── Actualizar markers y polylines ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInitialized) return;

    // Limpiar capas anteriores
    markersRef.current.forEach((obj) => obj.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    // Helper para crear marcadores SVG personalizados
    const makeSvgIcon = (svgString: string, w: number, h: number, ax: number, ay: number) => ({
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgString),
      scaledSize: new google.maps.Size(w, h),
      anchor: new google.maps.Point(ax, ay),
    });

    // Helper para añadir InfoWindow a un marcador
    const addInfoWindow = (marker: google.maps.Marker, htmlContent: string) => {
      marker.addListener('click', () => {
        if (infoWindowRef.current) {
          infoWindowRef.current.setContent(htmlContent);
          infoWindowRef.current.open(map, marker);
        }
      });
    };

    if (routes.length > 0) {
      // Dibujar bodegas únicas
      const uniqueDepots = Array.from(
        new Map(routes.map((r) => [r.depot.id, r.depot])).values()
      );
      uniqueDepots.forEach((d) => {
        const marker = new google.maps.Marker({
          position: { lat: d.lat, lng: d.lng },
          map,
          icon: makeSvgIcon(depotSvg(), 36, 46, 18, 46),
        });
        addInfoWindow(
          marker,
          `<b>🏭 ${d.name}</b><br/><small>${d.address}</small>`
        );
        markersRef.current.push(marker);
        bounds.extend({ lat: d.lat, lng: d.lng });
        hasPoints = true;
      });

      // Dibujar bodegas de regreso únicas
      const endDepots = routes
        .map((r) => r.endDepot ?? r.depot)
        .filter((ed) => !uniqueDepots.some((d) => d.id === ed.id));
      const uniqueEndDepots = Array.from(new Map(endDepots.map((d) => [d.id, d])).values());

      uniqueEndDepots.forEach((d) => {
        const marker = new google.maps.Marker({
          position: { lat: d.lat, lng: d.lng },
          map,
          icon: makeSvgIcon(endDepotSvg(), 36, 46, 18, 46),
        });
        addInfoWindow(
          marker,
          `<b>🏁 Bodega de regreso: ${d.name}</b><br/><small>${d.address}</small>`
        );
        markersRef.current.push(marker);
        bounds.extend({ lat: d.lat, lng: d.lng });
        hasPoints = true;
      });

      // Dibujar rutas
      routes.forEach((route) => {
        const startCoord = { lat: route.depot.lat, lng: route.depot.lng };
        const endCoord = {
          lat: (route.endDepot ?? route.depot).lat,
          lng: (route.endDepot ?? route.depot).lng,
        };

        // Pintar alternativas con línea punteada gris
        if (route.alternatives && route.alternatives.length > 0) {
          route.alternatives.forEach((altPoly) => {
            const altLine = new google.maps.Polyline({
              path: altPoly.map(([lat, lng]) => ({ lat, lng })),
              map,
              strokeColor: '#94A3B8',
              strokeOpacity: 0,
              icons: [
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 0.8,
                    scale: 2,
                    strokeWeight: 3,
                  },
                  offset: '0',
                  repeat: '12px',
                },
              ],
            });
            markersRef.current.push(altLine);
          });
        }

        // Pintar ruta principal
        if (route.polyline && route.polyline.length > 0) {
          const mainLine = new google.maps.Polyline({
            path: route.polyline.map(([lat, lng]) => ({ lat, lng })),
            map,
            strokeColor: route.color,
            strokeOpacity: 0.9,
            strokeWeight: 5,
          });
          markersRef.current.push(mainLine);

          // Si la ruta no termina exacto en la bodega, trazar línea final punteada
          const last = route.polyline[route.polyline.length - 1];
          if (Math.abs(last[0] - endCoord.lat) > 0.0002 || Math.abs(last[1] - endCoord.lng) > 0.0002) {
            const closingLine = new google.maps.Polyline({
              path: [
                { lat: last[0], lng: last[1] },
                { lat: endCoord.lat, lng: endCoord.lng },
              ],
              map,
              strokeColor: route.color,
              strokeOpacity: 0,
              icons: [
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 0.6,
                    scale: 2,
                    strokeWeight: 3,
                  },
                  offset: '0',
                  repeat: '10px',
                },
              ],
            });
            markersRef.current.push(closingLine);
          }
        } else {
          // Fallback: líneas rectas
          const stopsCoords = route.stops
            .filter((s) => s.address.lat !== null && s.address.lng !== null)
            .map((s) => ({ lat: s.address.lat!, lng: s.address.lng! }));

          const coordArray = [startCoord, ...stopsCoords, endCoord];
          if (coordArray.length >= 2) {
            const polyline = new google.maps.Polyline({
              path: coordArray,
              map,
              strokeColor: route.color,
              strokeOpacity: 0.85,
              strokeWeight: 4,
            });
            markersRef.current.push(polyline);
          }
        }

        // Paradas de la ruta
        route.stops.forEach((stop, idx) => {
          if (stop.address.lat === null || stop.address.lng === null) return;
          const lat = stop.address.lat;
          const lng = stop.address.lng;

          const marker = new google.maps.Marker({
            position: { lat, lng },
            map,
            icon: makeSvgIcon(driverSvg(route.color, idx + 1), 32, 42, 16, 42),
          });

          addInfoWindow(
            marker,
            `
            <div style="font-family:Inter,sans-serif;min-width:160px;padding:2px">
              <div style="font-weight:600;color:${route.color};margin-bottom:4px">
                Parada ${stop.sequence} · ${route.driverName}
              </div>
              <div style="font-weight:500;color:#1e293b">${stop.address.name}</div>
              <div style="font-size:12px;color:#64748b;margin-top:2px">${stop.address.raw}</div>
            </div>
            `
          );

          markersRef.current.push(marker);
          bounds.extend({ lat, lng });
          hasPoints = true;
        });
      });
    } else {
      // Sin rutas: mostrar depósito global + direcciones individuales
      if (depot) {
        const marker = new google.maps.Marker({
          position: { lat: depot.lat, lng: depot.lng },
          map,
          icon: makeSvgIcon(depotSvg(), 36, 46, 18, 46),
        });
        addInfoWindow(
          marker,
          `<b>🏭 Depósito</b><br/><small>${depot.label}</small>`
        );
        markersRef.current.push(marker);
        bounds.extend({ lat: depot.lat, lng: depot.lng });
        hasPoints = true;
      }

      addresses
        .filter((a) => a.lat !== null && a.lng !== null)
        .forEach((addr) => {
          const marker = new google.maps.Marker({
            position: { lat: addr.lat!, lng: addr.lng! },
            map,
            icon: makeSvgIcon(driverSvg('#64748B', '·'), 32, 42, 16, 42),
          });
          addInfoWindow(
            marker,
            `
            <div style="font-family:Inter,sans-serif;padding:2px">
              <div style="font-weight:500;color:#1e293b">${addr.name}</div>
              <div style="font-size:12px;color:#64748b">${addr.raw}</div>
            </div>
            `
          );
          markersRef.current.push(marker);
          bounds.extend({ lat: addr.lat!, lng: addr.lng! });
          hasPoints = true;
        });
    }

    if (hasPoints) {
      map.fitBounds(bounds);
      // Evitar zoom demasiado alto si sólo hay un punto
      const listener = map.addListener('bounds_changed', () => {
        if (map.getZoom()! > 16) {
          map.setZoom(16);
        }
        google.maps.event.removeListener(listener);
      });
    }
  }, [addresses, routes, depot, mapInitialized]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ minHeight: '400px', backgroundColor: '#0f172a' }}
    />
  );
}
