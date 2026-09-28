import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/routes/summary?code=RT-20260928-004
 * Resumen de una ruta para la ventana flotante de las notificaciones:
 * chofer y facturas agrupables por parada. Solo lectura.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics', 'viewer']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const code = (new URL(req.url).searchParams.get('code') || '').trim();
    if (!code) {
      return NextResponse.json({ ok: false, error: 'Falta el código de ruta' }, { status: 400 });
    }

    // La versión vigente de la ruta (una ruta reoptimizada conserva el código)
    const { data: route, error: rErr } = await supabaseAdmin
      .from('routes')
      .select('id, route_code, route_alias, date, status, closure_status')
      .eq('route_code', code)
      .order('is_latest', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rErr) throw new Error('Error leyendo la ruta: ' + rErr.message);
    if (!route) {
      return NextResponse.json({ ok: false, error: 'No se encontró la ruta ' + code }, { status: 404 });
    }

    const [{ data: rd, error: dErr }, { data: deliveries, error: delErr }] = await Promise.all([
      supabaseAdmin.from('route_drivers').select('drivers(name)').eq('route_id', route.id).limit(1).maybeSingle(),
      supabaseAdmin
        .from('deliveries')
        .select('id, invoice, client_name, address, status, stop_order, merchandise_value, is_pending')
        .eq('route_id', route.id)
        .order('stop_order', { ascending: true, nullsFirst: false }),
    ]);
    if (dErr) throw new Error('Error leyendo el chofer: ' + dErr.message);
    if (delErr) throw new Error('Error leyendo las entregas: ' + delErr.message);

    const driverName = ((rd?.drivers as unknown) as { name?: string } | null)?.name ?? null;

    return NextResponse.json({ ok: true, route: { ...route, driver_name: driverName }, deliveries: deliveries || [] });
  } catch (err) {
    console.error('[routes/summary]', err);
    return NextResponse.json({ ok: false, error: 'Error cargando la ruta' }, { status: 500 });
  }
}
