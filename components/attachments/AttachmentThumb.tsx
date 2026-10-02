'use client';

import { FileText } from 'lucide-react';
import { isImage, type AttachmentItem } from './types';

/** Miniatura cuadrada de un adjunto (foto o PDF). */
export default function AttachmentThumb({ item, onOpen, size = 72 }: { item: AttachmentItem; onOpen: () => void; size?: number }) {
  return (
    <button
      onClick={onOpen}
      title={item.file_name}
      style={{ width: size, height: size }}
      className="relative shrink-0 rounded-lg overflow-hidden border border-shuma-border bg-slate-900 hover:border-blue-400 transition-colors"
    >
      {item.url && isImage(item) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={item.file_name} loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-300">
          <FileText className="w-6 h-6 text-red-300" />
          <span className="text-[10px] uppercase">{isImage(item) ? 'foto' : 'pdf'}</span>
        </span>
      )}
    </button>
  );
}
