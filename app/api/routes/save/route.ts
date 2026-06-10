import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { routes, globalConfig, date, user } = await req.json();

    const totalDeliveries = routes.reduce((acc: number, r: any) => acc + r.stops.length, 0);
    const totalDrivers = routes.length;

    // Obtener versión anterior
    const { data: previousRoutes } = await supabaseAdmin
      .from('routes')
      .select('version, id')
      .eq('date', date)
      .eq('is_latest', true)
      .order('version', { ascending: false })
      .limit(1);

    const version = previousRoutes && previousRoutes.length > 0 ? previousRoutes[0].version + 1 : 1;
    const parentRouteId = previousRoutes && previousRoutes.length > 0 ? previousRoutes[0].id : null;

    // Desactivar is_latest de la anterior
    if (parentRouteId) {
      await supabaseAdmin
        .from('routes')
        .update({ is_latest: false })
        .eq('id', parentRouteId);
    }

    const { data, error } = await supabaseAdmin
      .from('routes')
      .insert({
        date,
        depot_id: globalConfig?.departureDepot?.id,
        return_depot_id: globalConfig?.returnDepot?.id || globalConfig?.departureDepot?.id,
        departure_time: globalConfig?.departureTime,
        status: 'draft',
        total_deliveries: totalDeliveries,
        total_drivers: totalDrivers,
        created_by: user,
        version,
        parent_route_id: parentRouteId,
        is_latest: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving to supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error en save route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
