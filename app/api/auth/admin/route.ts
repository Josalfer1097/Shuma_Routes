import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logAction } from '@/lib/auditLogger';
import { verifyPassword, hashPassword } from '@/lib/passwordAuth';
import { signSession, setSessionCookie } from '@/lib/auth';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const GENERIC_ERROR = 'Usuario o contraseña incorrectos';

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
  // Diagnóstico temporal: confirmar que el secreto de sesión llegó al servidor
  const hasSecret = !!process.env.SESSION_JWT_SECRET;
  const secretLen = (process.env.SESSION_JWT_SECRET || '').length;
  if (!hasSecret) {
    console.error('[auth/admin] SESSION_JWT_SECRET NO está definida en el entorno');
    return NextResponse.json({
      ok: false,
      error: 'Error de configuración del servidor. Contacta a TI.',
      diagnostico: 'SESSION_JWT_SECRET ausente',
    }, { status: 500 });
  }
  console.log('[auth/admin] SESSION_JWT_SECRET presente, longitud:', secretLen);

  const { username, password } = await req.json();

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const ua = req.headers.get('user-agent') || 'unknown';

  if (!username || !password) {
    return NextResponse.json({ ok: false, code: 'missing_fields', error: 'Faltan credenciales' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, username, full_name, role, active, password_hash, failed_attempts, locked_until')
    .eq('username', username.toLowerCase().trim())
    .eq('active', true)
    .in('role', ['admin', 'logistics', 'viewer'])
    .single();

  if (error || !data) {
    // Usuario inexistente: mismo mensaje genérico, sin registrar bloqueo (no hay fila donde guardarlo)
    await logAction('login_failed', 'session', null, username.toLowerCase().trim(), 'unknown',
      'Autenticación', { reason: 'invalid_credentials' }, ip);
    return NextResponse.json({ ok: false, code: 'invalid_credentials', error: GENERIC_ERROR }, { status: 401 });
  }

  // ¿Cuenta bloqueada?
  if (data.locked_until && new Date(data.locked_until).getTime() > Date.now()) {
    const retryAfterSeconds = Math.ceil((new Date(data.locked_until).getTime() - Date.now()) / 1000);
    await logAction('login_blocked', 'session', data.id, data.username, data.role,
      'Autenticación', { retryAfterSeconds }, ip);
    return NextResponse.json({
      ok: false, code: 'account_locked',
      error: 'Cuenta bloqueada temporalmente por intentos fallidos',
      retryAfterSeconds,
    }, { status: 429 });
  }

  const { valid, needsRehash } = await verifyPassword(password, data.password_hash);

  if (!valid) {
    const newAttempts = (data.failed_attempts || 0) + 1;
    const update: Record<string, unknown> = { failed_attempts: newAttempts };
    let retryAfterSeconds: number | undefined;

    if (newAttempts >= MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      update.locked_until = lockedUntil.toISOString();
      retryAfterSeconds = LOCK_MINUTES * 60;
    }

    await supabaseAdmin.from('user_profiles').update(update).eq('id', data.id);
    await logAction('login_failed', 'session', data.id, data.username, data.role,
      'Autenticación', { reason: 'invalid_credentials', attempts: newAttempts }, ip);

    if (retryAfterSeconds) {
      return NextResponse.json({
        ok: false, code: 'account_locked',
        error: 'Cuenta bloqueada temporalmente por intentos fallidos',
        retryAfterSeconds,
      }, { status: 429 });
    }
    return NextResponse.json({ ok: false, code: 'invalid_credentials', error: GENERIC_ERROR }, { status: 401 });
  }

  // Login exitoso: resetear contador, rehashear si venía en texto plano
  const updates: Record<string, unknown> = {
    failed_attempts: 0,
    locked_until: null,
    last_login: new Date().toISOString(),
  };
  if (needsRehash) {
    updates.password_hash = await hashPassword(password);
  }
  await supabaseAdmin.from('user_profiles').update(updates).eq('id', data.id);

  await logAction('Inicio de sesión', 'session', data.id, data.username, data.role,
    'Autenticación', { full_name: data.full_name, device: parseDevice(ua) }, ip, ua);

  const token = await signSession({
    sub: data.id, username: data.username, role: data.role, fullName: data.full_name,
  });

  const res = NextResponse.json({
    ok: true, role: data.role, username: data.username, full_name: data.full_name,
  });
  setSessionCookie(res, token);
  return res;
}
