import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { requestId, adminName } = await req.json();
    if (!requestId || !adminName) return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });

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
        body: `Tu solicitud de reapertura para la entrega ${deliveryData.invoice} fue aprobada.`,
        entity_id: request.delivery_id,
        target_role: request.requested_by, // driverId
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reopen-approve]', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
