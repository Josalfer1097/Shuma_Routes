'use client';

import { useState } from 'react';
import type { Vehicle } from '@/types';
import DEPOTS from '@/lib/depots';
import DRIVERS from '@/lib/drivers';

interface Props {
  vehicles: Vehicle[];
  onAdd: (vehicle: Vehicle) => void;
  onRemove: (id: string) => void;
}

const DRIVER_COLORS = [
  '#3B82F6', '#F59E0B', '#10B981', '#EF4444',
  '#8B5CF6', '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#6366F1',
];

const inputCls = `w-full px-3 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg
  text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500
  focus:ring-1 focus:ring-blue-500 transition-colors`;

export default function VehicleForm({ vehicles, onAdd, onRemove }: Props) {
  const [driverId, setDriverId]   = useState(DRIVERS[0].id);
  const [depotId, setDepotId]     = useState(DEPOTS[0].id);
  const [endDepotId, setEndDepotId] = useState(DEPOTS[0].id);
  const [capacity, setCapacity]   = useState('');
  const [invoices, setInvoices]   = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const selectedDriver = DRIVERS.find(d => d.id === driverId);
    if (!selectedDriver) { setFormError('Chofer no válido.'); return; }

    const selectedDepot = DEPOTS.find(d => d.id === depotId);
    if (!selectedDepot) { setFormError('Bodega no válida.'); return; }

    const selectedEndDepot = DEPOTS.find(d => d.id === endDepotId) ?? selectedDepot;

    const newVehicle: Vehicle = {
      id: crypto.randomUUID(),
      driverName: selectedDriver.name,
      matricula: selectedDriver.matricula,
      vehicleId: `VH-${vehicles.length + 1}`,
      capacity: parseInt(capacity) || 9999,
      color: DRIVER_COLORS[vehicles.length % DRIVER_COLORS.length],
      depot: selectedDepot,
      endDepot: selectedEndDepot,
      invoices: invoices.trim(),
    };

    onAdd(newVehicle);
    setDriverId(DRIVERS[0].id);
    setDepotId(DEPOTS[0].id);
    setEndDepotId(DEPOTS[0].id);
    setCapacity('');
    setInvoices('');
  };

  return (
    <div className="space-y-4">
      {/* Formulario */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">

          {/* Chofer */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Chofer *
            </label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className={inputCls}
            >
              {DRIVERS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — Mat. {d.matricula}
                </option>
              ))}
            </select>
          </div>

          {/* Bodega salida */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Bodega de salida *
            </label>
            <select
              value={depotId}
              onChange={(e) => setDepotId(e.target.value)}
              className={inputCls}
            >
              {DEPOTS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Bodega regreso */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Bodega de regreso
            </label>
            <select
              value={endDepotId}
              onChange={(e) => setEndDepotId(e.target.value)}
              className={inputCls}
            >
              {DEPOTS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Capacidad y Facturas */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Bultos máximos
              </label>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="Sin límite"
                min="1"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Factura(s)
              </label>
              <input
                type="text"
                value={invoices}
                onChange={(e) => setInvoices(e.target.value)}
                placeholder="Ej: F-001, F-002"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {formError && <p className="text-xs text-red-400">{formError}</p>}

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                     bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500
                     text-sm font-medium text-slate-300 transition-all duration-200"
        >
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar chofer
        </button>
      </form>

      {/* Lista */}
      {vehicles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {vehicles.length} {vehicles.length === 1 ? 'chofer' : 'choferes'} registrados
          </p>
          <ul className="space-y-1.5">
            {vehicles.map((v) => (
              <li
                key={v.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-700/50
                           border border-slate-700 group"
              >
                <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: v.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">
                    {v.driverName}
                    <span className="ml-1.5 text-xs text-slate-500 font-normal">Mat. {v.matricula}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {v.capacity < 9999 && `${v.capacity} bultos · `}
                    Bodega: {v.depot.name}
                  </p>
                  {v.invoices && (
                    <p className="text-xs text-amber-400/80 truncate mt-0.5">📄 {v.invoices}</p>
                  )}
                </div>
                <button
                  onClick={() => onRemove(v.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/20
                             text-slate-500 hover:text-red-400 transition-all duration-150 shrink-0"
                  title="Eliminar chofer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {vehicles.length === 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-slate-600">Agrega al menos un chofer para optimizar rutas</p>
        </div>
      )}
    </div>
  );
}
