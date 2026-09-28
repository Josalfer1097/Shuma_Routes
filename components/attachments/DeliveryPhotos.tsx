'use client';

import { useState } from 'react';
import AttachmentThumb from './AttachmentThumb';
import AttachmentPreview from './AttachmentPreview';
import type { AttachmentItem } from './types';

/**
 * Fotos de evidencia de una entrega, cargadas bajo demanda (solo al pedirlas),
 * para no generar ligas temporales de cada renglón de la bitácora.
 */
export default function DeliveryPhotos({ deliveryId }: { deliveryId: string }) {
  const [items, setItems] = useState<AttachmentItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AttachmentItem | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/attachments?deliveryId=' + encodeURIComponent(deliveryId), { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudieron cargar las fotos');
      setItems(json.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las fotos');
    } finally {
      setLoading(false);
    }
  };

  if (items === null) {
    return (
      <div>
        <button
          onClick={e => { e.stopPropagation(); void load(); }}
          disabled={loading}
          className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 disabled:opacity-50"
        >
          {loading ? 'Cargando fotos…' : 'Ver fotos'}
        </button>
        {error && <p className="text-[11px] text-red-300 mt-1">{error}</p>}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-xs text-shuma-muted">Sin fotos en el Expediente (las tomadas antes de la v7.46.0 no se migraron).</p>;
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <div className="flex flex-wrap gap-2">
        {items.map(it => (
          <AttachmentThumb key={it.id} item={it} onOpen={() => setPreview(it)} />
        ))}
      </div>
      {preview && <AttachmentPreview item={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
