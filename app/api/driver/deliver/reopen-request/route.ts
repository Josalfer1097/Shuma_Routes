import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { deliveryId, driverId, reason } = await req.json();
    if (!deliveryId || !driverId) return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });

    const { data: newReq, error } = await supabaseAdmin
      .from('delivery_reopen_requests')
      .insert({
        delivery_id: deliveryId,
        requested_by: driverId,
        reason: reason || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !newReq) throw error || new Error('Failed to insert reopen request');

    // Obtener info de la entrega para notificar al admin
    const { data: deliveryData } = await supabaseAdmin
      .from('deliveries')
      .select('invoice, route_id')
      .eq('id', deliveryId)
      .single();

    if (deliveryData) {
      await supabaseAdmin.from('notifications').insert({
        type: 'reopen_requested',
        title: 'Solicitud de Reapertura',
        body: `El chofer solicita reabrir la entrega ${deliveryData.invoice}`,
        entity_id: newReq.id,
        target_role: 'admin',
      });
    }

    const { data: driverInfo } = await supabaseAdmin
      .from('drivers')
      .select('name')
      .eq('id', driverId)
      .single();
    const driverName = driverInfo?.name || driverId;

    await supabaseAdmin.from('audit_log').insert({
      action:    'Solicitud de reapertura',
      entity:    'entrega',
      entity_id: deliveryId,
      user_name: driverName,
      user_role: 'driver',
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      module:    'Entregas',
      metadata: {
        factura:  deliveryData?.invoice || null,
        motivo:   reason || 'Sin motivo',
        estado:   'pending',
      },
      created_at: new Date().toISOString(),
    }).then(({error}) => { if (error) console.error(error); });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reopen-request]', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
