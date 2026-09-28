/** Adjunto tal como lo devuelve GET /api/attachments (con liga temporal). */
export interface AttachmentItem {
  id: string;
  route_id: string | null;
  route_code: string | null;
  driver_name: string | null;
  delivery_id: string | null;
  invoice: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  category: 'evidencia_entrega' | 'documento' | 'foto';
  description: string | null;
  uploaded_by_name: string;
  uploaded_by_role: string;
  created_at: string;
  archived_at: string | null;
  url: string | null;
}

export const CATEGORY_LABEL: Record<AttachmentItem['category'], string> = {
  evidencia_entrega: 'Evidencia de entrega',
  documento: 'Documento',
  foto: 'Foto',
};

export const isImage = (a: AttachmentItem) => a.mime_type.startsWith('image/');

export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? (n / (1024 * 1024)).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

export const formatDateMx = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' });
