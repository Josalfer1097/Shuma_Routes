import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { signPaths } from '@/lib/attachments';

/**
 * GET /api/attachments — consulta del Expediente.
 * Filtros: deliveryId, routeId, q (factura o código de ruta), driverId, category,
 * from / to (AAAA-MM-DD), includeArchived=1, limit (máx. 100), offset.
 * Cada archivo trae una liga temporal (caduca en minutos), nunca una pública.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics', 'viewer']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const sp = new URL(req.url).searchParams;
    const deliveryId = sp.get('deliveryId');
    const routeId = sp.get('routeId');
    // Sin comas ni paréntesis: se usan como separadores en los filtros de la base
    const q = (sp.get('q') || '').replace(/[,()%]/g, '').trim();
    const driverId = sp.get('driverId');
    const category = sp.get('category');
    const from = sp.get('from');
    const to = sp.get('to');
    const includeArchived = sp.get('includeArchived') === '1';
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 60, 1), 100);
    const offset = Math.max(Number(sp.get('offset')) || 0, 0);

    let query = supabaseAdmin
      .from('attachments')
      .select('id, route_id, delivery_id, invoice, storage_path, file_name, mime_type, size_bytes, category, description, uploaded_by_name, uploaded_by_role, created_at, archived_at, archived_by_name, archive_reason', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeArchived) query = query.is('archived_at', null);
    if (deliveryId) query = query.eq('delivery_id', deliveryId);
    if (routeId) query = query.eq('route_id', routeId);
    if (category) query = query.eq('category', category);
    if (from) query = query.gte('created_at', from + 'T00:00:00-06:00');
    if (to) query = query.lte('created_at', to + 'T23:59:59-06:00');

    if (driverId) {
      const { data: rds, error: rdErr } = await supabaseAdmin.from('route_drivers').select('route_id').eq('driver_id', driverId);
      if (rdErr) throw new Error('Error filtrando por chofer: ' + rdErr.message);
      const ids = Array.from(new Set((rds || []).map(r => r.route_id).filter(Boolean)));
      if (ids.length === 0) return NextResponse.json({ ok: true, items: [], total: 0 });
      query = query.in('route_id', ids);
    }

    if (q) {
      const { data: routesByCode, error: rcErr } = await supabaseAdmin
        .from('routes').select('id').ilike('route_code', '%' + q + '%').limit(200);
      if (rcErr) throw new Error('Error buscando rutas: ' + rcErr.message);
      const routeIds = (routesByCode || []).map(r => r.id);
      query = routeIds.length > 0
        ? query.or('invoice.ilike.%' + q + '%,route_id.in.(' + routeIds.join(',') + ')')
        : query.ilike('invoice', '%' + q + '%');
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error('Error leyendo el Expediente: ' + error.message);

    const list = rows || [];
    const routeIds = Array.from(new Set(list.map(r => r.route_id).filter(Boolean))) as string[];

    const [routesRes, driversRes, urls] = await Promise.all([
      routeIds.length > 0
        ? supabaseAdmin.from('routes').select('id, route_code').in('id', routeIds)
        : Promise.resolve({ data: [], error: null }),
      routeIds.length > 0
        ? supabaseAdmin.from('route_drivers').select('route_id, drivers(name)').in('route_id', routeIds)
        : Promise.resolve({ data: [], error: null }),
      signPaths(list.map(r => r.storage_path)),
    ]);
    if (routesRes.error) throw new Error('Error leyendo rutas: ' + routesRes.error.message);
    if (driversRes.error) throw new Error('Error leyendo choferes: ' + driversRes.error.message);

    const codeById = new Map((routesRes.data || []).map((r: { id: string; route_code: string | null }) => [r.id, r.route_code]));
    const driverById = new Map(
      (driversRes.data || []).map((r: { route_id: string; drivers: unknown }) => [
        r.route_id,
        ((r.drivers as { name?: string } | null)?.name) ?? null,
      ])
    );

    const items = list.map(({ storage_path, ...r }) => ({
      ...r,
      route_code: r.route_id ? codeById.get(r.route_id) ?? null : null,
      driver_name: r.route_id ? driverById.get(r.route_id) ?? null : null,
      url: urls[storage_path] ?? null,
    }));

    return NextResponse.json({ ok: true, items, total: count ?? items.length });
  } catch (err) {
    console.error('[attachments GET]', err);
    return NextResponse.json({ ok: false, error: 'Error cargando el Expediente' }, { status: 500 });
  }
}
