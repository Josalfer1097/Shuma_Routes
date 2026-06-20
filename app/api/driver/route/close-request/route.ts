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

    await supabaseAdmin.from('notifications').insert({
      type: 'route_closure_requested',
      title: 'Solicitud de Cierre',
      body: `El chofer ha solicitado cerrar la ruta ${routeName}`,
      entity_id: routeId,
      target_role: 'admin',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[close-request]', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
