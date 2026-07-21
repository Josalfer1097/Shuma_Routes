import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { routeId, driverId } = await req.json();
    if (!routeId || !driverId) return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('routes')
      .update({
        closure_status: 'requested',
        closure_requested_at: new Date().toISOString(),
        closure_requested_by: driverId,
        closure_reject_reason: null, // Clear any previous rejection
      })
      .eq('id', routeId);

    if (error) throw error;

    const { data: routeData } = await supabaseAdmin.from('routes').select('route_code, route_alias').eq('id', routeId).single();
    const routeName = routeData?.route_alias || routeData?.route_code || 'Ruta';

    const { data: driverInfo } = await supabaseAdmin.from('drivers').select('name').eq('id', driverId).single();
    const driverName = driverInfo?.name || 'Chofer';

    // Resumen de entregas de esta ruta, para dar contexto útil sin exponer IDs
    const { data: routeDeliveries } = await supabaseAdmin
      .from('deliveries')
      .select('status')
      .eq('route_id', routeId);

    const resumen = (routeDeliveries || []).reduce((acc: Record<string, number>, d) => {
      acc[d.status] = (acc[d.status] || 0) + 1;
      return acc;
    }, {});

    await supabaseAdmin.from('notifications').insert({
      type: 'route_closure_requested',
      title: 'Solicitud de Cierre',
      body: `${driverName} ha solicitado cerrar la ruta ${routeName}`,
      entity_id: routeId,
      target_role: 'admin',
      metadata: {
        chofer: driverName,
        ruta_code: routeData?.route_code || null,
        entregadas: resumen.delivered || 0,
        parciales: resumen.partial || 0,
        fallidas: resumen.failed || 0,
        sin_completar: (resumen.pending || 0) + (resumen.in_route || 0),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[close-request]', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
