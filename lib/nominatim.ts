import { ensureMapsLoader } from '@/lib/googleMaps';

/**
 * Geocodificación con el Geocoder del SDK de Maps JavaScript.
 *
 * Antes se llamaba a la URL del servicio web (maps.googleapis.com/maps/api/geocode/json).
 * Ese servicio NO acepta llaves restringidas por sitio web ("API keys with referer
 * restrictions cannot be used with this API"), así que al restringir la llave del
 * navegador dejó de funcionar. El Geocoder del SDK sí respeta esa restricción.
 *
 * (El nombre del archivo es histórico: el proveedor original era Nominatim.)
 */

/** Sesgo al Valle de México: prioriza resultados de la zona sin excluir el resto. */
const VALLEY_BOUNDS: google.maps.LatLngBoundsLiteral = { south: 18.9, west: -99.6, north: 20.1, east: -98.6 };

let geocoderPromise: Promise<google.maps.Geocoder> | null = null;

function getGeocoder(): Promise<google.maps.Geocoder> {
  if (!geocoderPromise) {
    geocoderPromise = (async () => {
      const loader = await ensureMapsLoader();
      const { Geocoder } = await loader.importLibrary('geocoding');
      return new Geocoder();
    })().catch(err => {
      geocoderPromise = null; // permitir reintentar si falló la carga del SDK
      throw err;
    });
  }
  return geocoderPromise;
}

function errorCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

/**
 * Errores temporales según Google: UNKNOWN_ERROR ("puede funcionar si se reintenta")
 * y OVER_QUERY_LIMIT (ritmo). Se reintenta con esperas escalonadas.
 */
const RETRYABLE = new Set(['UNKNOWN_ERROR', 'OVER_QUERY_LIMIT']);
const RETRY_DELAYS_MS = [600, 1800];

async function runGeocode(request: google.maps.GeocoderRequest): Promise<google.maps.GeocoderResult[]> {
  const geocoder = await getGeocoder();
  for (let attempt = 0; ; attempt++) {
    try {
      const { results } = await geocoder.geocode(request);
      return results;
    } catch (err) {
      const code = errorCode(err);
      if (code === 'ZERO_RESULTS') return [];
      if (code && RETRYABLE.has(code) && attempt < RETRY_DELAYS_MS.length) {
        await new Promise(res => setTimeout(res, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Geocodifica una dirección. Devuelve null si no hay resultados;
 * lanza error si Google rechaza la petición (llave, permisos, red).
 */
export async function geocodeAddress(
  query: string,
  countryCode = 'mx'
): Promise<{ lat: number; lng: number; label: string } | null> {
  try {
    const results = await runGeocode({ address: query, region: countryCode, bounds: VALLEY_BOUNDS });
    if (results.length === 0) return null;
    const top = results[0];
    return {
      lat: top.geometry.location.lat(),
      lng: top.geometry.location.lng(),
      label: top.formatted_address || query,
    };
  } catch (err) {
    console.error('Error al geocodificar:', errorCode(err) ?? err);
    throw err;
  }
}

/**
 * Geocodifica un array de queries en serie con un retardo mínimo de 50ms.
 * Retorna un array paralelo con el resultado (o null si falló).
 */
export async function geocodeBatch(
  queries: string[],
  onProgress?: (index: number, total: number) => void
): Promise<({ lat: number; lng: number; label: string } | null)[]> {
  const results: ({ lat: number; lng: number; label: string } | null)[] = [];

  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await new Promise((res) => setTimeout(res, 50));
    try {
      const result = await geocodeAddress(queries[i]);
      results.push(result);
    } catch (err) {
      console.error('Error al geocodificar:', err);
      results.push(null);
    }
    onProgress?.(i + 1, queries.length);
  }

  return results;
}

/** Obtiene la dirección a partir de coordenadas. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const results = await runGeocode({ location: { lat, lng } });
    return results[0]?.formatted_address || null;
  } catch (err) {
    console.error('Error al hacer geocodificación inversa:', errorCode(err) ?? err);
    return null;
  }
}
