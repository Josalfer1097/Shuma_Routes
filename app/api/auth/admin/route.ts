import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logAction } from '@/lib/auditLogger';

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

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
    
  const ua = req.headers.get('user-agent') || 'unknown';

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
    // Registrar intento fallido también
    await logAction(
      'login_failed',
      'session',
      null,
      username.toLowerCase().trim(),
      'unknown',
      'Autenticación',
      { reason: 'Usuario no encontrado' },
      ip
    );
    return NextResponse.json({ ok: false, error: 'Usuario no encontrado' }, { status: 401 });
  }

  if (data.password_hash !== password) {
    await logAction(
      'login_failed',
      'session',
      null,
      data.username,
      data.role,
      'Autenticación',
      { reason: 'Contraseña incorrecta' },
      ip
    );
    return NextResponse.json({ ok: false, error: 'Contraseña incorrecta' }, { status: 401 });
  }

  // Login exitoso
  await logAction(
    'Inicio de sesión',
    'session',
    data.id,
    data.username,
    data.role,
    'Autenticación',
    { 
      full_name: data.full_name,
      device: parseDevice(ua)
    },
    ip,
    ua
  );

  await supabaseAdmin
    .from('user_profiles')
    .update({ last_login: new Date().toISOString() })
    .eq('id', data.id);

  return NextResponse.json({
    ok: true,
    role: data.role,
    username: data.username,
    full_name: data.full_name,
  });
}
