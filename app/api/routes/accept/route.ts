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
      // ── Resolver depot_id con fallback por nombre ──
      const resolveDepotId = async (
        depotObj: { lat?: number; lng?: number; name?: string; id?: string } | null | undefined
      ): Promise<string | null> => {
        if (!depotObj) return null;

        // Intento 1: buscar por coordenadas exactas con tolerancia
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

          if (data?.id) {
            console.log(`[accept] depot encontrado por coords: ${data.name} → ${data.id}`);
            return data.id;
          }
        }

        // Intento 2: buscar por nombre del depot
        if (depotObj.name) {
          // Normalizar: "San Pablo", "Bodega San Pablo", "División del Norte" → buscar substring
          const searchName = depotObj.name
            .replace(/^bodega\s+/i, '')   // quitar prefijo "Bodega "
            .trim();

          const { data } = await supabaseAdmin
            .from('depots')
            .select('id, name')
            .ilike('name', `%${searchName}%`)
            .limit(1)
            .single();

          if (data?.id) {
            console.log(`[accept] depot encontrado por nombre "${searchName}": ${data.name} → ${data.id}`);
            return data.id;
          }
        }

        console.warn(`[accept] depot NO encontrado — lat=${depotObj.lat} lng=${depotObj.lng} name=${depotObj.name}`);
        return null;
      };

      const depotId       = await resolveDepotId(route.depot);
      const returnDepotId = await resolveDepotId(
        route.endDepot?.lat ? route.endDepot : route.depot
      );

      console.log(`[accept] depotId="${depotId}" returnDepotId="${returnDepotId}"`);

      const { data: routeData, error: routeErr } = await supabaseAdmin
        .from('routes')
        .insert({
          date: now.toISOString().split('T')[0],
          depot_id: depotId,
          return_depot_id: returnDepotId,
          departure_time: (() => {
            if (!route.departureTime) return '08:00';
            // Si ya es HH:MM, usarlo directo
            if (/^\d{2}:\d{2}$/.test(route.departureTime)) return route.departureTime;
            // Si es ISO string, extraer la hora
            try {
              const d = new Date(route.departureTime);
              if (!isNaN(d.getTime())) return d.toTimeString().slice(0, 5);
            } catch { /* ignore */ }
            return '08:00';
          })(),
          status: 'optimized',
          total_deliveries: route.stops.length,
          total_drivers: 1,
          polyline_encoded: route.polylineEncoded || null,
          created_by: userName,
          version: 1,
          is_latest: true,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .select()
        .single();

      if (routeErr) throw new Error(`Error guardando ruta: ${routeErr.message}`);

      // 2. Buscar driver_id desde user_profiles (más confiable — tiene driver_id directo)
      let driverId: string | null = null;
      let vehicleIdFromDb: string | null = null;

      // Intentar por username (driverName en lowercase, sin espacios especiales)
      if (route.driverName) {
        const usernameGuess = route.driverName.toLowerCase()
          .replace(/\s+/g, '') // "El Derek" → "elderek"
          .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quitar acentos

        // También intentar con el primer token: "El Derek" → "derek", "Sultano" → "sultano"
        const firstToken = route.driverName.toLowerCase().split(' ').pop() || '';

        const { data: profileData } = await supabaseAdmin
          .from('user_profiles')
          .select('driver_id, username')
          .or(`username.eq.${usernameGuess},username.eq.${firstToken},username.ilike.%${firstToken}%`)
          .eq('role', 'driver')
          .not('driver_id', 'is', null)
          .limit(1)
          .single();

        if (profileData?.driver_id) {
          driverId = profileData.driver_id;
          console.log(`[accept] driver encontrado via user_profiles: username=${profileData.username} driver_id=${driverId}`);
        }
      }

      // Fallback: buscar en drivers por nombre directo
      if (!driverId && route.driverName) {
        const { data: driverDirect } = await supabaseAdmin
          .from('drivers')
          .select('id, vehicle_id')
          .ilike('name', `%${route.driverName.split(' ').pop() || route.driverName}%`)
          .limit(1)
          .single();

        if (driverDirect) {
          driverId = driverDirect.id;
          vehicleIdFromDb = driverDirect.vehicle_id;
          console.log(`[accept] driver encontrado via drivers table: id=${driverId}`);
        }
      }

      // Buscar vehicle por matricula (para route_drivers)
      if (!vehicleIdFromDb && route.matricula) {
        const { data: vehicleData } = await supabaseAdmin
          .from('vehicles')
          .select('id')
          .eq('plate', route.matricula)
          .single();
        vehicleIdFromDb = vehicleData?.id || null;
      }

      console.log(`[accept] FINAL driverId="${driverId}" vehicleId="${vehicleIdFromDb}" matricula="${route.matricula}"`);

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
            departure_time: (() => {
              if (!route.departureTime) return '08:00';
              // Si ya es HH:MM, usarlo directo
              if (/^\d{2}:\d{2}$/.test(route.departureTime)) return route.departureTime;
              // Si es ISO string, extraer la hora
              try {
                const d = new Date(route.departureTime);
                if (!isNaN(d.getTime())) return d.toTimeString().slice(0, 5);
              } catch { /* ignore */ }
              return '08:00';
            })(),
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
        distance_m: stop.distance ?? null,
        eta_seconds: stop.eta ?? null,
      }));

      const { error: deliveriesErr } = await supabaseAdmin
        .from('deliveries')
        .insert(deliveries);

      if (deliveriesErr) throw new Error(`Error guardando entregas: ${deliveriesErr.message}`);

      // 5. Audit
      await supabaseAdmin.from('audit_log').insert({
        action:    'Ruta aceptada y guardada',
        entity:    'ruta',
        entity_id: routeData.id,
        user_name: userName,
        user_role: userRole,
        ip_address: ip,
        user_agent: req.headers.get('user-agent') || 'unknown',
        module:    'Rutas',
        metadata: {
          ruta_id:          routeData.id,
          ruta_code:        routeData.route_code || null,
          fecha:            routeData.date,
          chofer:           route.driverName,
          driver_id:        driverId,
          matricula:        route.matricula,
          vehiculo_id:      vehicleIdFromDb,
          total_entregas:   route.stops.length,
          total_km:         ((route.totalDistance || 0) / 1000).toFixed(1),
          tiempo_estimado_min: Math.round((route.totalDuration || 0) / 60),
          facturas:         route.stops.map(s => s.address.invoice).filter(Boolean),
          depot_id:         depotId,
          hora_salida:      routeData.departure_time,
        },
        created_at: now.toISOString(),
      });

      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/push/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({
          targetRole: 'driver',
          title: '🚛 Nueva ruta asignada',
          body:  'Tienes una ruta nueva para hoy. Ingresa a la app.',
          url:   '/driver',
          tag:   'new-route',
        }),
      }).catch(console.error);
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
