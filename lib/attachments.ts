import { SignJWT, jwtVerify } from 'jose';
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

// ─────────────────────────────────────────────────────────────
// Subida directa a Supabase (sin pasar por Vercel, que limita cada petición a 4.5 MB)
// 1) el servidor valida y entrega una liga firmada + un "permiso de registro" firmado
// 2) el navegador sube el archivo directo a Supabase con esa liga
// 3) el servidor verifica el permiso y que el archivo exista, y lo registra
// ─────────────────────────────────────────────────────────────

export interface UploadIntent {
  path: string;
  routeId: string | null;
  deliveryId: string | null;
  invoice: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  category: AttachmentCategory;
  description: string | null;
  uid: string;
}

function intentSecret(): Uint8Array {
  const raw = process.env.SESSION_JWT_SECRET;
  if (!raw || raw.length < 16) throw new Error('[attachments] SESSION_JWT_SECRET no está configurada.');
  // Derivado del secreto de sesión, con propósito distinto: un permiso de subida no sirve como sesión
  return new TextEncoder().encode(raw + ':attachment-upload');
}

export async function signUploadIntent(intent: UploadIntent): Promise<string> {
  return new SignJWT({ ...intent } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(intentSecret());
}

export async function verifyUploadIntent(token: string): Promise<UploadIntent | null> {
  try {
    const { payload } = await jwtVerify(token, intentSecret());
    return payload as unknown as UploadIntent;
  } catch {
    return null;
  }
}

/** Valida tipo y tamaño declarados (antes de subir). */
export function validateDeclared(mimeType: string, size: number): string | null {
  if (!ALLOWED_MIME[mimeType]) return 'Tipo de archivo no permitido. Solo fotos (JPG, PNG, WEBP) y PDF.';
  if (!Number.isFinite(size) || size <= 0) return 'El archivo está vacío.';
  if (size > MAX_ATTACHMENT_BYTES) return 'El archivo pesa más de 10 MB.';
  return null;
}
