import { compressImage } from '@/lib/imageCompress';

export interface UploadTarget {
  routeId?: string;
  deliveryId?: string;
}

/**
 * Sube un archivo al Expediente directo a Supabase (sin pasar por Vercel):
 * 1) pide al servidor una liga firmada  2) sube el archivo  3) el servidor lo registra.
 * Las fotos de más de 1.5 MB se reducen antes de subir (se ven igual, suben más rápido).
 */
export async function uploadAttachment(
  original: File,
  target: UploadTarget,
  opts: { category: 'documento' | 'foto'; description?: string }
): Promise<void> {
  const file = original.type.startsWith('image/') && original.size > 1.5 * 1024 * 1024
    ? await compressImage(original)
    : original;

  const prep = await fetch('/api/attachments/upload-url', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...target,
      fileName: original.name,
      mimeType: file.type,
      size: file.size,
      category: opts.category,
      description: opts.description || undefined,
    }),
  });
  const prepJson = await prep.json();
  if (!prep.ok || !prepJson.ok) throw new Error(prepJson.error || 'No se pudo preparar la subida');

  // Mismo formato que usa la librería oficial de Supabase para ligas firmadas
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', file);
  const headers: Record<string, string> = { 'x-upsert': 'false' };
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anon) headers.apikey = anon; // llave pública; el permiso real lo da el token de la liga
  const put = await fetch(prepJson.signedUrl, { method: 'PUT', body: form, headers });
  if (!put.ok) {
    const detail = await put.text().catch(() => '');
    throw new Error('El almacenamiento rechazó el archivo (' + put.status + ')' + (detail ? ': ' + detail.slice(0, 120) : ''));
  }

  const conf = await fetch('/api/attachments/confirm', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: prepJson.intent }),
  });
  const confJson = await conf.json();
  if (!conf.ok || !confJson.ok) throw new Error(confJson.error || 'No se pudo registrar el archivo');
}

/** Archiva un adjunto con motivo (no se borra: deja de mostrarse y queda en la bitácora). */
export async function archiveAttachment(id: string, reason: string): Promise<void> {
  const res = await fetch('/api/attachments/' + encodeURIComponent(id), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudo archivar');
}
