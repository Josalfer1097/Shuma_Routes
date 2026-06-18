/**
   * lib/here.ts
   * Integración con Google Routes API para obtener geometría de rutas.
   */
  
  const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const GOOGLE_ROUTES_API = 'https://routes.googleapis.com/directions/v2:computeRoutes';
  
  export interface GoogleRouteResult {
    /** Polyline principal [lat, lng][] */
    polyline: [number, number][];
    /** Rutas alternativas (hasta 2) */
    alternatives: [number, number][][];
    distanceMeters: number;
    durationSeconds: number;
  }
  
  /**
   * Decodifica una Google encoded polyline (precisión 5) en [lat, lng][].
   */
  function decodeGooglePolyline(encoded: string): [number, number][] {
    const points: [number, number][] = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;
  
    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;
  
      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;
  
      points.push([lat / 100000, lng / 100000]);
    }
    return points;
  }
  
  /**
   * Obtiene la geometría real de una ruta usando Google Routes API.
   * Devuelve la ruta principal y hasta 2 alternativas.
   * Las coordenadas de entrada y salida son [lat, lng].
   */
  export async function getRouteGoogle(
    waypoints: [number, number][]
  ): Promise<GoogleRouteResult> {
    if (waypoints.length < 2) {
      throw new Error('Se necesitan al menos 2 waypoints para calcular una ruta.');
    }
  
    const [origin, ...rest] = waypoints;
    const destination = rest[rest.length - 1];
    const vias = rest.slice(0, -1);
  
    const intermediates = vias.map(([lat, lng]) => ({
      location: {
        latLng: {
          latitude: lat,
          longitude: lng,
        },
      },
    }));
  
    const body = {
      origin: {
        location: {
          latLng: {
            latitude: origin[0],
            longitude: origin[1],
          },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: destination[0],
            longitude: destination[1],
          },
        },
      },
      ...(intermediates.length > 0 ? { intermediates } : {}),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: true,
    };
  
    const res = await fetch(GOOGLE_ROUTES_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify(body),
    });
  
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Routes error ${res.status}: ${text}`);
    }
  
    const data = await res.json();
    const googleRoutes = data?.routes ?? [];
  
    if (googleRoutes.length === 0) {
      throw new Error('Google Routes no devolvió ninguna ruta.');
    }
  
    // Decodificar ruta principal (índice 0)
    const mainPolyline = decodeGooglePolyline(googleRoutes[0].polyline.encodedPolyline);
  
    // Decodificar alternativas (índices 1, 2)
    const alternatives: [number, number][][] = [];
    for (let i = 1; i < googleRoutes.length; i++) {
      const altEncoded = googleRoutes[i].polyline?.encodedPolyline;
      if (altEncoded) {
        alternatives.push(decodeGooglePolyline(altEncoded));
      }
    }
  
    const mainRoute = googleRoutes[0];
    const distanceMeters = mainRoute.distanceMeters || 0;
    const durationSeconds = parseInt(mainRoute.duration || '0s') || 0;

    return { polyline: mainPolyline, alternatives, distanceMeters, durationSeconds };
  }
