import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

import { decodeGooglePolyline } from '@/lib/here';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date')
      || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

    // 1. Obtener rutas NO cerradas (independiente de la fecha calendario —
    //    una ruta con entregas pendientes debe seguir visible hasta que se cierre formalmente)
    const { data: routes, error: rErr } = await supabaseAdmin
      .from('routes')
      .select('id, route_code, route_alias, date, status, total_deliveries, departure_time, created_by, polyline_encoded, closure_status')
      .eq('is_latest', true)
      .or('closure_status.is.null,closure_status.neq.approved')
      .order('created_at', { ascending: true });

    if (rErr) throw rErr;
    if (!routes || routes.length === 0) {
      return NextResponse.json({ ok: true, routes: [] });
    }

    // 2. Para cada ruta, obtener sus route_drivers (choferes asignados)
    const routeIds = routes.map(r => r.id);

    const { data: routeDrivers } = await supabaseAdmin
      .from('route_drivers')
      .select('id, route_id, driver_id, color, total_km, total_time_min, drivers(name, phone)')
      .in('route_id', routeIds);

    // 3. Conteo de entregas por status para cada ruta
    const { data: deliveries } = await supabaseAdmin
      .from('deliveries')
      .select('id, route_id, route_driver_id, client_name, address, lat, lng, stop_order, status, invoice, merchandise_value')
      .in('route_id', routeIds)
      .order('stop_order', { ascending: true });

    const DEPOTS: Record<string, { id: string; name: string; lat: number; lng: number }> = {
      san_pablo: { id: 'san_pablo', name: 'San Pablo', lat: 19.3550675, lng: -99.0939998 },
      division_norte: { id: 'division_norte', name: 'División del Norte', lat: 19.3464401, lng: -99.1501142 },
    };

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
        closure_status: (route as any).closure_status || 'none',
        created_by:   route.created_by,
        departure_time: route.departure_time,
        driver_name:  (rd?.drivers as any)?.name || null,
        phone:        (rd?.drivers as any)?.phone || null,
        color:        rd?.color || '#2196F3',
        total_km:     rd?.total_km || 0,
        total_minutes: rd?.total_time_min || 0,
        stats: { total, delivered, partial, failed, pending },
        depot: DEPOTS.san_pablo,
        endDepot: DEPOTS.san_pablo,
        polyline: route.polyline_encoded ? decodeGooglePolyline(route.polyline_encoded) : [],
        deliveries: dels
          .filter(d => d.lat != null && d.lng != null)
          .map(d => ({
            sequence: d.stop_order ?? 0,
            status: d.status,
            address: {
              id: d.id,
              name: d.client_name || 'Cliente',
              clientName: d.client_name,
              raw: d.address || '',
              invoice: d.invoice,
              merchandiseValue: d.merchandise_value,
              lat: d.lat,
              lng: d.lng,
              label: d.address || '',
              geocoded: true,
            },
          })),
      };
    });

    return NextResponse.json({ ok: true, routes: result });
  } catch (err) {
    console.error('[routes/active] Error:', err);
    return NextResponse.json({ ok: false, routes: [] }, { status: 500 });
  }
}
