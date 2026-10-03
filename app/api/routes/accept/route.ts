import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyDriverSafely } from '@/lib/push';
import { requireAuth } from '@/lib/auth';
import type { Route } from '@/types';

/**
 * Hora de salida HH:MM de la ruta. Acepta "HH:MM" o una fecha ISO.
 * Antes: sin hora se guardaba 08:00 aunque la configuración dijera otra, y una fecha ISO
 * se convertía con la zona del servidor (UTC), 6 horas desfasada.
 */
function toDepartureHHMM(value: string | undefined | null): string {
  if (!value) return '08:00';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  const d = new Date(value);
  if (isNaN(d.getTime())) return '08:00';
  return d.toLocaleTimeString('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { routes }: { routes: Route[] } = await req.json();
    const userName = session.user.fullName || session.user.username;
    const userRole = session.user.role;

    if (!routes || routes.length === 0) {
      return NextResponse.json({ ok: false, error: 'No hay rutas para guardar' }, { status: 400 });
    }

    const now = new Date();
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    // Código asignado a cada ruta (lo usa el Excel de asignaciones)
    const accepted: { vehicleId: string; routeId: string; routeCode: string | null }[] = [];
    // Facturas en espera que alguien movió mientras se planeaba (no se incluyeron)
    const pendingWarnings: string[] = [];

    // ── Optimización de tiempo (v7.49.1) ──
    // Antes: ~11 consultas en fila por ruta (≈35 para 3 rutas), cada una cruzando de Vercel a Supabase.
    // Ahora: bodegas con caché, chofer y vehículo de todas las rutas en paralelo antes del ciclo,
    // y bitácora y avisos al celular juntos al final. En fila solo queda crear ruta, asignación y
    // facturas: el código de ruta lo genera la base contando las del día, y en paralelo podría repetirse.
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


    const depotCache = new Map<string, Promise<string | null>>();
    const resolveDepotCached = (d: { lat?: number; lng?: number; name?: string; id?: string } | null | undefined) => {
      const key = JSON.stringify([d?.lat ?? null, d?.lng ?? null, d?.name ?? null]);
      if (!depotCache.has(key)) depotCache.set(key, resolveDepotId(d));
      return depotCache.get(key) as Promise<string | null>;
    };

    const resolveDriver = async (route: Route): Promise<{ driverId: string | null; vehicleIdFromDb: string | null }> => {
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

      return { driverId, vehicleIdFromDb };
    };
    const driverLookups = await Promise.all(routes.map(r => resolveDriver(r)));

    const auditRows: Record<string, unknown>[] = [];
    const pushJobs: Array<() => Promise<void>> = [];

    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex];
      // 1. Insertar ruta principal
      const [depotId, returnDepotId] = await Promise.all([
        resolveDepotCached(route.depot),
        resolveDepotCached(route.endDepot?.lat ? route.endDepot : route.depot),
      ]);

      console.log(`[accept] depotId="${depotId}" returnDepotId="${returnDepotId}"`);

      const { data: routeData, error: routeErr } = await supabaseAdmin
        .from('routes')
        .insert({
          // Fecha en Ciudad de México: en UTC, una ruta aceptada después de las 18:00 quedaba con fecha de mañana
          date: now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }),
          depot_id: depotId,
          return_depot_id: returnDepotId,
          departure_time: toDepartureHHMM(route.departureTime),
          status: 'optimized',
          total_deliveries: route.stops.reduce((n, st) => n + (Array.isArray(st.address.invoices) && st.address.invoices.length > 0 ? st.address.invoices.length : 1), 0),
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
      accepted.push({ vehicleId: route.vehicleId, routeId: routeData.id, routeCode: routeData.route_code ?? null });

      // 2. Chofer y vehículo: ya resueltos en paralelo antes del ciclo
      const { driverId, vehicleIdFromDb } = driverLookups[routeIndex];

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
            departure_time: toDepartureHHMM(route.departureTime),
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
      // Carga del ERP: una parada puede traer varias facturas del mismo cliente.
      // Se crea una entrega por factura, todas con el mismo orden de visita,
      // para conservar estado, pendientes e historial por factura.
      const deliveries = route.stops.flatMap(stop => {
        const base = {
          route_id: routeData.id,
          route_driver_id: routeDriverId,
          driver_id: driverId,
          client_name: stop.address.clientName || stop.address.name || '',
          address: stop.address.raw || '',
          lat: stop.address.lat,
          lng: stop.address.lng,
          geocoded: stop.address.geocoded || false,
          stop_order: stop.sequence,
          status: 'pending',
          distance_m: stop.distance ?? null,
          eta_seconds: stop.eta ?? null,
        };

        const invoices = Array.isArray(stop.address.invoices) ? stop.address.invoices : [];
        if (invoices.length > 0) {
          return invoices.map(inv => ({
            ...base,
            invoice: inv.invoice || 'SIN-FACTURA',
            merchandise_value: typeof inv.amount === 'number' ? inv.amount : null,
            pendingId: inv.deliveryId,
          }));
        }

        return [{
          ...base,
          invoice: stop.address.invoice || 'SIN-FACTURA',
          merchandise_value: stop.address.merchandiseValue || null,
          pendingId: undefined as string | undefined,
        }];
      });

      // Facturas nuevas: se insertan. Las que vienen de la Bandeja (en espera de planeación)
      // se MUEVEN: misma entrega, mismo historial, intentos y piezas pendientes.
      const toInsert = deliveries.filter(d => !d.pendingId).map(({ pendingId: _p, ...row }) => row);
      const toMove = deliveries.filter(d => d.pendingId);

      if (toInsert.length > 0) {
        const { error: deliveriesErr } = await supabaseAdmin
          .from('deliveries')
          .insert(toInsert);
        if (deliveriesErr) throw new Error(`Error guardando entregas: ${deliveriesErr.message}`);
      }

      if (toMove.length > 0) {
        const ids = toMove.map(d => d.pendingId as string);
        const { data: current, error: curErr } = await supabaseAdmin
          .from('deliveries')
          .select('id, route_id, original_route_id')
          .in('id', ids);
        if (curErr) throw new Error('Error leyendo entregas en espera: ' + curErr.message);
        const currentById = new Map((current || []).map(c => [c.id, c]));

        for (const d of toMove) {
          const prev = currentById.get(d.pendingId as string);
          const { data: moved, error: mErr } = await supabaseAdmin
            .from('deliveries')
            .update({
              route_id: d.route_id,
              route_driver_id: d.route_driver_id,
              driver_id: d.driver_id,
              stop_order: d.stop_order,
              status: 'pending',
              is_pending: false,
              awaiting_planning: false,
              pending_since: null,
              original_route_id: prev?.original_route_id ?? prev?.route_id ?? null,
              lat: d.lat,
              lng: d.lng,
              distance_m: d.distance_m,
              eta_seconds: d.eta_seconds,
              updated_at: now.toISOString(),
            })
            .eq('id', d.pendingId as string)
            // Solo si sigue en espera: si alguien la movió mientras tanto, no se pisa
            .eq('is_pending', true)
            .eq('awaiting_planning', true)
            .select('id');
          if (mErr) throw new Error('Error moviendo entrega en espera: ' + mErr.message);
          if (!moved || moved.length === 0) {
            pendingWarnings.push(d.invoice);
            continue;
          }
          const { error: evErr } = await supabaseAdmin.from('delivery_events').insert({
            delivery_id: d.pendingId,
            event_type: 'reassigned',
            notes: 'Incluida en la planeación de la ruta ' + (routeData.route_code || routeData.id) + ' por ' + userName + '.',
            created_at: now.toISOString(),
          });
          if (evErr) console.error('[accept] Entrega en espera movida, pero falló su evento:', evErr);
        }
      }

      // 5. Audit (se inserta junto con las demás rutas al final)
      auditRows.push({
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
          total_paradas:    route.stops.length,
          total_entregas:   deliveries.length,
          total_km:         ((route.totalDistance || 0) / 1000).toFixed(1),
          tiempo_estimado_min: Math.round((route.totalDuration || 0) / 60),
          facturas:         deliveries.map(d => d.invoice).filter(Boolean),
          depot_id:         depotId,
          hora_salida:      routeData.departure_time ? String(routeData.departure_time).slice(0, 5) : null,
        },
        created_at: now.toISOString(),
      });

      // Push solo al chofer asignado a esta ruta (se envían todos juntos al final)
      pushJobs.push(() => notifyDriverSafely(driverId, {
        title: '🚛 Nueva ruta asignada',
        body:  'Tienes una ruta nueva para hoy. Ingresa a la app.',
        url:   '/driver',
        tag:   'new-route',
      }, 'accept'));
    }

    // Bitácora (una sola inserción) y avisos al celular, en paralelo
    const [auditResult] = await Promise.all([
      auditRows.length > 0 ? supabaseAdmin.from('audit_log').insert(auditRows) : Promise.resolve({ error: null }),
      ...pushJobs.map(job => job()),
    ]);
    if (auditResult.error) console.error('[accept] Rutas guardadas, pero falló la bitácora:', auditResult.error);

    return NextResponse.json({ ok: true, saved: routes.length, accepted, pendingWarnings });
  } catch (err) {
    console.error('Accept route error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
