import { supabaseAdmin } from '@/lib/supabase';

/**
 * Expediente: reglas de archivos y ligas temporales.
 *
 * Los archivos viven en un bucket PRIVADO. Nunca se guarda una liga pública:
 * se guarda la ruta interna (storage_path) y la liga se genera al momento de verla,
 * con caducidad corta. Así el almacenamiento puede cambiar sin romper registros.
 */
export const ATTACHMENTS_BUCKET = 'expediente';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB (igual al límite del bucket)
export const SIGNED_URL_SECONDS = 5 * 60;             // las ligas caducan en 5 minutos

export const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export type AttachmentCategory = 'evidencia_entrega' | 'documento' | 'foto';

/** Valida tipo y tamaño. Devuelve un mensaje de error en español o null si es válido. */
export function validateAttachment(file: File): string | null {
  if (!ALLOWED_MIME[file.type]) return 'Tipo de archivo no permitido. Solo fotos (JPG, PNG, WEBP) y PDF.';
  if (file.size <= 0) return 'El archivo está vacío.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'El archivo pesa más de 10 MB.';
  return null;
}

/** Nombre de carpeta seguro a partir de una factura o código. */
export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 40) || 'sin-codigo';
}

/** Genera ligas temporales para varias rutas internas; las que fallen quedan en null. */
export async function signPaths(paths: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  if (paths.length === 0) return result;
  const { data, error } = await supabaseAdmin.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) throw new Error('No se pudieron generar las ligas temporales: ' + error.message);
  (data || []).forEach(item => {
    if (item.path) result[item.path] = item.error ? null : item.signedUrl;
  });
  return result;
}
