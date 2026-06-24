'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions } from '@googlemaps/js-api-loader';
import { formatDuration, formatDistance } from '@/lib/osrm';
import type { Address, Route } from '@/types';

interface Props {
  addresses: Address[];
  routes: Route[];
  depot: { lat: number; lng: number; label: string } | null;
  hiddenRouteIds?: string[];
  liveDeliveryStatus?: Record<string, string>;
}

// ── Helpers para crear marcadores personalizados (HTML) ───────────

function createDepotPin(title: string, color: string, scale: number = 1) {
  const div = document.createElement('div');
  div.className = 'flex flex-col items-center';
  // Traslación y escala solicitada, además de agregar filtro drop-shadow
  div.style.transform = `translate(0, -10px) scale(${scale})`;
  div.style.filter = 'drop-shadow(0px 4px 6px rgba(0,0,0,0.6))';
  div.innerHTML = `
    <div style="background-color: ${color};" class="text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-md border border-white mb-0.5 whitespace-nowrap">
      ${title}
    </div>
    <div class="text-3xl drop-shadow-md leading-none">🏭</div>
  `;
  return div;
}

function createStopPin(number: string | number, statusColor?: string) {
  const div = document.createElement('div');
  div.className = 'flex items-center justify-center rounded-full border-[3px] font-bold text-sm shadow-md transition-colors';
  div.style.backgroundColor = statusColor || '#FFFFFF';
  div.style.borderColor = '#FF6B00';
  div.style.color = statusColor === '#22c55e' || statusColor === '#ef4444' ? '#FFFFFF' : '#000000';
  div.style.width = '28px';
  div.style.height = '28px';
  div.textContent = String(number);
  return div;
}

export default function MapView({ addresses, routes, depot, hiddenRouteIds = [], liveDeliveryStatus = {} }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<any[]>([]);
  const routeLayersRef = useRef<{ [vehicleId: string]: any[] }>({});
  const [mapInitialized, setMapInitialized] = useState(false);

  // ── Inicializar Google Maps ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let active = true;

    const initMap = async () => {
      setOptions({
        key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        v: 'weekly',
      });

      // Importar librerías requeridas (maps y marker para AdvancedMarkerElement)
      const { Map, InfoWindow } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary;
      await google.maps.importLibrary('marker');

      if (!active || !containerRef.current || mapRef.current) return;

      const map = new Map(containerRef.current, {
        center: { lat: 19.4326, lng: -99.1332 }, // CDMX
        zoom: 12,
        mapId: 'shuma-rutas-map', // Requerido para AdvancedMarkerElement
        mapTypeControl: true,     // Alternar roadmap y satellite
        streetViewControl: false,
        fullscreenControl: false,
      });

      // Capa de tráfico en tiempo real
      const trafficLayer = new google.maps.TrafficLayer();
      trafficLayer.setMap(map);

      mapRef.current = map;
      infoWindowRef.current = new InfoWindow();
      setMapInitialized(true);
    };

    initMap().catch(err => console.error('Error loading Google Maps API:', err));

    return () => {
      active = false;
      markersRef.current.forEach((obj) => {
        if (typeof obj.setMap === 'function') obj.setMap(null);
        else obj.map = null;
      });
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
    markersRef.current.forEach((obj) => {
      if (typeof obj.setMap === 'function') obj.setMap(null); // Polylines
      else obj.map = null; // AdvancedMarkerElement
    });
    markersRef.current = [];
    routeLayersRef.current = {};

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    const { AdvancedMarkerElement } = google.maps.marker;
    const { Polyline, SymbolPath } = google.maps;

    const addInfoWindow = (marker: google.maps.marker.AdvancedMarkerElement, htmlContent: string) => {
      // Usar gmp-click para AdvancedMarkerElement (evita warning de consola)
      marker.addEventListener('gmp-click', () => {
        if (infoWindowRef.current) {
          infoWindowRef.current.setContent(htmlContent);
          infoWindowRef.current.open({
            map,
            anchor: marker,
          });
        }
      });
    };

    if (routes.length > 0) {
      // Dibujar bodegas de salida únicas
      const uniqueDepots = Array.from(new Map(routes.map((r) => [r.depot.id, r.depot])).values());
      uniqueDepots.forEach((d) => {
        const marker = new AdvancedMarkerElement({
          position: { lat: d.lat, lng: d.lng },
          map,
          content: createDepotPin('SALIDA', '#F97316', 1.4), // Naranja, escala 1.4 y sombra
        });
        let depTimeStr = '—';
        const routeForDepot = routes.find(r => r.depot.id === d.id);
        if (routeForDepot && routeForDepot.departureTime) {
          const dDate = new Date(routeForDepot.departureTime);
          depTimeStr = dDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        addInfoWindow(marker, `<div style="font-family:sans-serif;padding:6px;color:#333;min-width:200px;">
          <b style="font-size:14px;">🏭 ${d.name}</b><br/>
          <small style="color:#666;display:block;margin:4px 0;">${d.address}</small>
          <small style="color:#1E3A8A;"><b>Salida configurada:</b> ${depTimeStr}</small>
        </div>`);
        markersRef.current.push(marker);
        bounds.extend({ lat: d.lat, lng: d.lng });
        hasPoints = true;
      });

      // Dibujar bodegas de regreso únicas (sólo si difieren de las de salida)
      const endDepots = routes
        .map((r) => r.endDepot ?? r.depot)
        .filter((ed) => !uniqueDepots.some((d) => d.id === ed.id));
      const uniqueEndDepots = Array.from(new Map(endDepots.map((d) => [d.id, d])).values());

      uniqueEndDepots.forEach((d) => {
        const marker = new AdvancedMarkerElement({
          position: { lat: d.lat, lng: d.lng },
          map,
          content: createDepotPin('REGRESO', '#FFD700', 1.4), // Amarillo, escala 1.4 y sombra
        });
        addInfoWindow(marker, `<div style="font-family:sans-serif;padding:6px;color:#333;min-width:200px;">
          <b style="font-size:14px;">🏁 Regreso: ${d.name}</b><br/>
          <small style="color:#666;display:block;margin:4px 0;">${d.address}</small>
        </div>`);
        markersRef.current.push(marker);
        bounds.extend({ lat: d.lat, lng: d.lng });
        hasPoints = true;
      });

      // Dibujar rutas (Polylines)
      routes.forEach((route) => {
        const isVisible = !hiddenRouteIds.includes(route.vehicleId);
        routeLayersRef.current[route.vehicleId] = [];

        // Pintar alternativas
        if (route.alternatives && route.alternatives.length > 0) {
          route.alternatives.forEach((altPoly) => {
            const altLine = new Polyline({
              path: altPoly.map(([lat, lng]) => ({ lat, lng })),
              map,
              visible: isVisible,
              strokeColor: '#FFFFFF', // Blanco punteado
              strokeOpacity: 0,
              zIndex: 1,
              icons: [
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 0.7, // Opacidad 0.7
                    scale: 2,
                    strokeWeight: 2,
                  },
                  offset: '0',
                  repeat: '10px', // Línea punteada
                },
              ],
            });
            markersRef.current.push(altLine);
            routeLayersRef.current[route.vehicleId].push(altLine);
          });
        }

        // Pintar ruta principal
        if (route.polyline && route.polyline.length > 0) {
          const path = route.polyline.map(([lat, lng]) => ({ lat, lng }));

          // Halo negro (stroke de 2px de cada lado sumado a los 6px de la línea principal = 10px)
          const haloLine = new Polyline({
            path,
            map,
            visible: isVisible,
            strokeColor: '#000000',
            strokeOpacity: 0.8,
            strokeWeight: 10,
            zIndex: 2,
          });
          markersRef.current.push(haloLine);
          routeLayersRef.current[route.vehicleId].push(haloLine);

          // Línea principal
          const mainLine = new Polyline({
            path,
            map,
            visible: isVisible,
            strokeColor: route.color || '#FF6B00',
            strokeOpacity: 1.0,
            strokeWeight: 6, // Grosor 6px
            zIndex: 3,
            icons: [
              {
                icon: {
                  path: SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 2.5,
                  strokeOpacity: 1,
                  fillOpacity: 1,
                  fillColor: '#FFFFFF', // Flechas direccionales blancas
                  strokeColor: '#000000',
                  strokeWeight: 1,
                },
                offset: '50px',
                repeat: '150px', // Cada 150px
              },
            ],
          });
          markersRef.current.push(mainLine);
          routeLayersRef.current[route.vehicleId].push(mainLine);
        }

        // Paradas de la ruta
        let accumulated = 0;
        route.stops.forEach((stop) => {
          if (stop.address.lat === null || stop.address.lng === null) return;
          const lat = stop.address.lat;
          const lng = stop.address.lng;

          if (stop.distance != null) {
            accumulated = stop.distance;
          }

          let stopStatusColor: string | undefined = undefined;
          if (stop.address.invoice) {
            const status = liveDeliveryStatus[stop.address.invoice];
            if (status === 'delivered' || status === 'completed') stopStatusColor = '#10B981';
            else if (status === 'partial') stopStatusColor = '#F59E0B';
            else if (status === 'failed') stopStatusColor = '#EF4444';
          }

          const marker = new AdvancedMarkerElement({
            position: { lat, lng },
            map: isVisible ? map : null,
            content: createStopPin(stop.sequence, stopStatusColor),
          });

          const distStr = accumulated > 0 ? formatDistance(accumulated) : '—';
          const etaStr = stop.eta != null ? formatDuration(stop.eta) : '—';

          const clientNameStr = stop.address.clientName || stop.address.name;
          const invoiceStr = stop.address.invoice ? `<div style="font-size:11px;color:#2563eb;margin-top:2px;font-weight:600;">Factura: ${stop.address.invoice}</div>` : '';
          
          let valStr = '';
          if (stop.address.merchandiseValue && stop.address.merchandiseValue > 0) {
            const isHighValue = stop.address.merchandiseValue >= 10000;
            const valColor = isHighValue ? '#f59e0b' : '#64748b';
            valStr = `<div style="font-size:11px;color:${valColor};margin-top:2px;font-weight:700;">💰 $${stop.address.merchandiseValue.toLocaleString('es-MX')}</div>`;
          }

          addInfoWindow(
            marker,
            `
            <div style="font-family:Inter,sans-serif;min-width:200px;padding:4px">
              <div style="font-weight:700;color:${route.color};margin-bottom:6px;font-size:14px;border-bottom:1px solid #e2e8f0;padding-bottom:4px">
                Parada ${stop.sequence} · ${route.driverName}
              </div>
              <div style="font-weight:600;color:#1e293b;font-size:13px">${clientNameStr}</div>
              ${invoiceStr}
              ${valStr}
              <div style="font-size:12px;color:#64748b;margin-top:4px;margin-bottom:8px">${stop.address.raw}</div>
              <div style="display:flex;justify-content:space-between;font-size:12px;color:#475569;background:#f8fafc;padding:6px;border-radius:4px">
                <div><b>Distancia:</b><br/>${distStr}</div>
                <div style="text-align:right"><b>ETA:</b><br/>${etaStr}</div>
              </div>
            </div>
            `
          );

          markersRef.current.push(marker);
          routeLayersRef.current[route.vehicleId].push(marker);
          bounds.extend({ lat, lng });
          hasPoints = true;
        });
      });
    } else {
      // Sin rutas: mostrar depósito global + direcciones (pantalla de geocodificación)
      if (depot) {
        const marker = new AdvancedMarkerElement({
          position: { lat: depot.lat, lng: depot.lng },
          map,
          content: createDepotPin('SALIDA', '#F97316', 1.4),
        });
        addInfoWindow(marker, `<div style="font-family:sans-serif;padding:4px;"><b>🏭 Depósito</b><br/><small>${depot.label}</small></div>`);
        markersRef.current.push(marker);
        bounds.extend({ lat: depot.lat, lng: depot.lng });
        hasPoints = true;
      }

      addresses
        .filter((a) => a.lat !== null && a.lng !== null)
        .forEach((addr) => {
          const marker = new AdvancedMarkerElement({
            position: { lat: addr.lat!, lng: addr.lng! },
            map,
            content: createStopPin('·'),
          });
          const clientNameStr = addr.clientName || addr.name;
          const invoiceStr = addr.invoice ? `<div style="font-size:11px;color:#2563eb;margin-top:2px;font-weight:600;">Factura: ${addr.invoice}</div>` : '';
          
          let valStr = '';
          if (addr.merchandiseValue && addr.merchandiseValue > 0) {
            const isHighValue = addr.merchandiseValue >= 10000;
            const valColor = isHighValue ? '#f59e0b' : '#64748b';
            valStr = `<div style="font-size:11px;color:${valColor};margin-top:2px;font-weight:700;">💰 $${addr.merchandiseValue.toLocaleString('es-MX')}</div>`;
          }

          addInfoWindow(
            marker,
            `
            <div style="font-family:Inter,sans-serif;padding:4px">
              <div style="font-weight:600;color:#1e293b;font-size:13px">${clientNameStr}</div>
              ${invoiceStr}
              ${valStr}
              <div style="font-size:12px;color:#64748b;margin-top:4px">${addr.raw}</div>
            </div>
            `
          );
          markersRef.current.push(marker);
          bounds.extend({ lat: addr.lat!, lng: addr.lng! });
          hasPoints = true;
        });
    }

    if (hasPoints) {
      // Zoom automático con padding de 60px
      map.fitBounds(bounds, 60);
      
      const listener = map.addListener('bounds_changed', () => {
        if (map.getZoom()! > 16) {
          map.setZoom(16);
        }
        google.maps.event.removeListener(listener);
      });
    }
  }, [addresses, routes, depot, mapInitialized]);

  // ── Toggle visibilidad de rutas (useEffect B) ─────────────────────────
  useEffect(() => {
    Object.entries(routeLayersRef.current).forEach(([vehicleId, elements]) => {
      const isVisible = !hiddenRouteIds.includes(vehicleId);
      elements.forEach((obj) => {
        if (typeof obj.setVisible === 'function') {
          obj.setVisible(isVisible); // Polylines
        } else {
          // AdvancedMarkerElement
          obj.map = isVisible ? mapRef.current : null;
        }
      });
    });
  }, [hiddenRouteIds]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-xl overflow-hidden shadow-inner"
      style={{ minHeight: '400px', backgroundColor: '#0f172a' }}
    />
  );
}
