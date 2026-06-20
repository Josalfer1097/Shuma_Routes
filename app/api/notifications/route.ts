import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetRole = searchParams.get('target_role'); // 'admin' o driver_id

    if (!targetRole) {
      return NextResponse.json({ ok: false, error: 'target_role is required' }, { status: 400 });
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
    const { ids } = await req.json(); // array of notification IDs to mark as read

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'ids array is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .in('id', ids);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications] PATCH Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
