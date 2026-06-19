import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { routes, globalConfig, date, user } = await req.json();

    const totalDeliveries = routes.reduce((acc: number, r: any) => acc + r.stops.length, 0);
    const totalDrivers    = routes.length;

    // ── Fix departure_time: asegurar formato HH:MM:SS ──
    const rawTime = globalConfig?.departureTime || '08:00';
    const departureTime = /^\d{2}:\d{2}$/.test(rawTime)
      ? `${rawTime}:00`   // "14:05" → "14:05:00"
      : /^\d{2}:\d{2}:\d{2}$/.test(rawTime)
        ? rawTime          // ya tiene segundos
        : '08:00:00';

    // ── Fix depot_id: buscar UUID en Supabase por coordenadas ──
    let depotId: string | null = null;
    let returnDepotId: string | null = null;

    const depLat = globalConfig?.departureDepot?.lat;
    const depLng = globalConfig?.departureDepot?.lng;
    const retLat = globalConfig?.returnDepot?.lat ?? depLat;
    const retLng = globalConfig?.returnDepot?.lng ?? depLng;

    if (depLat && depLng) {
      const { data: depotData } = await supabaseAdmin
        .from('depots')
        .select('id')
        .gte('lat', depLat - 0.001).lte('lat', depLat + 0.001)
        .gte('lng', depLng - 0.001).lte('lng', depLng + 0.001)
        .single();
      depotId = depotData?.id || null;
    }

    if (retLat && retLng) {
      const { data: retData } = await supabaseAdmin
        .from('depots')
        .select('id')
        .gte('lat', retLat - 0.001).lte('lat', retLat + 0.001)
        .gte('lng', retLng - 0.001).lte('lng', retLng + 0.001)
        .single();
      returnDepotId = retData?.id || depotId;
    }

    // ── Versionado ──
    const { data: previousRoutes } = await supabaseAdmin
      .from('routes')
      .select('version, id')
      .eq('date', date)
      .eq('is_latest', true)
      .order('version', { ascending: false })
      .limit(1);

    const version       = previousRoutes?.length ? previousRoutes[0].version + 1 : 1;
    const parentRouteId = previousRoutes?.length ? previousRoutes[0].id : null;

    if (parentRouteId) {
      await supabaseAdmin.from('routes').update({ is_latest: false }).eq('id', parentRouteId);
    }

    const { data, error } = await supabaseAdmin
      .from('routes')
      .insert({
        date,
        depot_id:        depotId,
        return_depot_id: returnDepotId,
        departure_time:  departureTime,
        status:          'draft',
        total_deliveries: totalDeliveries,
        total_drivers:    totalDrivers,
        created_by:       user,
        version,
        parent_route_id: parentRouteId,
        is_latest:       true,
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
