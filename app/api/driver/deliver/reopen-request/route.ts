import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['driver']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { deliveryId, reason } = await req.json();
    const driverId = session.user.driverId;
    if (!deliveryId || !driverId) return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });

    // Verificar pertenencia de la entrega
    const { data: delivery } = await supabaseAdmin
      .from('deliveries')
      .select('route_driver_id')
      .eq('id', deliveryId)
      .single();

    if (!delivery) {
      return NextResponse.json({ ok: false, error: 'Entrega no encontrada' }, { status: 404 });
    }

    const { data: routeDriver } = await supabaseAdmin
      .from('route_drivers')
      .select('driver_id')
      .eq('id', delivery.route_driver_id)
      .single();

    if (!routeDriver || routeDriver.driver_id !== driverId) {
      return NextResponse.json({ ok: false, error: 'No tienes permiso sobre esta entrega' }, { status: 403 });
    }

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
      .select('invoice, route_id, client_name, address')
      .eq('id', deliveryId)
      .single();

    const { data: driverInfo } = await supabaseAdmin
      .from('drivers')
      .select('name')
      .eq('id', driverId)
      .single();
    const driverName = driverInfo?.name || driverId;

    if (deliveryData) {
      await supabaseAdmin.from('notifications').insert({
        type: 'reopen_requested',
        title: 'Solicitud de Reapertura',
        body: `${driverName} solicita reabrir la entrega ${deliveryData.invoice}`,
        entity_id: newReq.id,
        target_role: 'admin',
        metadata: {
          chofer: driverName,
          factura: deliveryData.invoice,
          cliente: deliveryData.client_name || null,
          direccion: deliveryData.address || null,
          motivo: reason || 'Sin motivo especificado',
        },
      });
    }

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
