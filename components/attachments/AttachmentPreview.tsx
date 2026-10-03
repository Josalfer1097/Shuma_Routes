'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ChevronLeft, ChevronRight, ExternalLink, FileText, X } from 'lucide-react';
import { CATEGORY_LABEL, formatBytes, formatDateMx, isImage, type AttachmentItem } from './types';

/**
 * Vista ampliada de uno o varios adjuntos (por ejemplo, todas las fotos de una factura).
 * Se recorre con las flechas de pantalla o del teclado; se cierra con Esc, clic afuera o ×.
 */
export default function AttachmentPreview({
  items,
  startIndex = 0,
  onClose,
  onArchive,
}: {
  items: AttachmentItem[];
  startIndex?: number;
  onClose: () => void;
  /** Si se pasa, aparece "Archivar" (pide motivo). El archivo se conserva; solo deja de mostrarse. */
  onArchive?: (item: AttachmentItem, reason: string) => Promise<void>;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), items.length - 1));
  const item = items[index];
  const many = items.length > 1;
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState('');
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const confirmArchive = async () => {
    if (!onArchive || reason.trim().length < 5) {
      setArchiveError('Escribe el motivo (al menos 5 caracteres).');
      return;
    }
    setSaving(true);
    setArchiveError(null);
    try {
      await onArchive(item, reason.trim());
      onClose();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'No se pudo archivar');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && many) setIndex(i => (i + 1) % items.length);
      if (e.key === 'ArrowLeft' && many) setIndex(i => (i - 1 + items.length) % items.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, many, items.length]);

  if (!item) return null;

  const go = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex(i => (i + delta + items.length) % items.length);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      // stopPropagation: en React el clic "sube" a quien abrió la vista previa (Expediente o bitácora)
      onClick={e => { e.stopPropagation(); onClose(); }}
      role="dialog"
      // Marca de capa superior: las ventanas no se cierran con Esc mientras esta vista esté abierta
      data-overlay-top="true"
      aria-label={'Vista previa de ' + item.file_name}
    >
      <div className="max-w-4xl w-full max-h-full flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 text-slate-200">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {(item.invoice ? 'Factura ' + item.invoice : item.file_name) + (many ? ' · ' + (index + 1) + ' de ' + items.length : '')}
            </p>
            <p className="text-[11px] text-slate-400">
              {CATEGORY_LABEL[item.category] + ' · ' + formatDateMx(item.created_at) + ' · ' + item.uploaded_by_name +
                (item.route_code ? ' · ' + item.route_code : '') + ' · ' + formatBytes(item.size_bytes)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-300 hover:text-white">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir en otra pestaña
              </a>
            )}
            {onArchive && !archiving && (
              <button onClick={() => setArchiving(true)} className="flex items-center gap-1 text-xs text-amber-300 hover:text-white">
                <Archive className="w-3.5 h-3.5" /> Archivar
              </button>
            )}
            <button onClick={onClose} className="text-slate-300 hover:text-white" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {archiving && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 grid gap-2">
            <p className="text-xs text-amber-200">
              El archivo deja de mostrarse, pero se conserva y queda registrado en la bitácora. ¿Por qué lo archivas?
            </p>
            <input
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void confirmArchive(); }}
              placeholder="Motivo, por ejemplo: foto borrosa, se subió a la factura equivocada"
              maxLength={300}
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
            />
            {archiveError && <p className="text-xs text-red-300">{archiveError}</p>}
            <div className="flex gap-2">
              <button onClick={() => void confirmArchive()} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50">
                {saving ? 'Archivando…' : 'Archivar'}
              </button>
              <button onClick={() => { setArchiving(false); setArchiveError(null); }} className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="relative flex-1 min-h-0 flex items-center justify-center">
          {many && (
            <button
              onClick={go(-1)}
              className="absolute left-0 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {!item.url ? (
            <p className="text-sm text-red-300">No se pudo generar la liga de este archivo. Cierra y vuelve a abrir.</p>
          ) : isImage(item) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={item.id} src={item.url} alt={item.file_name} className="max-h-[75vh] max-w-full object-contain rounded-lg" />
          ) : (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-3 px-10 py-8 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 hover:border-blue-500"
            >
              <FileText className="w-12 h-12 text-red-300" />
              <span className="text-sm">{item.file_name}</span>
              <span className="text-xs text-blue-300">Abrir el PDF</span>
            </a>
          )}

          {many && (
            <button
              onClick={go(1)}
              className="absolute right-0 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Siguiente"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>

        {many && (
          <div className="flex justify-center gap-1.5">
            {items.map((it, i) => (
              <button
                key={it.id}
                onClick={e => { e.stopPropagation(); setIndex(i); }}
                className={'h-1.5 rounded-full transition-all ' + (i === index ? 'w-5 bg-blue-400' : 'w-1.5 bg-slate-500 hover:bg-slate-300')}
                aria-label={'Ver archivo ' + (i + 1)}
              />
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-400 text-center">La liga de este archivo caduca en unos minutos por seguridad.</p>
      </div>
    </div>,
    document.body
  );
}
