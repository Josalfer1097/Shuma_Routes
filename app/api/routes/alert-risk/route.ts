import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { routeId, routeName, routeCode, deadline } = await req.json();

    if (!routeId || !routeName) {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
    }

    // Evitar duplicados: si ya existe una notificación de riesgo sin leer
    // para esta ruta, no crear otra
    const { data: existing } = await supabaseAdmin
      .from('notifications')
      .select('id')
      .eq('type', 'route_at_risk')
      .eq('entity_id', routeId)
      .eq('read', false)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await supabaseAdmin.from('notifications').insert({
      type: 'route_at_risk',
      title: 'Ruta en riesgo',
      body: `${routeName} puede no llegar antes de las ${deadline || '17:45'}.`,
      entity_id: routeId,
      target_role: 'admin',
      metadata: {
        ruta_code: routeCode || null,
        hora_limite: deadline || '17:45',
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[routes/alert-risk] POST Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
