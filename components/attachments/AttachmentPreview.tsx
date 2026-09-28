'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileText, X } from 'lucide-react';
import { CATEGORY_LABEL, formatBytes, formatDateMx, isImage, type AttachmentItem } from './types';

/** Vista ampliada de un adjunto. Se cierra con Esc, con clic afuera o con la ×. */
export default function AttachmentPreview({ item, onClose }: { item: AttachmentItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9995] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      // stopPropagation: en React el clic "sube" a quien abrió la vista previa (Expediente o bitácora)
      onClick={e => { e.stopPropagation(); onClose(); }}
      role="dialog"
      aria-label={'Vista previa de ' + item.file_name}
    >
      <div className="max-w-4xl w-full max-h-full flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 text-slate-200">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{item.invoice ? 'Factura ' + item.invoice : item.file_name}</p>
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
            <button onClick={onClose} className="text-slate-300 hover:text-white" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center">
          {!item.url ? (
            <p className="text-sm text-red-300">No se pudo generar la liga de este archivo. Cierra y vuelve a abrir.</p>
          ) : isImage(item) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.file_name} className="max-h-[75vh] max-w-full object-contain rounded-lg" />
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
        </div>
        <p className="text-[10px] text-slate-500 text-center">La liga de este archivo caduca en unos minutos por seguridad.</p>
      </div>
    </div>,
    document.body
  );
}
