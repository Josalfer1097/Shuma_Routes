import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/pending
 * Bandeja de Pendientes: entregas no completadas de rutas cerradas,
 * más las rutas abiertas a las que se pueden reasignar.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics', 'viewer']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    // 1. Entregas en bandeja (incluye las que esperan planeación)
    const { data: pending, error: pErr } = await supabaseAdmin
      .from('deliveries')
      .select('id, route_id, invoice, client_name, address, lat, lng, status, notes, merchandise_value, attempt_count, pending_since, original_route_id, awaiting_planning, pending_quantity')
      .eq('is_pending', true)
      .order('pending_since', { ascending: true });

    if (pErr) throw new Error(`Error leyendo pendientes: ${pErr.message}`);

    // 2. Ruta de origen (la ruta cerrada de la que salió) y su chofer
    const originIds = Array.from(new Set((pending || []).map(d => d.route_id).filter(Boolean)));
    const originMap = new Map<string, { route_code: string | null; route_alias: string | null; date: string | null; driver_name: string | null }>();

    if (originIds.length > 0) {
      const [{ data: originRoutes, error: orErr }, { data: originDrivers, error: odErr }] = await Promise.all([
        supabaseAdmin.from('routes').select('id, route_code, route_alias, date').in('id', originIds),
        supabaseAdmin.from('route_drivers').select('route_id, drivers(name)').in('route_id', originIds),
      ]);
      if (orErr) throw new Error(`Error leyendo rutas de origen: ${orErr.message}`);
      if (odErr) throw new Error(`Error leyendo choferes de origen: ${odErr.message}`);

      for (const r of originRoutes || []) {
        const rd = (originDrivers || []).find(x => x.route_id === r.id);
        originMap.set(r.id, {
          route_code: r.route_code ?? null,
          route_alias: r.route_alias ?? null,
          date: r.date ?? null,
          driver_name: ((rd?.drivers as unknown) as { name?: string } | null)?.name ?? null,
        });
      }
    }

    const items = (pending || []).map(d => ({
      ...d,
      origin: originMap.get(d.route_id) ?? null,
    }));

    // 3. Rutas abiertas con chofer asignado (destinos válidos para reasignar).
    // Sin filtro por fecha: una ruta sigue activa hasta que se cierra formalmente
    // (mismo criterio que /api/routes/active).
    const { data: openRoutes, error: rErr } = await supabaseAdmin
      .from('routes')
      .select('id, route_code, route_alias, date, departure_time')
      .eq('is_latest', true)
      .or('closure_status.is.null,closure_status.eq.rejected')
      .order('created_at', { ascending: false });

    if (rErr) throw new Error(`Error leyendo rutas abiertas: ${rErr.message}`);

    let targets: Array<{ id: string; route_code: string | null; route_alias: string | null; date: string | null; driver_name: string | null }> = [];
    const openIds = (openRoutes || []).map(r => r.id);

    if (openIds.length > 0) {
      const { data: rds, error: rdErr } = await supabaseAdmin
        .from('route_drivers')
        .select('route_id, drivers(name)')
        .in('route_id', openIds);
      if (rdErr) throw new Error(`Error leyendo choferes de rutas abiertas: ${rdErr.message}`);

      targets = (openRoutes || [])
        .map(r => {
          const rd = (rds || []).find(x => x.route_id === r.id);
          return {
            id: r.id,
            route_code: r.route_code ?? null,
            route_alias: r.route_alias ?? null,
            date: r.date ?? null,
            driver_name: ((rd?.drivers as unknown) as { name?: string } | null)?.name ?? null,
            hasDriver: Boolean(rd),
          };
        })
        .filter(r => r.hasDriver)
        .map(({ hasDriver: _hasDriver, ...rest }) => rest);
    }

    return NextResponse.json({ ok: true, items, targets });
  } catch (err) {
    console.error('[pending]', err);
    return NextResponse.json({ ok: false, error: 'Error cargando la bandeja de pendientes' }, { status: 500 });
  }
}
