import type { NominatimResult } from '@/types';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'ShumaRutas/1.0 (contacto@shuma.mx)';

/** Delay entre llamadas para respetar el rate-limit de Nominatim (1 req/s) */
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Geocodifica una dirección usando Nominatim (OpenStreetMap).
 * Retorna null si no se encontraron resultados.
 */
export async function geocodeAddress(
  query: string,
  countryCode = 'mx'
): Promise<{ lat: number; lng: number; label: string } | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: countryCode,
    addressdetails: '0',
  });

  const res = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'es',
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim error ${res.status}: ${res.statusText}`);
  }

  const results: NominatimResult[] = await res.json();

  if (results.length === 0) return null;

  const top = results[0];
  return {
    lat: parseFloat(top.lat),
    lng: parseFloat(top.lon),
    label: top.display_name,
  };
}

/**
 * Geocodifica un array de queries en serie con rate-limit de 1s.
 * Retorna un array paralelo con el resultado (o null si falló).
 */
export async function geocodeBatch(
  queries: string[],
  onProgress?: (index: number, total: number) => void
): Promise<({ lat: number; lng: number; label: string } | null)[]> {
  const results: ({ lat: number; lng: number; label: string } | null)[] = [];

  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await delay(1100); // Nominatim: max 1 req/s
    try {
      const result = await geocodeAddress(queries[i]);
      results.push(result);
    } catch {
      results.push(null);
    }
    onProgress?.(i + 1, queries.length);
  }

  return results;
}

/**
 * Reverse geocoding: obtiene la dirección a partir de coordenadas.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    format: 'json',
  });

  const res = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'es',
    },
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data.display_name ?? null;
}
