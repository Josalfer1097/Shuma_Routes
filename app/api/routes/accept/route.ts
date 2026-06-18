import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { Route } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { routes, userName, userRole }: { routes: Route[]; userName: string; userRole: string } =
      await req.json();

    if (!routes || routes.length === 0) {
      return NextResponse.json({ ok: false, error: 'No hay rutas para guardar' }, { status: 400 });
    }

    const now = new Date();
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    for (const route of routes) {
      // 1. Insertar ruta
      const { data: routeData, error: routeErr } = await supabaseAdmin
        .from('routes')
        .insert({
          date: now.toISOString().split('T')[0],
          departure_time: route.departureTime
            ? new Date(route.departureTime).toTimeString().slice(0, 5)
            : '08:00',
          status: 'optimized',
          total_deliveries: route.stops.length,
          total_drivers: 1,
          created_by: userName,
          version: 1,
          is_latest: true,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .select()
        .single();

      if (routeErr) throw new Error(`Error guardando ruta: ${routeErr.message}`);

      // 2. Insertar entregas
      const deliveries = route.stops.map(stop => ({
        route_id: routeData.id,
        invoice: stop.address.invoice || 'SIN-FACTURA',
        client_name: stop.address.name || stop.address.clientName || '',
        address: stop.address.raw || '',
        lat: stop.address.lat,
        lng: stop.address.lng,
        geocoded: stop.address.geocoded || false,
        stop_order: stop.sequence,
        status: 'pending',
      }));

      const { error: deliveriesErr } = await supabaseAdmin.from('deliveries').insert(deliveries);
      if (deliveriesErr) throw new Error(`Error guardando entregas: ${deliveriesErr.message}`);

      // 3. Registrar en audit_log
      await supabaseAdmin.from('audit_log').insert({
        action: 'route_accepted',
        entity: 'route',
        entity_id: routeData.id,
        user_name: userName,
        user_role: userRole,
        ip_address: ip,
        user_agent: req.headers.get('user-agent') || 'unknown',
        module: 'route',
        metadata: {
          deliveries_count: route.stops.length,
          vehicle_id: route.vehicleId,
          driver_name: route.driverName,
          total_duration_sec: route.totalDuration,
          total_distance_m: route.totalDistance,
        },
        created_at: now.toISOString(),
      });
    }

    return NextResponse.json({ ok: true, saved: routes.length });
  } catch (err) {
    console.error('Accept route error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
