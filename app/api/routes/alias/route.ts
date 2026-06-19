import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(req: NextRequest) {
  try {
    const { routeId, alias } = await req.json();
    if (!routeId) return NextResponse.json({ ok: false }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('routes')
      .update({ route_alias: alias?.trim() || null })
      .eq('id', routeId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[routes/alias] Error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
