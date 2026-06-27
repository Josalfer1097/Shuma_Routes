import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const [supabaseResult, googleResult] = await Promise.allSettled([
    supabaseAdmin.from('depots').select('name').limit(2),
    fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=19.3550675,-99.0939998&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&result_type=street_address`,
      { signal: AbortSignal.timeout(5000) }
    ).then(r => r.json()),
  ]);

  const supabaseOk =
    supabaseResult.status === 'fulfilled' && !supabaseResult.value.error;

  let googleOk = false;
  if (googleResult.status === 'fulfilled') {
    const status = googleResult.value?.status;
    googleOk = status === 'OK' || status === 'ZERO_RESULTS';
  }

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
            : supabaseResult.status === 'fulfilled' && supabaseResult.value.error
              ? supabaseResult.value.error.message
              : null,
        },
        google: {
          ok: googleOk,
          label: 'Google Maps API',
          error: googleResult.status === 'rejected'
            ? 'Sin respuesta'
            : !googleOk
              ? (googleResult.value?.status ?? 'Error desconocido')
              : null,
        },
      },
    },
    { status: allOk ? 200 : 503 }
  );
}
