import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: 'Faltan credenciales' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, username, full_name, role, active, password_hash')
    .eq('username', username.toLowerCase().trim())
    .eq('active', true)
    .in('role', ['admin', 'logistics', 'viewer'])
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'Usuario no encontrado' }, { status: 401 });
  }

  if (data.password_hash !== password) {
    return NextResponse.json({ ok: false, error: 'Contraseña incorrecta' }, { status: 401 });
  }

  // Registrar login en audit_log
  await supabaseAdmin.from('audit_log').insert({
    action: 'login_success',
    entity: 'session',
    user_name: data.username,
    user_role: data.role,
    ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    user_agent: req.headers.get('user-agent') || 'unknown',
    metadata: { full_name: data.full_name }
  });

  // Actualizar last_login
  await supabaseAdmin
    .from('user_profiles')
    .update({ last_login: new Date().toISOString() })
    .eq('id', data.id);

  return NextResponse.json({
    ok: true,
    role: data.role,
    username: data.username,
    full_name: data.full_name
  });
}
