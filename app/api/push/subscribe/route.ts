import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { subscription, userRole, userId } = await req.json();
    if (!subscription?.endpoint) {
      return NextResponse.json({ ok: false, error: 'Sin endpoint' }, { status: 400 });
    }
    await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        endpoint:   subscription.endpoint,
        p256dh:     subscription.keys?.p256dh,
        auth:       subscription.keys?.auth,
        user_role:  userRole,
        user_id:    userId || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
