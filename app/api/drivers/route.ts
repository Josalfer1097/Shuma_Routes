import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics', 'viewer']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const { data: drivers, error } = await supabaseAdmin
      .from('drivers')
      .select('id, name, employee_id, active')
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    const { data: vehicles, error: vErr } = await supabaseAdmin
      .from('vehicles')
      .select('id, plate, type, max_load, active')
      .eq('active', true)
      .order('type', { ascending: true });

    if (vErr) throw vErr;

    return NextResponse.json({
      ok: true,
      drivers: drivers || [],
      vehicles: vehicles || []
    });
  } catch (err) {
    console.error('[/api/drivers] Error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}
