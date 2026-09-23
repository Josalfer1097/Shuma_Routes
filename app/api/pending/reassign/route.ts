import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { notifyDriverSafely } from '@/lib/push';

type Mode = 'route' | 'planning' | 'tray';

/**
 * POST /api/pending/reassign
 * body: { deliveryId, mode, targetRouteId?, pendingQuantity?, note? }
 *
 * mode 'route'    → mueve la entrega (mismo id e historial) al final de una ruta abierta.
 * mode 'planning' → la deja en espera para incluirla en la próxima planeación.
 * mode 'tray'     → la regresa de "en espera de planeación" a la bandeja.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }
    const userName = session.user.fullName || session.user.username;

    const body = await req.json();
    const deliveryId: string | undefined = body?.deliveryId;
    const mode: Mode | undefined = body?.mode;
    const targetRouteId: string | undefined = body?.targetRouteId;
    const note: string = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : '';
    const rawQty = body?.pendingQuantity;

    if (!deliveryId || !mode || !['route', 'planning', 'tray'].includes(mode)) {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
    }

    let pendingQuantity: number | null = null;
    if (rawQty !== undefined && rawQty !== null && rawQty !== '') {
      const n = Number(rawQty);
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        return NextResponse.json({ ok: false, error: 'La cantidad de piezas debe ser un número entero mayor a 0' }, { status: 400 });
      }
      pendingQuantity = n;
    }

    // 1. La entrega debe seguir en la bandeja
    const { data: delivery, error: dErr } = await supabaseAdmin
      .from('deliveries')
      .select('id, route_id, invoice, client_name, status, is_pending, awaiting_planning, original_route_id, attempt_count, pending_quantity')
      .eq('id', deliveryId)
      .single();

    if (dErr || !delivery) {
      return NextResponse.json({ ok: false, error: 'Entrega no encontrada' }, { status: 404 });
    }
    if (!delivery.is_pending) {
      return NextResponse.json({ ok: false, error: 'Esta entrega ya no está en la bandeja. Actualiza la pantalla.' }, { status: 409 });
    }

    // Los parciales requieren saber cuántas piezas faltan antes de salir a ruta
    const qtyToSave = pendingQuantity ?? delivery.pending_quantity ?? null;
    if (mode === 'route' && delivery.status === 'partial' && !qtyToSave) {
      return NextResponse.json({ ok: false, error: 'Indica cuántas piezas faltan por entregar' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    let eventType = '';
    let eventNote = '';
    let auditAction = '';
    let targetInfo: { route_code: string | null; route_alias: string | null } | null = null;
    let targetDriverId: string | null = null;

    if (mode === 'route') {
      if (!targetRouteId) {
        return NextResponse.json({ ok: false, error: 'Selecciona la ruta destino' }, { status: 400 });
      }
      if (targetRouteId === delivery.route_id) {
        return NextResponse.json({ ok: false, error: 'La ruta destino es la misma ruta de origen' }, { status: 400 });
      }

      // 2. Validar ruta destino: vigente y sin cierre aprobado ni solicitado
      const { data: target, error: tErr } = await supabaseAdmin
        .from('routes')
        .select('id, route_code, route_alias, is_latest, closure_status, total_deliveries')
        .eq('id', targetRouteId)
        .single();

      if (tErr || !target) {
        return NextResponse.json({ ok: false, error: 'Ruta destino no encontrada' }, { status: 404 });
      }
      if (!target.is_latest || (target.closure_status && target.closure_status !== 'rejected')) {
        return NextResponse.json({ ok: false, error: 'La ruta destino ya está cerrada o en proceso de cierre' }, { status: 409 });
      }

      const { data: rd, error: rdErr } = await supabaseAdmin
        .from('route_drivers')
        .select('id, driver_id')
        .eq('route_id', targetRouteId)
        .limit(1)
        .maybeSingle();

      if (rdErr) throw new Error(`Error leyendo chofer de la ruta destino: ${rdErr.message}`);
      if (!rd) {
        return NextResponse.json({ ok: false, error: 'La ruta destino no tiene chofer asignado' }, { status: 409 });
      }

      // 3. Siguiente parada al final de la ruta
      const { data: lastStop, error: lsErr } = await supabaseAdmin
        .from('deliveries')
        .select('stop_order')
        .eq('route_id', targetRouteId)
        .order('stop_order', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (lsErr) throw new Error(`Error calculando orden de parada: ${lsErr.message}`);
      const nextStop = (lastStop?.stop_order ?? 0) + 1;

      const qtyText = qtyToSave ? ` Faltan ${qtyToSave} piezas.` : '';
      const reassignNote = `Reasignada desde bandeja de pendientes (intento ${delivery.attempt_count}).${qtyText}${note ? ` ${note}` : ''}`;

      // 4. Mover la entrega (mismo id). La condición is_pending=true evita doble reasignación simultánea.
      const { data: moved, error: mErr } = await supabaseAdmin
        .from('deliveries')
        .update({
          route_id: targetRouteId,
          route_driver_id: rd.id,
          driver_id: rd.driver_id,
          status: 'pending',
          is_pending: false,
          awaiting_planning: false,
          pending_since: null,
          pending_quantity: qtyToSave,
          original_route_id: delivery.original_route_id ?? delivery.route_id,
          stop_order: nextStop,
          distance_m: null,
          eta_seconds: null,
          notes: reassignNote,
          updated_at: nowIso,
        })
        .eq('id', deliveryId)
        .eq('is_pending', true)
        .select('id');

      if (mErr) throw new Error(`Error moviendo la entrega: ${mErr.message}`);
      if (!moved || moved.length === 0) {
        return NextResponse.json({ ok: false, error: 'Otra persona ya movió esta entrega. Actualiza la pantalla.' }, { status: 409 });
      }

      const { error: totErr } = await supabaseAdmin
        .from('routes')
        .update({ total_deliveries: (target.total_deliveries || 0) + 1, updated_at: nowIso })
        .eq('id', targetRouteId);
      if (totErr) console.error('[pending-reassign] Entrega movida, pero no se actualizó el total de la ruta:', totErr);

      targetInfo = { route_code: target.route_code ?? null, route_alias: target.route_alias ?? null };
      targetDriverId = rd.driver_id;
      eventType = 'reassigned';
      eventNote = `${reassignNote} Destino: ${target.route_alias || target.route_code || targetRouteId}. Por: ${userName}.`;
      auditAction = 'Entrega pendiente reasignada a ruta';
    } else {
      // planning / tray: la entrega sigue en la bandeja, solo cambia su marca
      const toPlanning = mode === 'planning';
      const { data: updated, error: uErr } = await supabaseAdmin
        .from('deliveries')
        .update({
          awaiting_planning: toPlanning,
          pending_quantity: qtyToSave,
          updated_at: nowIso,
        })
        .eq('id', deliveryId)
        .eq('is_pending', true)
        .select('id');

      if (uErr) throw new Error(`Error actualizando la entrega: ${uErr.message}`);
      if (!updated || updated.length === 0) {
        return NextResponse.json({ ok: false, error: 'Otra persona ya movió esta entrega. Actualiza la pantalla.' }, { status: 409 });
      }

      eventType = toPlanning ? 'sent_to_planning' : 'returned_to_tray';
      eventNote = `${toPlanning ? 'Enviada a planeación' : 'Regresada a la bandeja'} por ${userName}.${qtyToSave ? ` Faltan ${qtyToSave} piezas.` : ''}${note ? ` ${note}` : ''}`;
      auditAction = toPlanning ? 'Entrega pendiente enviada a planeación' : 'Entrega regresada a bandeja de pendientes';
    }

    // 5. Historial de la entrega
    const { error: evErr } = await supabaseAdmin.from('delivery_events').insert({
      delivery_id: deliveryId,
      event_type: eventType,
      notes: eventNote,
      created_at: nowIso,
    });
    if (evErr) console.error('[pending-reassign] Movimiento aplicado, pero falló el registro del evento:', evErr);

    // 6. Bitácora
    const { error: auditErr } = await supabaseAdmin.from('audit_log').insert({
      action: auditAction,
      entity: 'entrega',
      entity_id: deliveryId,
      user_name: userName,
      user_role: session.user.role,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      module: 'Pendientes',
      metadata: {
        factura: delivery.invoice,
        cliente: delivery.client_name,
        modo: mode,
        ruta_origen_id: delivery.route_id,
        ruta_destino_id: mode === 'route' ? targetRouteId : null,
        ruta_destino: targetInfo ? (targetInfo.route_alias || targetInfo.route_code) : null,
        piezas_pendientes: qtyToSave,
        intento: delivery.attempt_count,
        nota: note || null,
      },
      created_at: nowIso,
    });
    if (auditErr) console.error('[pending-reassign] Error registrando bitácora:', auditErr);

    // 7. Aviso al chofer que recibe la entrega
    if (mode === 'route') {
      await notifyDriverSafely(targetDriverId, {
        title: '📦 Entrega agregada a tu ruta',
        body: `Se agregó la factura ${delivery.invoice} al final de tu ruta.`,
        url: '/driver',
        tag: 'route-updated',
      }, 'pending-reassign');
    }

    return NextResponse.json({ ok: true, eventWarning: evErr ? 'El movimiento se aplicó, pero no quedó registrado en el historial de la entrega.' : null });
  } catch (err) {
    console.error('[pending-reassign]', err);
    return NextResponse.json({ ok: false, error: 'Error interno al reasignar' }, { status: 500 });
  }
}
