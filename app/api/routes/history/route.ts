import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFilter = searchParams.get('date');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

    let query = supabaseAdmin
      .from('routes')
      .select('id, route_code, route_alias, date, status, total_deliveries, departure_time, created_by')
      .eq('is_latest', true);

    if (dateFilter) {
      query = query.eq('date', dateFilter);
    } else {
      query = query.lt('date', today);
    }

    query = query.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(100);

    const { data: routes, error: rErr } = await query;

    if (rErr) throw rErr;
    if (!routes || routes.length === 0) {
      return NextResponse.json({ ok: true, routes: [] });
    }

    const routeIds = routes.map(r => r.id);

    const { data: routeDrivers } = await supabaseAdmin
      .from('route_drivers')
      .select('id, route_id, driver_id, color, total_km, total_time_min, drivers(name)')
      .in('route_id', routeIds);

    const { data: deliveries } = await supabaseAdmin
      .from('deliveries')
      .select('id, route_id, route_driver_id, client_name, address, lat, lng, stop_order, status, invoice, merchandise_value')
      .in('route_id', routeIds)
      .order('stop_order', { ascending: true });

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
        deliveries: dels
          .filter(d => d.lat != null && d.lng != null)
          .map(d => ({
            sequence: d.stop_order ?? 0,
            status: d.status,
            address: {
              id: d.id,
              name: d.client_name || 'Cliente',
              clientName: d.client_name,
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
    console.error('[routes/history] Error:', err);
    return NextResponse.json({ ok: false, routes: [] }, { status: 500 });
  }
}
