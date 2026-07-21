import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['admin', 'logistics']);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const adminName = auth.user.fullName || auth.user.username;

    const { requestId } = await req.json();
    if (!requestId) return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });

    const { data: request, error: reqErr } = await supabaseAdmin
      .from('delivery_reopen_requests')
      .update({
        status: 'approved',
        resolved_at: new Date().toISOString(),
        resolved_by: adminName,
      })
      .eq('id', requestId)
      .select('delivery_id, requested_by')
      .single();

    if (reqErr || !request) throw reqErr || new Error('Request not found');

    // Marcar la notificación original de solicitud de reapertura como leída
    await supabaseAdmin
      .from('notifications')
      .update({ read: true, type: 'reopen_resolved' })
      .eq('entity_id', requestId)
      .eq('type', 'reopen_requested');

    // Cambiar estado de entrega a pendiente
    await supabaseAdmin
      .from('deliveries')
      .update({ status: 'pending' })
      .eq('id', request.delivery_id);

    // Obtener info para notificar al chofer
    const { data: deliveryData } = await supabaseAdmin
      .from('deliveries')
      .select('invoice')
      .eq('id', request.delivery_id)
      .single();

    if (deliveryData) {
      await supabaseAdmin.from('notifications').insert({
        type: 'reopen_resolved',
        title: 'Reapertura Aprobada',
        body: `Tu solicitud de reapertura para la entrega ${deliveryData.invoice} fue aprobada por ${adminName}.`,
        entity_id: request.delivery_id,
        target_role: request.requested_by, // driverId
        metadata: {
          factura: deliveryData.invoice,
          aprobado_por: adminName,
        },
      });
    }

    await supabaseAdmin.from('audit_log').insert({
      action:    'Reapertura de entrega aprobada',
      entity:    'entrega',
      entity_id: request.delivery_id,
      user_name: adminName,
      user_role: auth.user.role,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      module:    'Entregas',
      metadata: {
        factura: deliveryData?.invoice || null,
        accion: 'aprobado',
      },
      created_at: new Date().toISOString(),
    }).then(({error}) => { if (error) console.error(error); });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reopen-approve]', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
