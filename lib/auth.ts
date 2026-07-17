import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'shuma_session';
const secret = new TextEncoder().encode(process.env.SESSION_JWT_SECRET || '');

export interface SessionPayload {
  sub: string;        // user_profiles.id
  username: string;
  role: string;
  fullName?: string;
  driverId?: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12, // 12 horas
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Verifica la sesión de una request de API. Uso:
 *   const auth = await requireAuth(req, ['admin', 'logistics']);
 *   if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
 *   // auth.user.sub, auth.user.role, etc.
 */
export async function requireAuth(
  req: NextRequest,
  allowedRoles?: string[]
): Promise<{ ok: true; user: SessionPayload } | { ok: false; status: number; error: string }> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, status: 401, error: 'No autenticado' };

  const session = await verifySession(token);
  if (!session) return { ok: false, status: 401, error: 'Sesión inválida o expirada' };

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return { ok: false, status: 403, error: 'No tienes permiso para esta acción' };
  }
  return { ok: true, user: session };
}

/**
 * Autoriza una request que puede venir de un usuario (cookie de sesión)
 * o de otro endpoint del propio servidor (header con secreto interno).
 * Necesario para endpoints como /api/push/send, que se invocan server-to-server.
 */
export async function requireAuthOrInternal(
  req: NextRequest,
  allowedRoles?: string[]
): Promise<{ ok: true; user: SessionPayload | null } | { ok: false; status: number; error: string }> {
  const internalSecret = req.headers.get('x-internal-secret');
  if (internalSecret && internalSecret === process.env.INTERNAL_API_SECRET) {
    return { ok: true, user: null }; // llamada interna del servidor
  }
  const auth = await requireAuth(req, allowedRoles);
  if (!auth.ok) return auth;
  return { ok: true, user: auth.user };
}
