import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Estado de servicios para la portada.
 *
 * Google Maps: la llave del navegador está restringida por sitio web, y los
 * servicios web de Google rechazan esas llaves desde un servidor
 * ("API keys with referer restrictions cannot be used with this API").
 * Por eso aquí solo se verifica que la llave esté configurada; el uso real
 * de Google (mapa, buscador, geocodificación) ocurre y falla visiblemente
 * en el navegador.
 */
export async function GET() {
  const supabaseResult = await Promise.allSettled([
    supabaseAdmin.from('depots').select('name').limit(2),
  ]).then(([r]) => r);

  const supabaseOk = supabaseResult.status === 'fulfilled' && !supabaseResult.value.error;

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const googleOk = mapsKey.length > 0;

  const allOk = supabaseOk && googleOk;

  return NextResponse.json(
    {
      ok: allOk,
      services: {
        supabase: {
          ok: supabaseOk,
          label: 'Supabase DB',
          error: supabaseResult.status === 'rejected'
            ? 'Sin respuesta'
            : supabaseResult.value.error
              ? supabaseResult.value.error.message
              : null,
        },
        google: {
          ok: googleOk,
          label: 'Google Maps (llave)',
          error: googleOk ? null : 'Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
        },
      },
    },
    { status: allOk ? 200 : 503 }
  );
}
