'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import FloatingWindow from '@/components/windows/FloatingWindow';
import AttachmentThumb from './AttachmentThumb';
import AttachmentPreview from './AttachmentPreview';
import { CATEGORY_LABEL, formatDateMx, type AttachmentItem } from './types';
import { archiveAttachment } from '@/lib/uploadAttachment';

interface DriverOption { id: string; name: string }

/** Archivos de una misma entrega (o factura) se muestran como un tarjetero. */
function groupKey(it: AttachmentItem): string {
  if (it.delivery_id) return 'delivery:' + it.delivery_id;
  if (it.invoice) return 'invoice:' + it.invoice;
  if (it.route_id) return 'route:' + it.route_id;
  return 'file:' + it.id;
}

const PAGE_SIZE = 48;

/**
 * Expediente: fotos y documentos adjuntos a rutas y facturas.
 * Solo consulta en esta versión; subir y archivar llegan en la siguiente.
 */
export default function ExpedienteModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [driverId, setDriverId] = useState('');
  const [category, setCategory] = useState('');
  const [format, setFormat] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [preview, setPreview] = useState<{ items: AttachmentItem[]; index: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Solo administración y logística archivan (el servidor también lo valida)
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    const role = sessionStorage.getItem('shuma_role') || '';
    setCanEdit(role === 'admin' || role === 'logistics');
  }, []);

  const onArchive = async (item: AttachmentItem, reason: string) => {
    await archiveAttachment(item.id, reason);
    setItems(prev => prev.filter(i => i.id !== item.id));
    setTotal(t => Math.max(0, t - 1));
  };

  // Búsqueda con pausa de 300 ms
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async (offset: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (q) params.set('q', q);
      if (driverId) params.set('driverId', driverId);
      if (category) params.set('category', category);
      if (format) params.set('format', format);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch('/api/attachments?' + params.toString(), { credentials: 'include', signal: controller.signal });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudo cargar el Expediente');
      setItems(prev => (offset === 0 ? json.items : [...prev, ...json.items]));
      setTotal(json.total);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'No se pudo cargar el Expediente');
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [q, driverId, category, format, from, to]);

  useEffect(() => {
    if (isOpen) void load(0);
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen || drivers.length > 0) return;
    fetch('/api/drivers', { credentials: 'include' })
      .then(r => r.json())
      .then(json => { if (json.ok) setDrivers((json.drivers || []).map((d: DriverOption) => ({ id: d.id, name: d.name }))); })
      .catch(err => console.error('[Expediente] No se pudieron cargar los choferes:', err));
  }, [isOpen, drivers.length]);


  // Agrupa conservando el orden (lo más reciente primero)
  const groups = useMemo(() => {
    const map = new Map<string, AttachmentItem[]>();
    items.forEach(it => {
      const k = groupKey(it);
      map.set(k, [...(map.get(k) || []), it]);
    });
    return Array.from(map.values());
  }, [items]);

  if (!isOpen) return null;

  const hasFilters = Boolean(qInput || driverId || category || format || from || to);
  const clearFilters = () => { setQInput(''); setQ(''); setDriverId(''); setCategory(''); setFormat(''); setFrom(''); setTo(''); };
  const inputCls = 'px-3 py-2 rounded-lg bg-shuma-bg border border-shuma-border text-xs text-shuma-text focus:outline-none focus:border-blue-400';

  return (
    <FloatingWindow
      id="expediente"
      title="Expediente"
      subtitle="Fotos y documentos de rutas y facturas · archivos privados"
      icon={<FolderOpen className="w-4 h-4" />}
      defaultWidth={980}
      defaultHeight={640}
      minWidth={420}
      onClose={onClose}
    >
      <div className="flex flex-col h-full">

        <div className="px-5 py-3 border-b border-shuma-border grid gap-2 grid-cols-2 lg:grid-cols-7">
          <input
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            placeholder="Factura o código de ruta"
            className={inputCls + ' col-span-2'}
          />
          <select value={driverId} onChange={e => setDriverId(e.target.value)} className={inputCls}>
            <option value="">Todos los choferes</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
            <option value="">Todos los tipos</option>
            {(Object.keys(CATEGORY_LABEL) as Array<keyof typeof CATEGORY_LABEL>).map(k => (
              <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>
            ))}
          </select>
          <select value={format} onChange={e => setFormat(e.target.value)} className={inputCls}>
            <option value="">Todos los formatos</option>
            <option value="image">Fotos</option>
            <option value="pdf">PDF</option>
          </select>
          <div className="flex gap-2 col-span-2">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls + ' min-w-0 flex-1'} aria-label="Desde" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls + ' min-w-0 flex-1'} aria-label="Hasta" />
          </div>
        </div>

        <div className="px-5 py-1.5 text-[11px] text-shuma-muted border-b border-shuma-border/50">
          {loading && items.length === 0
            ? 'Cargando…'
            : total + (total === 1 ? ' archivo' : ' archivos') + (groups.length > 0 && groups.length < items.length ? ' · ' + groups.length + ' grupos' : '')}
          {hasFilters && (
            <button onClick={clearFilters} className="ml-2 text-amber-300 hover:text-white underline underline-offset-2">
              × Quitar filtros
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-300">{error}</p>}
          {!error && !loading && items.length === 0 && (
            <p className="text-sm text-shuma-muted text-center py-16">
              {hasFilters ? 'Sin archivos con estos filtros.' : 'Todavía no hay archivos en el Expediente. Las fotos que tomen los choferes aparecerán aquí.'}
            </p>
          )}
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
            {groups.map(group => {
              const first = group[0];
              const many = group.length > 1;
              return (
                <div key={groupKey(first)} className="rounded-xl border border-shuma-border bg-shuma-surface p-2 flex flex-col gap-2">
                  {/* Tarjetero: capas detrás de la miniatura cuando la factura tiene varios archivos */}
                  <div className={'relative ' + (many ? 'mr-2 mt-2' : '')}>
                    {many && (
                      <>
                        <div className="absolute inset-0 translate-x-2 -translate-y-2 rotate-3 rounded-lg border border-shuma-border bg-slate-700/70" />
                        <div className="absolute inset-0 translate-x-1 -translate-y-1 rotate-1 rounded-lg border border-shuma-border bg-slate-800" />
                      </>
                    )}
                    <div className="relative">
                      <AttachmentThumb item={first} size={many ? 126 : 134} onOpen={() => setPreview({ items: group, index: 0 })} />
                      {many && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-semibold shadow">
                          {group.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-white truncate">{first.invoice ? 'Factura ' + first.invoice : first.file_name}</p>
                    <p className="text-[10px] text-shuma-muted truncate">{(first.route_code || 'Sin ruta') + (first.driver_name ? ' · ' + first.driver_name : '')}</p>
                    <p className="text-[10px] text-shuma-muted truncate">
                      {(many ? group.length + ' archivos · ' : CATEGORY_LABEL[first.category] + ' · ') + formatDateMx(first.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {items.length < total && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => void load(items.length)}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-xs bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                {loading ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </div>
      </div>
      {preview && (
        <AttachmentPreview
          items={preview.items}
          startIndex={preview.index}
          onClose={() => setPreview(null)}
          onArchive={canEdit ? onArchive : undefined}
        />
      )}
    </FloatingWindow>
  );
}
