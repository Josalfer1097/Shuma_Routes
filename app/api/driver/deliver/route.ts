import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { deliveryId, status, notes, partialQuantity, photoUrls = [], driverName } = await req.json();

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[driver/deliver] Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
