import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['driver']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { routeId, routeDriverId } = await req.json();
    const driverId = session.user.driverId;
    const driverName = session.user.fullName || 'chofer';

    if (!routeId || !routeDriverId || !driverId) {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
    }

    // Verificar pertenencia: el route_driver indicado debe ser del chofer autenticado
    const { data: routeDriverCheck } = await supabaseAdmin
      .from('route_drivers')
      .select('driver_id, route_id')
      .eq('id', routeDriverId)
      .single();

    if (!routeDriverCheck || routeDriverCheck.driver_id !== driverId || routeDriverCheck.route_id !== routeId) {
      return NextResponse.json({ ok: false, error: 'No tienes permiso sobre esta ruta' }, { status: 403 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const now = new Date().toISOString();

    // 1. Obtener route_code para la bitácora
    const { data: routeData } = await supabaseAdmin
      .from('routes')
      .select('route_code, date')
      .eq('id', routeId)
      .single();

    // 2. Actualizar status de TODAS las entregas de este chofer: pending → in_route
    const { error: updateErr } = await supabaseAdmin
      .from('deliveries')
      .update({ status: 'in_route', updated_at: now })
      .eq('route_driver_id', routeDriverId)
      .eq('status', 'pending');

    if (updateErr) throw updateErr;

    // 3. Obtener los IDs de las entregas para registrar delivery_events
    const { data: deliveries } = await supabaseAdmin
      .from('deliveries')
      .select('id')
      .eq('route_driver_id', routeDriverId);

    // 4. Insertar delivery_event "route_started" por cada entrega
    if (deliveries && deliveries.length > 0) {
      await supabaseAdmin.from('delivery_events').insert(
        deliveries.map(d => ({
          delivery_id: d.id,
          event_type:  'route_started',
          notes:       `Ruta iniciada por ${driverName}`,
          created_at:  now,
        }))
      );
    }

    // 5. Registrar en audit_log
    await supabaseAdmin.from('audit_log').insert({
      action:     'Ruta iniciada',
      entity:     'ruta',
      entity_id:  routeId,
      user_name:  driverName || 'chofer',
      user_role:  'driver',
      ip_address: ip,
      user_agent: req.headers.get('user-agent') || 'unknown',
      module:     'Rutas',
      metadata: {
        ruta_code:       routeData?.route_code || null,
        ruta_fecha:      routeData?.date || null,
        route_driver_id: routeDriverId,
        driver_id:       driverId,
        entregas_activadas: deliveries?.length || 0,
      },
      created_at: now,
    });

    // 6. Notificar al admin
    await supabaseAdmin.from('notifications').insert({
      type: 'route_started',
      title: 'Ruta Iniciada',
      body: `${driverName || 'Un chofer'} inició la ruta ${routeData?.route_code || ''}`,
      entity_id: routeId,
      target_role: 'admin',
      metadata: {
        chofer: driverName || 'Chofer',
        ruta_code: routeData?.route_code || null,
        entregas: deliveries?.length || 0,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[driver/route/start] Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
