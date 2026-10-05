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
  // Fuera del try: si la transacción falla, el catch lo registra en la bitácora
  let auditCtx: { userName: string; userRole: string; ip: string; userAgent: string } | null = null;
  let editingRouteId: string | null = null;
  try {
    const session = await requireAuth(req, ['admin', 'logistics']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { routes, replacesRouteId }: { routes: Route[]; replacesRouteId?: string | null } = await req.json();
    editingRouteId = replacesRouteId || null;

    // ── Edición de una ruta ya aceptada ──
    // Solo mientras el chofer no la haya iniciado. La validación (vigente y sin iniciar) la hace
    // la función accept_routes dentro de la transacción, con la ruta original bloqueada:
    // dos ediciones simultáneas ya no pueden pasar las dos.
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

    auditCtx = { userName, userRole, ip, userAgent: req.headers.get('user-agent') || 'unknown' };

    // ── Todo o nada (v7.53.0) ──
    // Aquí solo se LEE: bodegas (con caché), chofer y vehículo de todas las rutas en paralelo.
    // Todo lo que ESCRIBE (rutas, asignaciones, entregas, movimientos de la Bandeja, reemplazo de la
    // ruta editada y bitácora) lo hace la función accept_routes en UNA transacción: si algo falla,
    // no queda nada a medias. También es más rápido: antes, mover 40 facturas eran ~80 consultas en fila.
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

    const routeDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const depotPairs = await Promise.all(routes.map(route => Promise.all([
      resolveDepotCached(route.depot),
      resolveDepotCached(route.endDepot?.lat ? route.endDepot : route.depot),
    ])));

    const payloadRoutes = routes.map((route, routeIndex) => {
      const [depotId, returnDepotId] = depotPairs[routeIndex];
      const { driverId, vehicleIdFromDb } = driverLookups[routeIndex];
      const departure = toDepartureHHMM(route.departureTime);

      // Carga del ERP: una parada puede traer varias facturas del mismo cliente.
      // Una entrega por factura, todas con el mismo orden de visita.
      // pending_id: la factura ya existe (Bandeja o ruta que se edita) y se MUEVE con su historial.
      const deliveries = route.stops.flatMap(stop => {
        const base = {
          client_name: stop.address.clientName || stop.address.name || '',
          address: stop.address.raw || '',
          lat: stop.address.lat,
          lng: stop.address.lng,
          geocoded: stop.address.geocoded || false,
          stop_order: stop.sequence,
          distance_m: stop.distance ?? null,
          eta_seconds: stop.eta ?? null,
        };
        const invoices = Array.isArray(stop.address.invoices) ? stop.address.invoices : [];
        if (invoices.length > 0) {
          return invoices.map(inv => ({
            ...base,
            invoice: inv.invoice || 'SIN-FACTURA',
            merchandise_value: typeof inv.amount === 'number' ? inv.amount : null,
            pending_id: inv.deliveryId || null,
          }));
        }
        return [{
          ...base,
          invoice: stop.address.invoice || 'SIN-FACTURA',
          merchandise_value: stop.address.merchandiseValue || null,
          pending_id: null,
        }];
      });

      return {
        vehicle_id: route.vehicleId,
        route: {
          // Fecha en Ciudad de México: en UTC, una ruta aceptada después de las 18:00 quedaba con fecha de mañana
          date: routeDate,
          depot_id: depotId,
          return_depot_id: returnDepotId,
          departure_time: departure,
          total_deliveries: deliveries.length,
          polyline_encoded: route.polylineEncoded || null,
        },
        route_driver: driverId ? {
          driver_id: driverId,
          vehicle_id: vehicleIdFromDb,
          departure_time: departure,
          color: route.color,
          total_km: (route.totalDistance || 0) / 1000,
          total_time_min: Math.round((route.totalDuration || 0) / 60),
        } : null,
        deliveries,
        // Desglose de la bitácora. La función agrega código, versión, lo que se agregó y lo que se quitó.
        audit: {
          chofer:              route.driverName,
          driver_id:           driverId,
          matricula:           route.matricula,
          vehiculo_id:         vehicleIdFromDb,
          total_paradas:       route.stops.length,
          total_entregas:      deliveries.length,
          total_km:            ((route.totalDistance || 0) / 1000).toFixed(1),
          tiempo_estimado_min: Math.round((route.totalDuration || 0) / 60),
          facturas:            deliveries.map(d => d.invoice).filter(Boolean),
          depot_id:            depotId,
          hora_salida:         departure,
        },
      };
    });

    const { data: result, error: rpcErr } = await supabaseAdmin.rpc('accept_routes', {
      p: {
        replaces_route_id: replacesRouteId || null,
        now: now.toISOString(),
        user_name: userName,
        user_role: userRole,
        ip,
        user_agent: req.headers.get('user-agent') || 'unknown',
        routes: payloadRoutes,
      },
    });

    if (rpcErr) {
      // SR409: la ruta editada ya no está vigente o el chofer ya la inició (no es una falla del sistema)
      if (rpcErr.code === 'SR409') {
        return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 409 });
      }
      throw new Error('No se guardó ninguna ruta: ' + rpcErr.message);
    }

    const accepted: { vehicleId: string; routeId: string; routeCode: string | null; driverId: string | null }[] =
      Array.isArray(result?.accepted) ? result.accepted : [];
    // Facturas en espera que alguien movió mientras se planeaba (no se incluyeron)
    const pendingWarnings: string[] = Array.isArray(result?.warnings) ? result.warnings : [];

    // Avisos al celular: solo después de guardar todo, uno por chofer asignado
    await Promise.all(accepted.map(a => notifyDriverSafely(a.driverId, {
      title: '🚛 Nueva ruta asignada',
      body:  'Tienes una ruta nueva para hoy. Ingresa a la app.',
      url:   '/driver',
      tag:   'new-route',
    }, 'accept')));

    return NextResponse.json({
      ok: true,
      saved: accepted.length,
      accepted: accepted.map(a => ({ vehicleId: a.vehicleId, routeId: a.routeId, routeCode: a.routeCode })),
      pendingWarnings,
    });
  } catch (err) {
    console.error('Accept route error:', err);
    // La transacción no guardó nada; la bitácora registra el intento y el motivo
    if (auditCtx) {
      const { error: failAuditErr } = await supabaseAdmin.from('audit_log').insert({
        action:     'Aceptación fallida',
        entity:     'ruta',
        entity_id:  editingRouteId,
        user_name:  auditCtx.userName,
        user_role:  auditCtx.userRole,
        ip_address: auditCtx.ip,
        user_agent: auditCtx.userAgent,
        module:     'Rutas',
        metadata: {
          error:            err instanceof Error ? err.message : 'Error desconocido',
          resultado:        'No se guardó nada',
          ruta_anterior_id: editingRouteId,
        },
        created_at: new Date().toISOString(),
      });
      if (failAuditErr) console.error('[accept] Tampoco se pudo registrar la falla en la bitácora:', failAuditErr);
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
