import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase';

webpush.setVapidDetails(
  process.env.VAPID_EMAIL?.startsWith('mailto:') 
    ? process.env.VAPID_EMAIL 
    : `mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { targetRole, title, body, url, tag } = await req.json();

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_role', targetRole);

    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const payload = JSON.stringify({ title, body, url: url || '/', tag });

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh!, auth: sub.auth! } },
          payload
        )
      )
    );

    const sent   = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    const goneEndpoints: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const err = (r as PromiseRejectedResult).reason;
        if (err?.statusCode === 410) goneEndpoints.push(subs[i].endpoint);
      }
    });
    if (goneEndpoints.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('endpoint', goneEndpoints);
    }

    return NextResponse.json({ ok: true, sent, failed });
  } catch (err) {
    console.error('Push send error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
