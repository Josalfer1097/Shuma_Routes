const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

/**
 * Geocodifica una dirección usando Google Geocoding API via fetch.
 * Evita bloqueos y retorna null si no se encontraron resultados o hay errores.
 */
export async function geocodeAddress(
  query: string,
  countryCode = 'mx'
): Promise<{ lat: number; lng: number; label: string } | null> {
  if (!GOOGLE_API_KEY) {
    console.error('Falta la API Key de Google Maps');
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    query
  )}&key=${GOOGLE_API_KEY}&language=es&region=${countryCode.toUpperCase()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();

    if (data.status === 'ZERO_RESULTS') {
      return null;
    }

    if (data.status !== 'OK') {
      throw new Error(`Google Geocoder falló con status: ${data.status}`);
    }

    if (!data.results || data.results.length === 0) {
      return null;
    }

    const top = data.results[0];
    const lat = top.geometry.location.lat;
    const lng = top.geometry.location.lng;
    const label = top.formatted_address || query;

    return { lat, lng, label };
  } catch (err) {
    console.error('Error al geocodificar:', err);
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

/**
 * Obtiene la dirección a partir de coordenadas usando Google Maps Geocoding API via fetch.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  if (!GOOGLE_API_KEY) {
    console.error('Falta la API Key de Google Maps');
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}&language=es`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return null;
    }
    return data.results[0].formatted_address || null;
  } catch (err) {
    console.error('Error al hacer geocodificación inversa:', err);
    return null;
  }
}
