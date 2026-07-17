import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['admin', 'logistics']);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const adminName = auth.user.fullName || auth.user.username;

    const { routeId, reason } = await req.json();
    if (!routeId) return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('routes')
      .update({
        closure_status: 'rejected',
        closure_resolved_at: new Date().toISOString(),
        closure_resolved_by: adminName,
        closure_reject_reason: reason || null,
      })
      .eq('id', routeId);

    if (error) throw error;

    // Marcar la notificación original de solicitud de cierre como leída
    await supabaseAdmin
      .from('notifications')
      .update({ read: true, type: 'route_closure_resolved' })
      .eq('entity_id', routeId)
      .eq('type', 'route_closure_requested');

    // Obtener info para notificar al chofer
    const { data: routeData } = await supabaseAdmin
      .from('routes')
      .select('route_code, route_alias, closure_requested_by')
      .eq('id', routeId)
      .single();

    if (routeData?.closure_requested_by) {
      const routeName = routeData.route_alias || routeData.route_code || 'Ruta';
      await supabaseAdmin.from('notifications').insert({
        type: 'route_closure_resolved',
        title: 'Cierre Rechazado',
        body: `Tu solicitud de cierre para ${routeName} fue rechazada. Motivo: ${reason || 'Sin detalles'}`,
        entity_id: routeId,
        target_role: routeData.closure_requested_by, // driverId
      });
    }

    fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/push/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({
        targetRole: 'driver',
        title: '❌ Cierre rechazado',
        body:  reason || 'Solicitud rechazada por el administrador',
        url:   '/driver',
        tag:   'route-close',
      }),
    }).catch(console.error);

    await supabaseAdmin.from('audit_log').insert({
      action:    'Cierre de ruta rechazado',
      entity:    'ruta',
      entity_id: routeId,
      user_name: adminName,
      user_role: auth.user.role,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      module:    'Rutas',
      metadata: {
        ruta_code: routeData?.route_code || null,
        solicitado_por: routeData?.closure_requested_by || null,
        accion: 'rechazado',
        motivo: reason || 'Sin detalles'
      },
      created_at: new Date().toISOString(),
    }).then(({error}) => { if (error) console.error(error); });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[close-reject]', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
