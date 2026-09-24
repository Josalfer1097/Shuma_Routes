/**
 * Configuración única del SDK de Google Maps para toda la app.
 *
 * El paquete @googlemaps/js-api-loader toca `window` al importarse, así que
 * se carga con import() dinámico: solo se evalúa en el navegador y nunca
 * durante el pre-renderizado del servidor (antes esto rompía el build de
 * /dispatcher en cuanto un componente no dinámico importaba el SDK).
 *
 * setOptions() solo debe llamarse una vez; el mapa, las zonas y el buscador
 * de direcciones comparten esta configuración.
 */
let configured: Promise<typeof import('@googlemaps/js-api-loader')> | null = null;

export function ensureMapsLoader(): Promise<typeof import('@googlemaps/js-api-loader')> {
  if (!configured) {
    configured = import('@googlemaps/js-api-loader').then(loader => {
      loader.setOptions({
        key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        v: 'weekly',
        language: 'es',
        region: 'MX',
      });
      return loader;
    });
  }
  return configured;
}

export async function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  const loader = await ensureMapsLoader();
  return loader.importLibrary('places');
}
