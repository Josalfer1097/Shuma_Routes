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
    const resolveDepotId = async (
      depotObj: { lat?: number; lng?: number; name?: string; id?: string } | null | undefined
    ): Promise<string | null> => {
      if (!depotObj) return null;

      if (depotObj.lat && depotObj.lng) {
        const { data } = await supabaseAdmin
          .from('depots')
          .select('id, name')
          .gte('lat', depotObj.lat - 0.002)
          .lte('lat', depotObj.lat + 0.002)
          .gte('lng', depotObj.lng - 0.002)
          .lte('lng', depotObj.lng + 0.002)
          .limit(1)
          .single();

        if (data?.id) return data.id;
      }

      if (depotObj.name) {
        const searchName = depotObj.name.replace(/^bodega\s+/i, '').trim();
        const { data } = await supabaseAdmin
          .from('depots')
          .select('id, name')
          .ilike('name', `%${searchName}%`)
          .limit(1)
          .single();

        if (data?.id) return data.id;
      }

      return null;
    };

    const depotId = await resolveDepotId(globalConfig?.departureDepot);
    const returnDepotId = await resolveDepotId(globalConfig?.returnDepot) || depotId;

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
