import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['driver']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { deliveryId, status, notes, partialQuantity, photoUrls = [] } = await req.json();
    const driverName = session.user.fullName || 'chofer';

    if (!deliveryId || !status) {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    // 1. Obtener datos completos de la entrega para la bitácora
    const { data: delivery } = await supabaseAdmin
      .from('deliveries')
      .select('id, invoice, client_name, address, route_id, route_driver_id, stop_order, merchandise_value')
      .eq('id', deliveryId)
      .single();

    if (!delivery) {
      return NextResponse.json({ ok: false, error: 'Entrega no encontrada' }, { status: 404 });
    }

    // 2. Verificar pertenencia: la entrega debe estar asignada a UN route_driver
    //    cuyo driver_id sea el del chofer autenticado (sesión, no body)
    const { data: routeDriver } = await supabaseAdmin
      .from('route_drivers')
      .select('driver_id')
      .eq('id', delivery.route_driver_id)
      .single();

    if (!routeDriver || routeDriver.driver_id !== session.user.driverId) {
      return NextResponse.json({ ok: false, error: 'No tienes permiso sobre esta entrega' }, { status: 403 });
    }

    // 2. Obtener route_code de la ruta
    const { data: route } = delivery?.route_id ? await supabaseAdmin
      .from('routes')
      .select('route_code, date')
      .eq('id', delivery.route_id)
      .single() : { data: null };

    // 3. Actualizar status de la entrega
    const newStatus = status === 'completed' ? 'delivered'
                    : status === 'partial'   ? 'partial'
                    : 'failed';
    const { error: updateErr } = await supabaseAdmin
      .from('deliveries')
      .update({
        status: newStatus,
        notes:  notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);

    if (updateErr) throw updateErr;

    const serializedPhotos = photoUrls.length > 0 ? JSON.stringify(photoUrls) : null;

    // 4. Registrar en delivery_events
    await supabaseAdmin.from('delivery_events').insert({
      delivery_id: deliveryId,
      event_type:  newStatus,
      notes:       notes || null,
      photo_url:   serializedPhotos,
      created_at:  new Date().toISOString(),
    });

    // 5. Bitácora DETALLADA
    await supabaseAdmin.from('audit_log').insert({
      action:    status === 'completed' ? 'Entrega completada' 
               : status === 'partial'   ? 'Entrega parcial'
               : 'Entrega fallida',
      entity:    'entrega',
      entity_id: deliveryId,
      user_name: driverName || 'chofer',
      user_role: 'driver',
      ip_address: ip,
      user_agent: req.headers.get('user-agent') || 'unknown',
      module:    'Entregas',
      metadata: {
        factura:           delivery?.invoice || null,
        cliente:           delivery?.client_name || null,
        direccion:         delivery?.address || null,
        parada:            delivery?.stop_order || null,
        ruta_id:           delivery?.route_id || null,
        ruta_code:         (route as any)?.route_code || null,
        ruta_fecha:        (route as any)?.date || null,
        valor_mercancia:   delivery?.merchandise_value || null,
        motivo_fallo:      status === 'failed' ? (notes || 'Sin motivo') : null,
        entrega_parcial:   status === 'partial',
        cantidad_parcial:  partialQuantity || null,
        fotos_evidencia:   photoUrls.length > 0 ? `${photoUrls.length} fotos` : 'No',
        estado_anterior:   'pending',
        estado_nuevo:      newStatus,
      },
      created_at: new Date().toISOString(),
    });

    // Notificar al admin cuando hay una entrega completada o fallida
    if (status === 'completed' || status === 'failed') {
      const notifTitle = status === 'completed'
        ? '✅ Entrega completada'
        : '❌ Entrega fallida';
      const notifBody = status === 'completed'
        ? `${driverName} completó la entrega ${delivery?.invoice || ''} — ${delivery?.client_name || ''}`
        : `${driverName} no pudo entregar ${delivery?.invoice || ''} — ${notes || 'Sin motivo'}`;

      await supabaseAdmin.from('notifications').insert({
        type:        status === 'completed' ? 'delivery_completed' : 'delivery_failed',
        title:       notifTitle,
        body:        notifBody,
        entity_id:   deliveryId,
        target_role: 'admin',
        read:        false,
        metadata: {
          cliente:   delivery?.client_name || null,
          direccion: delivery?.address || null,
          factura:   delivery?.invoice || null,
          ruta_code: route?.route_code || null,
          ...(status !== 'completed' ? { motivo: notes || 'Sin motivo especificado' } : {}),
        },
      }).then(({error}) => { if (error) console.error(error); }); // No bloquear si falla
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[driver/deliver] Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
