import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

// Resuelve a qué target_role tiene derecho la sesión actual:
// admin/logistics/viewer solo pueden ver 'admin'; un chofer solo puede
// ver su propio driver_id, nunca el de otro.
function resolveAllowedTargetRole(role: string, driverId: string | null): string | null {
  if (role === 'admin' || role === 'logistics' || role === 'viewer') return 'admin';
  if (role === 'driver') return driverId;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { searchParams } = new URL(req.url);
    const targetRole = searchParams.get('target_role'); // 'admin' o driver_id

    if (!targetRole) {
      return NextResponse.json({ ok: false, error: 'target_role is required' }, { status: 400 });
    }

    const allowed = resolveAllowedTargetRole(session.user.role, session.user.driverId || null);
    if (!allowed || allowed !== targetRole) {
      return NextResponse.json({ ok: false, error: 'No tienes permiso sobre estas notificaciones' }, { status: 403 });
    }

    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('target_role', targetRole)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ ok: true, notifications });
  } catch (err) {
    console.error('[notifications] GET Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { ids } = await req.json(); // array of notification IDs to mark as read

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'ids array is required' }, { status: 400 });
    }

    const allowed = resolveAllowedTargetRole(session.user.role, session.user.driverId || null);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 });
    }

    // Se restringe la actualización a solo las notificaciones que
    // pertenecen al target_role permitido, aunque lleguen ids de otras
    // (esas simplemente no se tocan, en vez de fallar de forma ruidosa).
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .in('id', ids)
      .eq('target_role', allowed);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications] PATCH Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
