import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { deliveryId, status, notes, driverName } = await req.json();

    if (!deliveryId || !status) {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
    }

    // Actualizar el status de la entrega
    const { error: updateErr } = await supabaseAdmin
      .from('deliveries')
      .update({
        status: status === 'completed' ? 'delivered' : 'failed',
        notes:  notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);

    if (updateErr) throw updateErr;

    // Registrar en delivery_events
    const { error: evtErr } = await supabaseAdmin
      .from('delivery_events')
      .insert({
        delivery_id: deliveryId,
        event_type:  status === 'completed' ? 'delivered' : 'failed',
        notes:       notes || null,
        created_at:  new Date().toISOString(),
      });

    if (evtErr) console.warn('[deliver] Event insert error:', evtErr.message);

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      action:    status === 'completed' ? 'Entrega completada' : 'Entrega fallida',
      entity:    'entrega',
      entity_id: deliveryId,
      user_name: driverName || 'chofer',
      user_role: 'driver',
      module:    'Entregas',
      metadata:  { notes },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[driver/deliver] Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
