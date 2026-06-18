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
      // 1. Insertar ruta principal
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

      // 2. Buscar el driver_id por nombre
      const { data: driverData } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('name', route.driverName)
        .single();

      const driverId = driverData?.id || null;

      // 3. Insertar en route_drivers para vincular chofer ↔ ruta
      let routeDriverId: string | null = null;
      if (driverId) {
        // Buscar vehicle_id por placa (matricula)
        const { data: vehicleData } = await supabaseAdmin
          .from('vehicles')
          .select('id')
          .eq('plate', route.matricula || '')
          .single();

        const vehicleId = vehicleData?.id || null;

        const { data: rdData, error: rdErr } = await supabaseAdmin
          .from('route_drivers')
          .insert({
            route_id: routeData.id,
            driver_id: driverId,
            vehicle_id: vehicleId,
            departure_time: route.departureTime
              ? new Date(route.departureTime).toTimeString().slice(0, 5)
              : '08:00',
            color: route.color,
            route_order: 1,
            total_km: (route.totalDistance || 0) / 1000,
            total_time_min: Math.round((route.totalDuration || 0) / 60),
            created_at: now.toISOString(),
          })
          .select()
          .single();

        if (!rdErr && rdData) routeDriverId = rdData.id;
      }

      // 4. Insertar entregas con route_driver_id y merchandise_value
      const deliveries = route.stops.map(stop => ({
        route_id: routeData.id,
        route_driver_id: routeDriverId,
        invoice: stop.address.invoice || 'SIN-FACTURA',
        client_name: stop.address.clientName || stop.address.name || '',
        address: stop.address.raw || '',
        lat: stop.address.lat,
        lng: stop.address.lng,
        geocoded: stop.address.geocoded || false,
        stop_order: stop.sequence,
        status: 'pending',
        merchandise_value: (stop.address as any).merchandiseValue || null,
      }));

      const { error: deliveriesErr } = await supabaseAdmin
        .from('deliveries')
        .insert(deliveries);

      if (deliveriesErr) throw new Error(`Error guardando entregas: ${deliveriesErr.message}`);

      // 5. Audit
      await supabaseAdmin.from('audit_log').insert({
        action: 'Aceptar ruta',
        entity: 'ruta',
        entity_id: routeData.id,
        user_name: userName,
        user_role: userRole,
        ip_address: ip,
        user_agent: req.headers.get('user-agent') || 'unknown',
        module: 'Rutas',
        metadata: {
          route_code: routeData.route_code,
          deliveries_count: route.stops.length,
          driver_name: route.driverName,
          driver_id: driverId,
          vehicle_id: route.vehicleId,
          total_km: (route.totalDistance || 0) / 1000,
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
