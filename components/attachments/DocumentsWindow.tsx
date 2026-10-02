'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, Upload, X } from 'lucide-react';
import AttachmentThumb from './AttachmentThumb';
import AttachmentPreview from './AttachmentPreview';
import { CATEGORY_LABEL, formatDateMx, type AttachmentItem } from './types';
import { archiveAttachment, uploadAttachment, type UploadTarget } from '@/lib/uploadAttachment';

/**
 * Documentos de una ruta o de una entrega: ver, subir y archivar.
 * Ventana flotante que no bloquea la pantalla (se cierra con Esc o con ×).
 */
export default function DocumentsWindow({
  target,
  title,
  subtitle,
  canEdit,
  onClose,
}: {
  target: UploadTarget;
  title: string;
  subtitle?: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<'documento' | 'foto'>('documento');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (target.deliveryId) params.set('deliveryId', target.deliveryId);
      else if (target.routeId) params.set('routeId', target.routeId);
      const res = await fetch('/api/attachments?' + params.toString(), { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudieron cargar los documentos');
      setItems(json.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los documentos');
    } finally {
      setLoading(false);
    }
  }, [target.deliveryId, target.routeId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && preview === null) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, preview]);

  const onPick = (f: File | null) => {
    setUploadMsg(null);
    setFile(f);
    if (f) setCategory(f.type.startsWith('image/') ? 'foto' : 'documento');
  };

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      await uploadAttachment(file, target, { category, description });
      setUploadMsg({ ok: true, text: 'Archivo subido: ' + file.name });
      setFile(null);
      setDescription('');
      if (inputRef.current) inputRef.current.value = '';
      await load();
    } catch (err) {
      setUploadMsg({ ok: false, text: err instanceof Error ? err.message : 'No se pudo subir el archivo' });
    } finally {
      setUploading(false);
    }
  };

  const onArchive = async (item: AttachmentItem, reason: string) => {
    await archiveAttachment(item.id, reason);
    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  return createPortal(
    <div
      role="dialog"
      aria-label={'Documentos de ' + title}
      className="fixed z-[9985] right-4 top-16 w-[min(440px,calc(100vw-2rem))] max-h-[80vh] flex flex-col rounded-xl border border-shuma-border bg-slate-900/95 backdrop-blur shadow-2xl"
    >
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-shuma-border">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white flex items-center gap-1.5">
            <Paperclip className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="truncate">{'Documentos · ' + title}</span>
          </p>
          {subtitle && <p className="text-[11px] text-shuma-muted mt-0.5 truncate">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="text-shuma-muted hover:text-white" aria-label="Cerrar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-y-auto px-4 py-3 grid gap-3">
        {loading && <p className="text-xs text-shuma-muted">Cargando documentos…</p>}
        {error && <p className="text-xs text-red-300">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-xs text-shuma-muted">Todavía no hay archivos aquí.</p>
        )}
        {items.length > 0 && (
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(88px,1fr))]">
            {items.map((it, i) => (
              <div key={it.id} className="flex flex-col gap-1 min-w-0">
                <AttachmentThumb item={it} size={88} onOpen={() => setPreview(i)} />
                <p className="text-[10px] text-shuma-muted truncate" title={it.file_name}>
                  {CATEGORY_LABEL[it.category] + ' · ' + formatDateMx(it.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="rounded-lg border border-shuma-border bg-shuma-bg/60 p-3 grid gap-2">
            <p className="text-xs font-semibold text-slate-200">Subir archivo</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={e => onPick(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-300 file:mr-2 file:px-2 file:py-1 file:rounded-md file:border-0 file:bg-slate-700 file:text-slate-100"
            />
            <div className="flex gap-2">
              <select
                value={category}
                onChange={e => setCategory(e.target.value as 'documento' | 'foto')}
                className="px-2 py-1.5 rounded-lg bg-slate-900 border border-shuma-border text-xs text-slate-200"
              >
                <option value="documento">Documento</option>
                <option value="foto">Foto</option>
              </select>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descripción (opcional)"
                maxLength={300}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-slate-900 border border-shuma-border text-xs text-slate-200 focus:outline-none focus:border-blue-400"
              />
            </div>
            <p className="text-[10px] text-shuma-muted">Fotos (JPG, PNG, WEBP) o PDF, hasta 10 MB.</p>
            <button
              onClick={() => void submit()}
              disabled={!file || uploading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              <Upload className="w-3.5 h-3.5" /> {uploading ? 'Subiendo…' : 'Subir'}
            </button>
            {uploadMsg && (
              <p className={'text-xs ' + (uploadMsg.ok ? 'text-emerald-300' : 'text-red-300')}>{uploadMsg.text}</p>
            )}
          </div>
        )}
      </div>

      {preview !== null && (
        <AttachmentPreview
          items={items}
          startIndex={preview}
          onClose={() => setPreview(null)}
          onArchive={canEdit ? onArchive : undefined}
        />
      )}
    </div>,
    document.body
  );
}
