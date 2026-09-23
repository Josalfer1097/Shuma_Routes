import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyDriverSafely } from '@/lib/push';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['admin', 'logistics']);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    // La identidad viene de la sesión verificada, NO del cliente
    const adminName = auth.user.fullName || auth.user.username;

    const { routeId } = await req.json();
    if (!routeId) return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });

    // ── 1. Bandeja de Pendientes: mover entregas no completadas ANTES de aprobar ──
    // Si este paso falla, la ruta NO se aprueba: así ninguna entrega queda atrapada
    // en una ruta cerrada sin aparecer en la bandeja.
    const { data: pendingCandidates, error: candErr } = await supabaseAdmin
      .from('deliveries')
      .select('id, status, attempt_count')
      .eq('route_id', routeId)
      .neq('status', 'delivered');

    if (candErr) throw new Error(`Error leyendo entregas de la ruta: ${candErr.message}`);

    const candidates = pendingCandidates || [];

    if (candidates.length > 0) {
      const nowIso = new Date().toISOString();

      // Antes se usaba upsert con solo 4 columnas: Postgres valida NOT NULL
      // (route_id, invoice, address) sobre la fila propuesta antes de resolver
      // el conflicto, así que fallaba siempre. Ahora: UPDATE agrupado por
      // attempt_count actual (normalmente 1–3 grupos, no N consultas).
      const groups = new Map<number, string[]>();
      for (const d of candidates) {
        const current = d.attempt_count || 1;
        const ids = groups.get(current) || [];
        ids.push(d.id);
        groups.set(current, ids);
      }

      const updateResults = await Promise.all(
        Array.from(groups.entries()).map(([current, ids]) =>
          supabaseAdmin
            .from('deliveries')
            .update({
              is_pending: true,
              awaiting_planning: false,
              attempt_count: current + 1,
              pending_since: nowIso,
              updated_at: nowIso,
            })
            .in('id', ids)
        )
      );

      const updateErr = updateResults.find(r => r.error)?.error;
      if (updateErr) throw new Error(`Error moviendo entregas a pendientes: ${updateErr.message}`);

      const { error: eventsErr } = await supabaseAdmin.from('delivery_events').insert(
        candidates.map(d => ({
          delivery_id: d.id,
          event_type: 'moved_to_pending',
          notes: `Ruta cerrada con esta entrega en estado '${d.status}'. Pasa a bandeja de pendientes (intento ${(d.attempt_count || 1) + 1}).`,
          created_at: nowIso,
        }))
      );
      // Las entregas ya están en la bandeja; el evento es historial. Se registra fuerte, no se silencia.
      if (eventsErr) console.error('[close-approve] Entregas movidas, pero falló el registro de eventos:', eventsErr);
    }

    // ── 2. Aprobar la ruta ──
    const { error } = await supabaseAdmin
      .from('routes')
      .update({
        closure_status: 'approved',
        closure_resolved_at: new Date().toISOString(),
        closure_resolved_by: adminName,
      })
      .eq('id', routeId);

    if (error) throw error;

    // Marcar la notificación original de solicitud de cierre como leída
    const { error: notifReadErr } = await supabaseAdmin
      .from('notifications')
      .update({ read: true, type: 'route_closure_resolved' })
      .eq('entity_id', routeId)
      .eq('type', 'route_closure_requested');
    if (notifReadErr) console.error('[close-approve] Error marcando notificación como leída:', notifReadErr);

    // Obtener info para notificar al chofer
    const { data: routeData } = await supabaseAdmin
      .from('routes')
      .select('route_code, route_alias, closure_requested_by')
      .eq('id', routeId)
      .single();

    if (routeData?.closure_requested_by) {
      const routeName = routeData.route_alias || routeData.route_code || 'Ruta';
      const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
        type: 'route_closure_resolved',
        title: 'Cierre Aprobado',
        body: `Tu solicitud de cierre para ${routeName} fue aprobada por ${adminName}.`,
        entity_id: routeId,
        target_role: routeData.closure_requested_by, // driverId
        metadata: {
          ruta_code: routeData.route_code || null,
          aprobado_por: adminName,
          entregas_a_pendientes: candidates.length,
        },
      });
      if (notifErr) console.error('[close-approve] Error creando notificación al chofer:', notifErr);
    }

    // Push solo al chofer que solicitó el cierre (antes llegaba a todos los choferes)
    await notifyDriverSafely(routeData?.closure_requested_by, {
      title: '✅ Cierre aprobado',
      body:  'Tu solicitud de cierre fue aprobada',
      url:   '/driver',
      tag:   'route-close',
    }, 'close-approve');

    const { error: auditErr } = await supabaseAdmin.from('audit_log').insert({
      action:    'Cierre de ruta aprobado',
      entity:    'ruta',
      entity_id: routeId,
      user_name: adminName,
      user_role: auth.user.role,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      module:    'Rutas',
      metadata: {
        ruta_code: routeData?.route_code || null,
        solicitado_por: routeData?.closure_requested_by || null,
        accion: 'aprobado',
        entregas_a_pendientes: candidates.length,
      },
      created_at: new Date().toISOString(),
    });
    if (auditErr) console.error('[close-approve] Error registrando bitácora:', auditErr);

    return NextResponse.json({ ok: true, movedToPending: candidates.length });
  } catch (err) {
    console.error('[close-approve]', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
