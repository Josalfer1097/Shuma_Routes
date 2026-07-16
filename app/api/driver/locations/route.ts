import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  // Diagnóstico: verificar que las variables de entorno llegaron al servidor
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!hasUrl || !hasServiceKey) {
    console.error('[api/driver/locations] Faltan env vars:', { hasUrl, hasServiceKey });
    return NextResponse.json({
      ok: false,
      locations: {},
      diagnostico: `Env vars faltantes — URL: ${hasUrl}, SERVICE_KEY: ${hasServiceKey}`,
    }, { status: 500 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('driver_locations')
      .select('driver_id, lat, lng, updated_at');

    if (error) {
      console.error('[api/driver/locations] Error de Supabase:', error);
      return NextResponse.json({
        ok: false,
        locations: {},
        diagnostico: `Supabase: ${error.message} (code: ${error.code || 'n/a'}, hint: ${error.hint || 'n/a'})`,
      }, { status: 500 });
    }

    const locations: Record<string, { lat: number; lng: number; updated_at: string }> = {};
    (data || []).forEach(loc => {
      if (loc.driver_id && loc.lat != null && loc.lng != null) {
        locations[loc.driver_id] = { lat: loc.lat, lng: loc.lng, updated_at: loc.updated_at };
      }
    });

    return NextResponse.json({ ok: true, locations });
  } catch (err: any) {
    console.error('[api/driver/locations] error inesperado:', err);
    return NextResponse.json({
      ok: false,
      locations: {},
      diagnostico: `Excepción: ${err?.message || String(err)}`,
    }, { status: 500 });
  }
}
