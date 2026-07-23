import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['driver']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { searchParams } = new URL(req.url);
    const date     = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const driverId = session.user.driverId;

    if (!driverId) {
      return NextResponse.json({ ok: false, error: 'Sesión sin chofer asociado' }, { status: 400 });
    }

    // 1. Buscar route_drivers del día para este chofer
    const { data: routeDrivers, error: rdErr } = await supabaseAdmin
      .from('route_drivers')
      .select(`
        id,
        route_id,
        vehicle_id,
        departure_time,
        color,
        total_km,
        total_time_min,
        routes!inner (
          id,
          date,
          status,
          route_code,
          depot_id,
          return_depot_id,
          departure_time,
          closure_status
        )
      `)
      .eq('driver_id', driverId)
      .eq('routes.date', date)
      .eq('routes.is_latest', true)
      .limit(1)
      .single();

    if (rdErr || !routeDrivers) {
      return NextResponse.json({ ok: true, route: null });
    }

    // 2. Buscar entregas de este route_driver
    const { data: deliveries, error: dErr } = await supabaseAdmin
      .from('deliveries')
      .select('*')
      .eq('route_driver_id', routeDrivers.id)
      .order('stop_order', { ascending: true });

    if (dErr) throw dErr;

    // 3. Construir objeto Route compatible con el frontend
    const route = {
      routeDriverId: routeDrivers.id,
      routeId: routeDrivers.route_id,
      color: routeDrivers.color || '#2196F3',
      totalKm: routeDrivers.total_km,
      totalMinutes: routeDrivers.total_time_min,
      departureTime: routeDrivers.departure_time,
      routeCode: (routeDrivers.routes as any)?.route_code || null,
      closureStatus: (routeDrivers.routes as any)?.closure_status || 'none',
      stops: (deliveries || []).map(d => ({
        id: d.id,
        sequence: d.stop_order,
        status: d.status,
        address: {
          id:        d.id,
          name:      d.client_name || '',
          clientName: d.client_name || '',
          raw:       d.address,
          label:     d.address,
          invoice:   d.invoice,
          lat:       d.lat,
          lng:       d.lng,
          geocoded:  d.geocoded,
        },
        notes: d.notes,
      })),
    };

    return NextResponse.json({ ok: true, route });
  } catch (err) {
    console.error('[driver/route] Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
