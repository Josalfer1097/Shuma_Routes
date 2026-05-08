/**
 * lib/here.ts
 * Integración con HERE Routing API v8 para obtener geometría de rutas.
 * Usa @here/flexpolyline para decodificar la polyline de respuesta.
 */

const HERE_API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY!;
const HERE_ROUTER  = 'https://router.hereapi.com/v8/routes';

export interface HERERouteResult {
  /** Polyline principal [lat, lng][] */
  polyline: [number, number][];
  /** Rutas alternativas (hasta 2) */
  alternatives: [number, number][][];
}

/**
 * Decodifica una sección de HERE flexpolyline en [lat, lng][].
 */
async function decodeSection(sectionPolyline: string): Promise<[number, number][]> {
  const { decode } = await import('@here/flexpolyline');
  const decoded = decode(sectionPolyline);
  return decoded.polyline.map((pt: number[]) => [pt[0], pt[1]] as [number, number]);
}

/**
 * Obtiene la geometría real de una ruta usando HERE Routing API v8.
 * Devuelve la ruta principal y hasta 2 alternativas.
 * Las coordenadas de entrada y salida son [lat, lng].
 */
export async function getRouteHERE(
  waypoints: [number, number][]
): Promise<HERERouteResult> {
  if (waypoints.length < 2) {
    throw new Error('Se necesitan al menos 2 waypoints para calcular una ruta HERE.');
  }

  const [origin, ...rest] = waypoints;
  const destination = rest[rest.length - 1];
  const vias = rest.slice(0, -1);

  const params = new URLSearchParams({
    apiKey:        HERE_API_KEY,
    transportMode: 'car',
    return:        'polyline',
    departureTime: 'now',
    alternatives:  '2',
    origin:        `${origin[0]},${origin[1]}`,
    destination:   `${destination[0]},${destination[1]}`,
  });

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
  const routes: { sections: { polyline: string }[] }[] = data?.routes ?? [];

  if (routes.length === 0) {
    throw new Error('HERE no devolvió ninguna ruta.');
  }

  // Decodificar ruta principal (índice 0)
  const mainCoords: [number, number][] = [];
  for (const section of routes[0].sections) {
    const pts = await decodeSection(section.polyline);
    mainCoords.push(...pts);
  }

  // Decodificar alternativas (índices 1, 2)
  const alternatives: [number, number][][] = [];
  for (let i = 1; i < routes.length; i++) {
    const altCoords: [number, number][] = [];
    for (const section of routes[i].sections) {
      const pts = await decodeSection(section.polyline);
      altCoords.push(...pts);
    }
    alternatives.push(altCoords);
  }

  return { polyline: mainCoords, alternatives };
}
