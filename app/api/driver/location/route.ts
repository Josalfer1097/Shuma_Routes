import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { driverId, routeId, lat, lng, accuracy } = await req.json();

    if (!driverId || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
    }

    // Validación de rango: coordenadas geográficas válidas
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ ok: false, error: 'Coordenadas inválidas' }, { status: 400 });
    }

    // El chofer debe existir y estar activo
    const { data: driver, error: dErr } = await supabaseAdmin
      .from('drivers')
      .select('id, active')
      .eq('id', driverId)
      .single();

    if (dErr || !driver || !driver.active) {
      return NextResponse.json({ ok: false, error: 'Chofer no válido' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('driver_locations')
      .upsert({
        driver_id:  driverId,
        route_id:   routeId || null,
        lat,
        lng,
        accuracy:   accuracy ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'driver_id' });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[api/driver/location] error:', err);
    return NextResponse.json({ ok: false, error: 'Error al guardar ubicación' }, { status: 500 });
  }
}
