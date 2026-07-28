import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { subscription } = await req.json();
    if (!subscription?.endpoint) {
      return NextResponse.json({ ok: false, error: 'Sin endpoint' }, { status: 400 });
    }

    // Identidad SIEMPRE de la sesión, nunca del body: evita que alguien
    // se auto-registre como 'admin' y reciba pushes que no le corresponden.
    const userRole = session.user.role;
    const userId   = session.user.role === 'driver' ? session.user.driverId : null;

    await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        endpoint:   subscription.endpoint,
        p256dh:     subscription.keys?.p256dh,
        auth:       subscription.keys?.auth,
        user_role:  userRole,
        user_id:    userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
