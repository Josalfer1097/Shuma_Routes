'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { Inbox, Navigation, RefreshCw, Truck, ClipboardList, Undo2, AlertTriangle, Package } from 'lucide-react';

interface PendingItem {
  id: string;
  route_id: string;
  invoice: string;
  client_name: string | null;
  address: string;
  status: 'failed' | 'partial' | 'pending' | 'in_route' | 'delivered';
  notes: string | null;
  merchandise_value: number | null;
  attempt_count: number;
  pending_since: string | null;
  awaiting_planning: boolean;
  pending_quantity: number | null;
  origin: { route_code: string | null; route_alias: string | null; date: string | null; driver_name: string | null } | null;
}

interface TargetRoute {
  id: string;
  route_code: string | null;
  route_alias: string | null;
  date: string | null;
  driver_name: string | null;
}

type Mode = 'route' | 'planning' | 'tray';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  failed:   { text: 'No entregada', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  partial:  { text: 'Parcial',      cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  pending:  { text: 'Sin visitar',  cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  in_route: { text: 'Sin visitar',  cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

function sinceText(iso: string | null): string {
  if (!iso) return '';
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'hace menos de 1 h';
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

function routeLabel(r: { route_code: string | null; route_alias: string | null } | null): string {
  if (!r) return 'Ruta desconocida';
  return r.route_alias || r.route_code || 'Ruta sin código';
}

export default function PendingPage() {
  const router = useRouter();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [targets, setTargets] = useState<TargetRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  // Panel de acción abierto sobre una entrega
  const [openId, setOpenId] = useState<string | null>(null);
  const [targetRouteId, setTargetRouteId] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Solo UX: el servidor valida el rol en cada acción
    const role = sessionStorage.getItem('shuma_role') || '';
    setCanEdit(role === 'admin' || role === 'logistics');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pending', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Error ${res.status}`);
      setItems(data.items);
      setTargets(data.targets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando la bandeja');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inTray = useMemo(() => items.filter(i => !i.awaiting_planning), [items]);
  const inPlanning = useMemo(() => items.filter(i => i.awaiting_planning), [items]);

  const openPanel = (item: PendingItem) => {
    setOpenId(item.id);
    setTargetRouteId('');
    setQty(item.pending_quantity ? String(item.pending_quantity) : '');
    setNote('');
    setMessage(null);
  };

  const submit = async (item: PendingItem, mode: Mode) => {
    if (mode === 'route' && !targetRouteId) {
      setMessage({ kind: 'error', text: 'Selecciona la ruta destino.' });
      return;
    }
    if (mode === 'route' && item.status === 'partial' && !qty) {
      setMessage({ kind: 'error', text: 'Indica cuántas piezas faltan por entregar.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/pending/reassign', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: item.id,
          mode,
          targetRouteId: mode === 'route' ? targetRouteId : undefined,
          pendingQuantity: qty ? Number(qty) : undefined,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Error ${res.status}`);

      const done =
        mode === 'route' ? `Factura ${item.invoice} reasignada.`
        : mode === 'planning' ? `Factura ${item.invoice} enviada a planeación.`
        : `Factura ${item.invoice} regresada a la bandeja.`;
      setMessage({ kind: 'ok', text: data.eventWarning ? `${done} ${data.eventWarning}` : done });
      setOpenId(null);
      await load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const renderCard = (item: PendingItem) => {
    const badge = STATUS_LABEL[item.status] || STATUS_LABEL.pending;
    const isOpen = openId === item.id;

    return (
      <div key={item.id} className="bg-shuma-surface border border-shuma-border rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">Factura {item.invoice}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.text}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-300 border-blue-500/30">
                Intento {item.attempt_count}
              </span>
              {item.pending_quantity ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-300 border-purple-500/30">
                  Faltan {item.pending_quantity} piezas
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-200 mt-1 truncate">{item.client_name || 'Cliente sin nombre'}</p>
            <p className="text-xs text-shuma-muted truncate">{item.address}</p>
            <p className="text-xs text-shuma-muted mt-1">
              De {routeLabel(item.origin)}
              {item.origin?.driver_name ? ` · ${item.origin.driver_name}` : ''}
              {item.pending_since ? ` · ${sinceText(item.pending_since)}` : ''}
              {item.merchandise_value ? ` · $${Number(item.merchandise_value).toLocaleString('es-MX')}` : ''}
            </p>
            {item.notes ? <p className="text-xs text-slate-400 mt-1 italic">“{item.notes}”</p> : null}
          </div>

          {canEdit && !isOpen && (
            <div className="flex gap-2 flex-wrap">
              {item.awaiting_planning ? (
                <button
                  onClick={() => submit(item, 'tray')}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Regresar a bandeja
                </button>
              ) : null}
              <button
                onClick={() => openPanel(item)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-blue-600 text-white hover:bg-blue-500"
              >
                <Truck className="w-3.5 h-3.5" /> Reasignar
              </button>
            </div>
          )}
        </div>

        {isOpen && (
          <div className="mt-4 pt-4 border-t border-shuma-border grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-shuma-muted">Ruta destino (se agrega al final)</span>
              <select
                value={targetRouteId}
                onChange={e => setTargetRouteId(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-shuma-border rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">Selecciona una ruta abierta…</option>
                {targets
                  .filter(t => t.id !== item.route_id)
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {routeLabel(t)}{t.driver_name ? ` · ${t.driver_name}` : ''}{t.date ? ` · ${t.date}` : ''}
                    </option>
                  ))}
              </select>
              {targets.length === 0 && (
                <span className="text-xs text-amber-300">No hay rutas abiertas con chofer. Puedes enviarla a planeación.</span>
              )}
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-shuma-muted">
                Piezas pendientes por entregar{item.status === 'partial' ? ' (obligatorio en parciales)' : ' (opcional)'}
              </span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-shuma-border rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500 w-40"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-shuma-muted">Nota para el chofer (opcional)</span>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                className="px-3 py-2 bg-slate-900 border border-shuma-border rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </label>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => submit(item, 'route')}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
              >
                <Truck className="w-3.5 h-3.5" /> {saving ? 'Guardando…' : 'Mover a la ruta'}
              </button>
              {!item.awaiting_planning && (
                <button
                  onClick={() => submit(item, 'planning')}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  <ClipboardList className="w-3.5 h-3.5" /> Enviar a planeación
                </button>
              )}
              <button
                onClick={() => { setOpenId(null); setMessage(null); }}
                disabled={saving}
                className="px-3 py-2 rounded-xl text-xs text-shuma-muted hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg flex flex-col">
        <header className="bg-shuma-surface border-b border-shuma-border sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/dispatcher')}
                className="p-2 -ml-2 rounded-xl text-shuma-muted hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Volver al despachador"
              >
                <Navigation className="w-5 h-5 rotate-180" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-amber-400" />
                  Bandeja de Pendientes
                </h1>
                <p className="text-xs text-shuma-muted mt-0.5">
                  Entregas no completadas de rutas cerradas
                </p>
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </button>
          </div>
        </header>

        <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 grid gap-6">
          {message && (
            <div className={`text-sm rounded-xl px-4 py-3 border ${message.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-red-500/10 text-red-300 border-red-500/30'}`}>
              {message.text}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3 border bg-red-500/10 text-red-300 border-red-500/30">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="text-center py-16 text-shuma-muted">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No hay entregas pendientes. Todo salió a tiempo.</p>
            </div>
          )}

          {inTray.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-sm font-semibold text-slate-300">En bandeja ({inTray.length})</h2>
              {inTray.map(renderCard)}
            </section>
          )}

          {inPlanning.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-sm font-semibold text-slate-300">En espera de planeación ({inPlanning.length})</h2>
              <p className="text-xs text-shuma-muted -mt-2">
                Se podrán agregar desde la pestaña de carga en la próxima planeación.
              </p>
              {inPlanning.map(renderCard)}
            </section>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
