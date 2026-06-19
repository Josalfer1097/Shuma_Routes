import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date')
      || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

    // 1. Obtener rutas del día
    const { data: routes, error: rErr } = await supabaseAdmin
      .from('routes')
      .select('id, route_code, route_alias, date, status, total_deliveries, departure_time, created_by')
      .eq('date', date)
      .eq('is_latest', true)
      .order('created_at', { ascending: true });

    if (rErr) throw rErr;
    if (!routes || routes.length === 0) {
      return NextResponse.json({ ok: true, routes: [] });
    }

    // 2. Para cada ruta, obtener sus route_drivers (choferes asignados)
    const routeIds = routes.map(r => r.id);

    const { data: routeDrivers } = await supabaseAdmin
      .from('route_drivers')
      .select('id, route_id, driver_id, color, total_km, total_time_min, drivers(name)')
      .in('route_id', routeIds);

    // 3. Conteo de entregas por status para cada ruta
    const { data: deliveries } = await supabaseAdmin
      .from('deliveries')
      .select('id, route_id, status')
      .in('route_id', routeIds);

    // 4. Construir respuesta enriquecida
    const result = routes.map(route => {
      const rd = (routeDrivers || []).find(d => d.route_id === route.id);
      const dels = (deliveries || []).filter(d => d.route_id === route.id);
      const delivered = dels.filter(d => d.status === 'delivered' || d.status === 'completed').length;
      const partial   = dels.filter(d => d.status === 'partial').length;
      const failed    = dels.filter(d => d.status === 'failed').length;
      const pending   = dels.filter(d => d.status === 'pending' || d.status === 'in_route').length;
      const total     = dels.length;

      return {
        id:           route.id,
        route_code:   route.route_code,
        route_alias:  route.route_alias,
        date:         route.date,
        status:       route.status,
        created_by:   route.created_by,
        departure_time: route.departure_time,
        driver_name:  (rd?.drivers as any)?.name || null,
        color:        rd?.color || '#2196F3',
        total_km:     rd?.total_km || 0,
        total_minutes: rd?.total_time_min || 0,
        stats: { total, delivered, partial, failed, pending },
      };
    });

    return NextResponse.json({ ok: true, routes: result });
  } catch (err) {
    console.error('[routes/active] Error:', err);
    return NextResponse.json({ ok: false, routes: [] }, { status: 500 });
  }
}
