/**
 * lib/here.ts
 * Integración con HERE Routing API v8 para obtener geometría de rutas.
 * Usa @here/flexpolyline para decodificar la polyline de respuesta.
 */

const HERE_API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY!;
const HERE_ROUTER  = 'https://router.hereapi.com/v8/routes';

/**
 * Obtiene la geometría real de una ruta usando HERE Routing API v8.
 * Las coordenadas de entrada y salida son [lat, lng].
 */
export async function getRouteHERE(
  waypoints: [number, number][]
): Promise<[number, number][]> {
  if (waypoints.length < 2) {
    throw new Error('Se necesitan al menos 2 waypoints para calcular una ruta HERE.');
  }

  // HERE espera origin/destination como parámetros separados y via para intermedios
  const [origin, ...rest] = waypoints;
  const destination = rest[rest.length - 1];
  const vias = rest.slice(0, -1);

  const params = new URLSearchParams({
    apiKey: HERE_API_KEY,
    transportMode: 'car',
    return: 'polyline',
    departureTime: 'now',
    'origin':      `${origin[0]},${origin[1]}`,
    'destination': `${destination[0]},${destination[1]}`,
  });

  // Agregar vías intermedias
  vias.forEach(([lat, lng]) => {
    params.append('via', `${lat},${lng}`);
  });

  const url = `${HERE_ROUTER}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HERE Routing error ${res.status}: ${text}`);
  }

  const data = await res.json();

  // Extraer la polyline flexible de la primera sección
  const sections: { polyline: string }[] = data?.routes?.[0]?.sections ?? [];
  if (sections.length === 0) {
    throw new Error('HERE no devolvió ninguna sección de ruta.');
  }

  // Decodificar todas las secciones y concatenar
  const { decode } = await import('@here/flexpolyline');

  const allCoords: [number, number][] = [];
  for (const section of sections) {
    const decoded = decode(section.polyline);
    // decoded.polyline devuelve [{ lat, lng, ... }]
    for (const pt of decoded.polyline) {
      allCoords.push([pt.lat, pt.lng]);
    }
  }

  return allCoords;
}
