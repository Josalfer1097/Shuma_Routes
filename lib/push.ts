import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Envío de notificaciones push directo desde el servidor.
 *
 * Antes, los endpoints llamaban a /api/push/send por HTTP usando
 * NEXT_PUBLIC_APP_URL (con respaldo a localhost) y sin esperar la respuesta:
 * en Vercel la función puede congelarse antes de que salga la petición, y sin
 * la variable el destino era localhost. Además se enviaba por ROL, así que
 * todos los choferes recibían avisos dirigidos a uno solo.
 *
 * Ahora: se envía directo con web-push, se espera el resultado y se puede
 * dirigir a usuarios específicos (user_profiles.id).
 */

let vapidReady = false;

function ensureVapid(): void {
  if (vapidReady) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('[push] Faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY en las variables de entorno.');
  }
  const email = process.env.VAPID_EMAIL || 'admin@example.com';
  webpush.setVapidDetails(email.startsWith('mailto:') ? email : `mailto:${email}`, publicKey, privateKey);
  vapidReady = true;
}

export interface PushTarget {
  /** user_profiles.id de los destinatarios. Tiene prioridad sobre role. */
  userIds?: string[];
  /** Rol completo (ej. 'admin'). Usar solo para avisos generales. */
  role?: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
}

export async function sendPush(target: PushTarget, message: PushMessage): Promise<PushResult> {
  ensureVapid();

  const hasUsers = Array.isArray(target.userIds) && target.userIds.length > 0;
  if (!hasUsers && !target.role) {
    throw new Error('[push] Se requiere userIds o role como destino.');
  }

  let query = supabaseAdmin.from('push_subscriptions').select('endpoint, p256dh, auth');
  query = hasUsers ? query.in('user_id', target.userIds as string[]) : query.eq('user_role', target.role as string);

  const { data: subs, error } = await query;
  if (error) throw new Error(`[push] Error leyendo suscripciones: ${error.message}`);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url || '/',
    tag: message.tag,
  });

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh as string, auth: sub.auth as string } },
        payload
      )
    )
  );

  const goneEndpoints: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const reason = r.reason as { statusCode?: number } | undefined;
      if (reason?.statusCode === 410 || reason?.statusCode === 404) goneEndpoints.push(subs[i].endpoint);
    }
  });

  if (goneEndpoints.length > 0) {
    const { error: delErr } = await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', goneEndpoints);
    if (delErr) console.error('[push] No se pudieron limpiar suscripciones vencidas:', delErr);
  }

  return {
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
  };
}

/** Devuelve los user_profiles.id asociados a un drivers.id. */
export async function userIdsForDriver(driverId: string | null | undefined): Promise<string[]> {
  if (!driverId) return [];
  const { data, error } = await supabaseAdmin.from('user_profiles').select('id').eq('driver_id', driverId);
  if (error) throw new Error(`[push] Error buscando usuario del chofer: ${error.message}`);
  return (data || []).map(u => u.id as string);
}

/**
 * Envía un push a un chofer sin romper la operación principal si falla.
 * El error se registra con contexto (no se silencia).
 */
export async function notifyDriverSafely(
  driverId: string | null | undefined,
  message: PushMessage,
  context: string
): Promise<void> {
  try {
    const userIds = await userIdsForDriver(driverId);
    if (userIds.length === 0) {
      console.warn(`[${context}] Push omitido: el chofer ${driverId ?? '(sin id)'} no tiene usuario vinculado.`);
      return;
    }
    const result = await sendPush({ userIds }, message);
    if (result.failed > 0) console.error(`[${context}] Push con ${result.failed} envíos fallidos.`);
  } catch (err) {
    console.error(`[${context}] Error enviando push:`, err);
  }
}
