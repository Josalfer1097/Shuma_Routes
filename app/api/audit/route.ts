import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, entity, entity_id, user_name, user_role, module, metadata } = body;

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    const userAgent = req.headers.get('user-agent') || 'unknown';

    const { error } = await supabaseAdmin.from('audit_log').insert({
      action,
      entity,
      entity_id,
      user_name,
      user_role,
      ip_address: ip,
      user_agent: userAgent,
      module: module || 'general',
      metadata,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Audit POST error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const module    = searchParams.get('module') || '';
    const user_name = searchParams.get('user_name') || '';
    const dateFrom  = searchParams.get('dateFrom') || '';
    const entity_id = searchParams.get('entity_id') || '';
    const limit     = parseInt(searchParams.get('limit') || '500');

    let query = supabaseAdmin
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (module)    query = query.eq('module', module);
    if (user_name) query = query.eq('user_name', user_name);
    if (dateFrom)  query = query.gte('created_at', new Date(dateFrom).toISOString());
    if (entity_id) query = query.eq('entity_id', entity_id);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error('Audit GET error:', err);
    return NextResponse.json({ ok: false, data: [] }, { status: 500 });
  }
}
