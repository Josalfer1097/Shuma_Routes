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
      // Buscar depot_id por coordenadas (tolerancia de 0.001 grados)
      let depotId: string | null = null;
      let returnDepotId: string | null = null;

      if (route.depot?.lat && route.depot?.lng) {
        const { data: depotData } = await supabaseAdmin
          .from('depots')
          .select('id')
          .gte('lat', route.depot.lat - 0.001)
          .lte('lat', route.depot.lat + 0.001)
          .gte('lng', route.depot.lng - 0.001)
          .lte('lng', route.depot.lng + 0.001)
          .single();
        depotId = depotData?.id || null;
      }

      if (route.endDepot?.lat && route.endDepot?.lng) {
        const { data: returnData } = await supabaseAdmin
          .from('depots')
          .select('id')
          .gte('lat', route.endDepot.lat - 0.001)
          .lte('lat', route.endDepot.lat + 0.001)
          .gte('lng', route.endDepot.lng - 0.001)
          .lte('lng', route.endDepot.lng + 0.001)
          .single();
        returnDepotId = returnData?.id || null;
      }

      const { data: routeData, error: routeErr } = await supabaseAdmin
        .from('routes')
        .insert({
          date: now.toISOString().split('T')[0],
          depot_id: depotId,
          return_depot_id: returnDepotId,
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

      // 2. Buscar driver_id usando la matricula (plate) del vehículo — más confiable que el nombre
      let driverId: string | null = null;
      let vehicleIdFromDb: string | null = null;

      console.log(`[accept] route.matricula="${route.matricula}" route.driverName="${route.driverName}"`);

      if (route.matricula) {
        const { data: vehicleData, error: vErr } = await supabaseAdmin
          .from('vehicles')
          .select('id, plate')
          .eq('plate', route.matricula)
          .single();

        console.log(`[accept] vehicle lookup plate="${route.matricula}":`, vehicleData, vErr?.message);
        vehicleIdFromDb = vehicleData?.id || null;

        if (vehicleIdFromDb) {
          const { data: driverData, error: dErr } = await supabaseAdmin
            .from('drivers')
            .select('id, name, vehicle_id, active')
            .eq('vehicle_id', vehicleIdFromDb)
            .single();  // quitamos .eq('active', true) temporalmente para ver si hay driver

          console.log(`[accept] driver lookup vehicle_id="${vehicleIdFromDb}":`, driverData, dErr?.message);
          if (driverData?.active) {
            driverId = driverData.id;
          } else if (driverData) {
            console.log(`[accept] driver encontrado pero active=${driverData.active} — usando de todas formas`);
            driverId = driverData.id; // usar aunque active sea false
          }
        }
      }

      // Fallback por nombre
      if (!driverId && route.driverName) {
        const { data: driverByName, error: dnErr } = await supabaseAdmin
          .from('drivers')
          .select('id, name')
          .ilike('name', route.driverName.trim())
          .single();
        console.log(`[accept] fallback by name "${route.driverName}":`, driverByName, dnErr?.message);
        driverId = driverByName?.id || null;
      }

      console.log(`[accept] FINAL driverId="${driverId}" vehicleIdFromDb="${vehicleIdFromDb}"`);

      // 3. Insertar en route_drivers para vincular chofer ↔ ruta
      let routeDriverId: string | null = null;
      if (driverId) {
        // vehicleIdFromDb ya fue buscado arriba por matricula
        const vehicleId = vehicleIdFromDb;

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
        driver_id: driverId,
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
