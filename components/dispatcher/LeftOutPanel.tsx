'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import type { LeftOutReason, LeftOutStop } from '@/types';

const REASON_UI: Record<LeftOutReason, { label: string; cls: string }> = {
  excluida:      { label: 'Excluida en la revisión', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  fuera_zona:    { label: 'Fuera de zona',           cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  sin_ubicacion: { label: 'Sin ubicación',           cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  omitida:       { label: 'No asignada',             cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
};

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(items: LeftOutStop[]) {
  const header = ['razon', 'detalle', 'cliente', 'direccion', 'factura', 'monto', 'piezas'];
  const lines = items.flatMap(it =>
    it.invoices.map(inv =>
      [REASON_UI[it.reason].label, it.detail ?? '', it.clientName, it.address, inv.invoice, inv.amount ?? '', inv.pieces]
        .map(csvCell)
        .join(',')
    )
  );
  // BOM para que Excel respete los acentos
  const blob = new Blob(['\ufeff' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `facturas_fuera_de_ruta_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Apartado de facturas que quedaron fuera de las rutas y por qué.
 * Antes se perdían sin aviso por cuatro vías: exclusión en la revisión,
 * fuera de zona, falla al ubicar y omisión del optimizador.
 */
export default function LeftOutPanel({ items }: { items: LeftOutStop[] }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;

  const invoices = items.reduce((n, it) => n + it.invoices.length, 0);
  const amount = items.reduce((n, it) => n + it.invoices.reduce((m, i) => m + (i.amount ?? 0), 0), 0);
  const omitted = items.filter(it => it.reason === 'omitida').length;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Facturas fuera de ruta: {items.length} {items.length === 1 ? 'parada' : 'paradas'} · {invoices} {invoices === 1 ? 'factura' : 'facturas'} · {money(amount)}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-amber-300" /> : <ChevronDown className="w-4 h-4 text-amber-300" />}
      </button>

      {open && (
        <div className="border-t border-amber-500/20">
          {omitted > 0 && (
            <p className="px-3 pt-2 text-[11px] text-amber-200/90">
              {omitted} {omitted === 1 ? 'parada no cupo' : 'paradas no cupieron'} en las rutas (capacidad u horario). Agrega un chofer, ajusta horarios o capacidades y vuelve a optimizar.
            </p>
          )}
          <ul className="divide-y divide-amber-500/10 max-h-72 overflow-y-auto">
            {items.map(it => (
              <li key={`${it.reason}-${it.id}`} className="px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${REASON_UI[it.reason].cls}`}>{REASON_UI[it.reason].label}</span>
                  <span className="text-xs font-medium text-slate-100 truncate">{it.clientName}</span>
                </div>
                <p className="text-[11px] text-shuma-muted truncate mt-0.5" title={it.address}>{it.address || 'Sin dirección'}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {it.invoices.map(i => i.invoice).join(', ')}
                  {it.detail ? ` · ${it.detail}` : ''}
                </p>
              </li>
            ))}
          </ul>
          <div className="px-3 py-2 border-t border-amber-500/20 flex justify-end">
            <button
              onClick={() => downloadCsv(items)}
              className="flex items-center gap-1.5 text-[11px] text-amber-200 hover:text-white"
            >
              <Download className="w-3.5 h-3.5" /> Descargar lista (CSV)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
