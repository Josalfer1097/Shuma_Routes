'use client';

import { useEffect, useMemo, useState } from 'react';
import { Truck } from 'lucide-react';
import FloatingWindow from '@/components/windows/FloatingWindow';

interface RouteSummary {
  id: string;
  route_code: string | null;
  route_alias: string | null;
  date: string | null;
  status: string | null;
  closure_status: string | null;
  driver_name: string | null;
}

interface DeliveryRow {
  id: string;
  invoice: string;
  client_name: string | null;
  address: string;
  status: string;
  stop_order: number | null;
  merchandise_value: number | null;
  is_pending: boolean | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Pendiente',    cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  in_route:  { label: 'En camino',    cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  delivered: { label: 'Entregada',    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  partial:   { label: 'Parcial',      cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  failed:    { label: 'No entregada', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

const money = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Ventana flotante (no bloquea la pantalla) con las facturas de una ruta,
 * agrupadas por parada. Se abre desde el código de ruta en una notificación.
 */
export default function RouteInvoicesPopover({ routeCode, onClose }: { routeCode: string; onClose: () => void }) {
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/routes/summary?code=' + encodeURIComponent(routeCode), { credentials: 'include', signal: controller.signal })
      .then(async res => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudo cargar la ruta');
        setRoute(json.route);
        setDeliveries(json.deliveries);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar la ruta');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [routeCode]);


  // Facturas agrupadas por parada (varias facturas pueden compartir orden de visita)
  const stops = useMemo(() => {
    const map = new Map<string, DeliveryRow[]>();
    deliveries.forEach(d => {
      const key = d.stop_order === null ? 'sin-orden-' + d.id : String(d.stop_order);
      map.set(key, [...(map.get(key) || []), d]);
    });
    return Array.from(map.values());
  }, [deliveries]);

  const done = deliveries.filter(d => d.status === 'delivered').length;
  const total = deliveries.reduce((n, d) => n + (d.merchandise_value ?? 0), 0);

  return (
    <FloatingWindow
      id="facturas-ruta"
      title={'Facturas · ' + (route?.route_alias || route?.route_code || routeCode)}
      subtitle={route ? (route.driver_name || 'Sin chofer') + (route.date ? ' · ' + route.date : '') : undefined}
      icon={<Truck className="w-4 h-4" />}
      defaultWidth={400}
      defaultHeight={520}
      minWidth={320}
      onClose={onClose}
    >
      <div className="flex flex-col h-full">

      {loading && <p className="px-3 py-4 text-xs text-shuma-muted">Cargando facturas…</p>}
      {error && <p className="px-3 py-4 text-xs text-red-300">{error}</p>}

      {!loading && !error && (
        <>
          <p className="px-3 py-1.5 text-[10px] text-slate-300 border-b border-shuma-border/50">
            {stops.length + ' paradas · ' + deliveries.length + ' facturas · ' + done + ' entregadas · ' + money(total)}
          </p>
          <ul className="overflow-y-auto divide-y divide-slate-700/50">
            {stops.map((group, i) => (
              <li key={group[0].id} className="px-3 py-2">
                <p className="text-[11px] text-white truncate">
                  {(group[0].stop_order ?? i + 1) + '. ' + (group[0].client_name || 'Cliente sin nombre')}
                </p>
                <p className="text-[10px] text-shuma-muted truncate" title={group[0].address}>{group[0].address}</p>
                <ul className="mt-1 space-y-0.5">
                  {group.map(d => {
                    const st = STATUS[d.status] || STATUS.pending;
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-slate-300 truncate">{d.invoice}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {d.merchandise_value ? <span className="text-slate-400">{money(d.merchandise_value)}</span> : null}
                          <span className={'px-1.5 py-0.5 rounded border ' + st.cls}>{d.is_pending ? 'En bandeja' : st.label}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {deliveries.length === 0 && <li className="px-3 py-4 text-xs text-shuma-muted">La ruta no tiene facturas.</li>}
          </ul>
        </>
      )}
      </div>
    </FloatingWindow>
  );
}
