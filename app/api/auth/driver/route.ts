import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function parseDevice(ua: string): string {
  if (!ua) return 'Dispositivo Desconocido';
  if (/iPhone/i.test(ua)) return '📱 iPhone';
  if (/iPad/i.test(ua)) return '📱 iPad';
  if (/Android.*Mobile/i.test(ua)) return '📱 Android';
  if (/Android/i.test(ua)) return '📱 Android Tablet';
  if (/Macintosh/i.test(ua)) return '💻 Mac';
  if (/Windows/i.test(ua)) return '🖥️ Windows';
  if (/Linux/i.test(ua)) return '🖥️ Linux';
  return `💻 ${ua.substring(0, 15)}...`;
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: 'Faltan credenciales' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, username, full_name, role, active, password_hash, driver_id')
    .eq('username', username.toLowerCase().trim())
    .eq('active', true)
    .eq('role', 'driver')
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'Chofer no encontrado' }, { status: 401 });
  }

  if (data.password_hash !== password) {
    return NextResponse.json({ ok: false, error: 'Contraseña incorrecta' }, { status: 401 });
  }

  const ua = req.headers.get('user-agent') || 'unknown';

  // Registrar en audit_log
  await supabaseAdmin.from('audit_log').insert({
    action: 'login_success',
    entity: 'session',
    user_name: data.username,
    user_role: 'driver',
    ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    user_agent: ua,
    metadata: { 
      full_name: data.full_name, 
      driver_id: data.driver_id,
      device: parseDevice(ua)
    }
  });

  await supabaseAdmin
    .from('user_profiles')
    .update({ last_login: new Date().toISOString() })
    .eq('id', data.id);

  return NextResponse.json({
    ok: true,
    role: 'driver',
    username: data.username,
    full_name: data.full_name,
    driver_id: data.driver_id
  });
}
