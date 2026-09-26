'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Address, LeftOutStop } from '@/types';
import { classifyStop, parseLatLng, type ErpImportResult, type ErpStop, type StopStatus } from '@/lib/erpImport';
import AddressAutocomplete, { type PickedPlace } from './AddressAutocomplete';
import { loadErpDraft, saveErpDraft } from '@/lib/erpDraft';

interface Props {
  result: ErpImportResult;
  fileName: string;
  onConfirm: (addresses: Address[], leftOut: LeftOutStop[]) => void;
  onCancel: () => void;
}

const STATUS_UI: Record<StopStatus, { label: string; cls: string }> = {
  listo:        { label: 'Con coordenada',  cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  geocodificar: { label: 'Por ubicar',      cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  revisar:      { label: 'Por revisar',     cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  fuera_zona:   { label: 'Fuera de zona',   cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
};

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Convierte una parada del ERP en la dirección que usa el resto del pipeline. */
function stopToAddress(stop: ErpStop): Address {
  const hasCoords = stop.lat !== null && stop.lng !== null;
  return {
    id: stop.id,
    raw: stop.addressText,
    name: stop.clientName,
    clientName: stop.clientName,
    invoice: stop.invoices.map(i => i.invoice).join(', '),
    merchandiseValue: stop.amount || undefined,
    lat: hasCoords ? stop.lat : null,
    lng: hasCoords ? stop.lng : null,
    label: hasCoords ? (stop.source === 'erp' ? 'Coordenada del ERP' : 'Coordenada capturada') : '',
    geocoded: hasCoords,
    locationSource: stop.source,
    invoices: stop.invoices.map(i => ({
      invoice: i.invoice,
      date: i.date,
      amount: i.amount,
      pieces: i.pieces,
      items: i.items,
    })),
  };
}

export default function ErpImportPreview({ result, fileName, onConfirm, onCancel }: Props) {
  // Si hay un borrador de esta misma carga (se cambió de pestaña o se recargó), se retoma
  const [initialDraft] = useState(() => {
    const d = loadErpDraft();
    return d && d.fileName === fileName && d.result.stats.invoices === result.stats.invoices ? d : null;
  });
  const [stops, setStops] = useState<ErpStop[]>(initialDraft?.stops ?? result.stops);
  // Fuera de zona: excluidas por defecto; el admin puede incluirlas
  const [includedOutside, setIncludedOutside] = useState<Set<string>>(new Set(initialDraft?.includedOutside ?? []));
  // Cualquier parada se puede excluir; las "Por revisar" bloquean hasta corregirse o excluirse
  const [excluded, setExcluded] = useState<Set<string>>(new Set(initialDraft?.excluded ?? []));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Guardar cada cambio para no perder la revisión al cambiar de pestaña
  useEffect(() => {
    saveErpDraft({
      fileName,
      result,
      stops,
      excluded: Array.from(excluded),
      includedOutside: Array.from(includedOutside),
    });
  }, [fileName, result, stops, excluded, includedOutside]);

  const counts = useMemo(() => {
    const c: Record<StopStatus, number> = { listo: 0, geocodificar: 0, revisar: 0, fuera_zona: 0 };
    stops.forEach(s => { c[s.status] += 1; });
    return c;
  }, [stops]);

  const toSend = useMemo(
    () => stops.filter(s =>
      !excluded.has(s.id) &&
      (s.status === 'listo' || s.status === 'geocodificar' || (s.status === 'fuera_zona' && includedOutside.has(s.id)))
    ),
    [stops, excluded, includedOutside]
  );

  const blocking = stops.filter(s => s.status === 'revisar' && !excluded.has(s.id));
  const invoicesToSend = toSend.reduce((n, s) => n + s.invoices.length, 0);
  const piecesToSend = toSend.reduce((n, s) => n + s.pieces, 0);
  const amountToSend = toSend.reduce((n, s) => n + s.amount, 0);
  const ignored = Object.entries(result.stats.ignoredLocations);

  const startEdit = (stop: ErpStop) => {
    setEditingId(stop.id);
    setDraft(stop.status === 'revisar' && /SIN DIRECCION/i.test(stop.addressText) ? '' : stop.addressText);
  };

  const applyEdit = (stop: ErpStop) => {
    const text = draft.trim();
    if (!text) return;
    const coords = parseLatLng(text);
    const updated: ErpStop = coords
      ? { ...stop, lat: coords.lat, lng: coords.lng, source: 'manual' }
      : { ...stop, addressText: text, lat: null, lng: null, source: 'manual' };
    const c = classifyStop(updated.addressText, updated.lat, updated.lng, 'manual');
    updated.status = c.status;
    updated.reasons = coords ? [...c.reasons, 'Coordenada capturada a mano'] : c.reasons;
    setStops(prev => prev.map(s => (s.id === stop.id ? updated : s)));
    setExcluded(prev => { const n = new Set(prev); n.delete(stop.id); return n; });
    setEditingId(null);
    setDraft('');
  };

  /** Sugerencia elegida en el buscador: dirección oficial y coordenada exacta. */
  const applyPlace = (stop: ErpStop, place: PickedPlace) => {
    const updated: ErpStop = {
      ...stop,
      addressText: place.formattedAddress,
      lat: place.lat,
      lng: place.lng,
      source: 'manual',
    };
    const c = classifyStop(updated.addressText, updated.lat, updated.lng, 'manual');
    updated.status = c.status;
    updated.reasons = [...c.reasons.filter(r => !r.startsWith('Sin dirección en texto')), 'Ubicación elegida en el buscador'];
    setStops(prev => prev.map(s => (s.id === stop.id ? updated : s)));
    setExcluded(prev => { const n = new Set(prev); n.delete(stop.id); return n; });
    setEditingId(null);
    setDraft('');
  };

  const toggle = (setFn: typeof setExcluded, id: string) =>
    setFn(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="rounded-lg border border-shuma-border overflow-hidden">
      {/* Resumen */}
      <div className="px-3 py-3 bg-shuma-surface/50 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-shuma-text truncate">{fileName}</span>
          <button onClick={onCancel} className="text-[11px] text-shuma-muted hover:text-white shrink-0">Cancelar</button>
        </div>
        <p className="text-[11px] text-shuma-muted">
          {result.stats.invoices} facturas de San Pablo agrupadas en {result.stats.stops} paradas
          {ignored.length > 0 && ` · se ignoraron ${ignored.map(([loc, n]) => `${n} partidas de ${loc}`).join(', ')}`}
          {result.stats.repairedTexts > 0 && ` · ${result.stats.repairedTexts} textos con acentos reparados`}
          {result.stats.emptyRows > 0 && ` · ${result.stats.emptyRows} ${result.stats.emptyRows === 1 ? 'fila vacía ignorada' : 'filas vacías ignoradas'}`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(STATUS_UI) as StopStatus[]).map(st => (
            <span key={st} className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_UI[st].cls}`}>
              {STATUS_UI[st].label}: {counts[st]}
            </span>
          ))}
          {excluded.size > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-500/15 text-slate-300 border-slate-500/30">
              Excluidas a mano: {excluded.size}
            </span>
          )}
        </div>
      </div>

      {/* Paradas */}
      <ul className="divide-y divide-slate-700/50 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 460px)', minHeight: 160 }}>
        {stops.map(stop => {
          const ui = STATUS_UI[stop.status];
          const isExcluded = excluded.has(stop.id);
          const isOutsideIncluded = includedOutside.has(stop.id);
          const isEditing = editingId === stop.id;
          const dimmed = !isEditing && (isExcluded || (stop.status === 'fuera_zona' && !isOutsideIncluded));

          return (
            <li key={stop.id} className={`px-3 py-2 ${dimmed ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ui.cls}`}>{ui.label}</span>
                    <span className="text-xs font-medium text-shuma-text truncate">{stop.clientName}</span>
                  </div>
                  <p className="text-[11px] text-shuma-muted truncate mt-0.5" title={stop.addressText}>
                    {stop.addressText || 'Sin dirección'}
                  </p>
                  <button
                    onClick={() => setExpandedId(expandedId === stop.id ? null : stop.id)}
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                  >
                    {stop.invoices.length} {stop.invoices.length === 1 ? 'factura' : 'facturas'} · {stop.pieces.toLocaleString('es-MX')} piezas · {money(stop.amount)}
                  </button>
                  {stop.reasons.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-0.5">{stop.reasons.join(' · ')}</p>
                  )}
                  {expandedId === stop.id && (
                    <ul className="mt-1 space-y-0.5">
                      {stop.invoices.map(inv => (
                        <li key={inv.invoice} className="text-[10px] text-slate-300">
                          {inv.invoice} · {inv.items.length} partidas · {inv.pieces} piezas · {inv.amount !== null ? money(inv.amount) : 'sin monto'}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  {stop.status === 'fuera_zona' ? (
                    <button onClick={() => toggle(setIncludedOutside, stop.id)} className="text-[10px] text-amber-300 hover:text-amber-200">
                      {isOutsideIncluded ? 'Excluir' : 'Incluir'}
                    </button>
                  ) : (
                    <button onClick={() => toggle(setExcluded, stop.id)} className="text-[10px] text-slate-400 hover:text-white">
                      {isExcluded ? 'Incluir' : 'Excluir'}
                    </button>
                  )}
                  {editingId !== stop.id && (
                    <button onClick={() => startEdit(stop)} className="text-[10px] text-blue-400 hover:text-blue-300">
                      Corregir
                    </button>
                  )}
                </div>
              </div>

              {editingId === stop.id && (
                <div className="mt-2 flex gap-1.5 items-start">
                  <AddressAutocomplete
                    value={draft}
                    onChange={setDraft}
                    onPick={place => applyPlace(stop, place)}
                    onSubmitText={() => applyEdit(stop)}
                    onCancel={() => setEditingId(null)}
                    placeholder="Busca la dirección o pega coordenadas: 19.35, -99.09"
                  />
                  <button onClick={() => applyEdit(stop)} className="px-2 py-1.5 rounded-lg text-[11px] bg-blue-600 text-white hover:bg-blue-500">Aplicar</button>
                  <button onClick={() => setEditingId(null)} className="px-2 py-1.5 rounded-lg text-[11px] text-shuma-muted hover:text-white">×</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Confirmación */}
      <div className="px-3 py-3 bg-shuma-surface/50 space-y-2 border-t border-shuma-border">
        {blocking.length > 0 && (
          <p className="text-[11px] text-red-300">
            {blocking.length} {blocking.length === 1 ? 'parada necesita' : 'paradas necesitan'} dirección. Corrígelas o exclúyelas para continuar.
          </p>
        )}
        <button
          onClick={() => {
            const sentIds = new Set(toSend.map(s => s.id));
            // Todo lo que no se envía queda registrado con su razón (apartado "Facturas fuera de ruta")
            const leftOut: LeftOutStop[] = stops
              .filter(s => !sentIds.has(s.id))
              .map(s => ({
                id: s.id,
                clientName: s.clientName,
                address: s.addressText,
                invoices: s.invoices.map(i => ({ invoice: i.invoice, amount: i.amount, pieces: i.pieces })),
                reason: excluded.has(s.id) ? 'excluida' : 'fuera_zona',
                detail: s.reasons.join(' · ') || undefined,
              }));
            onConfirm(toSend.map(stopToAddress), leftOut);
          }}
          disabled={blocking.length > 0 || toSend.length === 0}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continuar con {toSend.length} paradas · {invoicesToSend} facturas · {piecesToSend.toLocaleString('es-MX')} piezas · {money(amountToSend)}
        </button>
      </div>
    </div>
  );
}
