import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, entity, entity_id, user_name, user_role, module, metadata } = body;

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    const userAgent = req.headers.get('user-agent') || 'unknown';

    const { error } = await supabaseAdmin.from('audit_log').insert({
      action,
      entity,
      entity_id,
      user_name,
      user_role,
      ip_address: ip,
      user_agent: userAgent,
      module: module || 'general',
      metadata,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Audit POST error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const module     = searchParams.get('module')     || '';
    const user_name  = searchParams.get('user_name')  || '';
    const dateFrom   = searchParams.get('dateFrom')   || '';
    const dateTo     = searchParams.get('dateTo')     || '';
    const entity_id  = searchParams.get('entity_id')  || '';
    const search     = searchParams.get('search')     || '';  // ← NUEVO: full-text
    const actionType = searchParams.get('actionType') || ''; // login|entrega|ruta|sistema
    const limit      = parseInt(searchParams.get('limit') || '200');
    const offset     = parseInt(searchParams.get('offset') || '0');  // ← NUEVO: paginación
    const timeFrom   = searchParams.get('timeFrom') || '';
    const timeTo     = searchParams.get('timeTo')   || '';

    let query = supabaseAdmin
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (module)    query = query.eq('module', module);
    if (user_name) query = query.ilike('user_name', `%${user_name}%`);  // ← era eq, ahora ilike
    if (dateFrom)  query = query.gte('created_at', new Date(dateFrom).toISOString());
    if (dateTo)    query = query.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());
    if (timeFrom && dateFrom) {
      const [h, m] = timeFrom.split(':');
      const dt = new Date(dateFrom);
      dt.setHours(Number(h), Number(m), 0, 0);
      query = query.gte('created_at', dt.toISOString());
    }
    if (timeTo) {
      const baseDate = dateTo || dateFrom;
      if (baseDate) {
        const [h, m] = timeTo.split(':');
        const dt = new Date(baseDate);
        dt.setHours(Number(h), Number(m), 59, 999);
        query = query.lte('created_at', dt.toISOString());
      }
    }
    if (entity_id) query = query.eq('entity_id', entity_id);

    // Búsqueda full-text — solo en columnas de texto plano (sin cast)
    if (search) {
      const term = `%${search}%`;
      // Parsear operadores avanzados: usuario:X módulo:Y
      const userOp    = search.match(/usuario:(\S+)/i)?.[1];
      const moduleOp  = search.match(/módulo:(\S+)/i)?.[1] || search.match(/modulo:(\S+)/i)?.[1];
      const cleanSearch = search
        .replace(/usuario:\S+/gi, '')
        .replace(/módulo:\S+/gi, '')
        .replace(/modulo:\S+/gi, '')
        .trim();

      if (userOp)   query = query.ilike('user_name', `%${userOp}%`);
      if (moduleOp) query = query.ilike('module', `%${moduleOp}%`);

      if (cleanSearch) {
        const t = `%${cleanSearch}%`;
        query = query.or(`action.ilike.${t},user_name.ilike.${t},module.ilike.${t}`);
      }
    }

    // Filtro por tipo de acción — OR separado para no mezclar con el search
    if (actionType) {
      const typeMap: Record<string, string[]> = {
        login:   ['login_success', 'login_failed', 'Cuenta bloqueada', 'Logout', 'Inicio de sesión', 'Sesión iniciada'],
        entrega: ['Entrega completada', 'Entrega parcial', 'Entrega fallida', 'Entrega reabierta'],
        ruta:    ['Ruta aceptada y guardada', 'Ruta iniciada', 'Ruta cerrada', 'Ruta reabierta', 'Alias actualizado'],
        sistema: ['Cookies aceptadas', 'Sesión iniciada', 'Sesión cerrada'],
      };
      const actions = typeMap[actionType] || [];
      if (actions.length > 0) {
        const actionClauses = actions.map(a => `action.ilike.%${a}%`).join(',');
        query = query.or(actionClauses);
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, data, total: count ?? 0 });
  } catch (err) {
    console.error('Audit GET error:', err);
    return NextResponse.json({ ok: false, data: [], total: 0 }, { status: 500 });
  }
}
