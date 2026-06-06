'use client';

import { useState } from 'react';
import type { Vehicle } from '@/types';
import DRIVERS from '@/lib/drivers';

interface Props {
  vehicles: Vehicle[];
  onAdd: (vehicle: Vehicle) => void;
  onRemove: (id: string) => void;
}

const DRIVER_COLORS = [
  '#2196F3', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
];

const inputCls = `w-full px-3 py-2 text-sm bg-shuma-bg border border-shuma-border rounded-lg
  text-shuma-text placeholder-shuma-muted focus:outline-none focus:border-shuma-accent
  focus:ring-1 focus:ring-shuma-accent transition-colors`;

export default function VehicleForm({ vehicles, onAdd, onRemove }: Props) {
  const assignedDriverIds = vehicles.map(v => v.driverName);
  
  // Encontrar el primer chofer no asignado para seleccionarlo por defecto
  const firstAvailableDriver = DRIVERS.find(d => !assignedDriverIds.includes(d.name));
  
  const [driverId, setDriverId]   = useState(firstAvailableDriver?.id || DRIVERS[0].id);
  const [vehicleType, setVehicleType] = useState<'Camión grande' | 'Camión chico' | 'Camioneta'>('Camión grande');
  const [capacity, setCapacity]   = useState('');
  const [invoices, setInvoices]   = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const selectedDriver = DRIVERS.find(d => d.id === driverId);
    if (!selectedDriver) { setFormError('Chofer no válido.'); return; }

    const newVehicle: Vehicle = {
      id: crypto.randomUUID(),
      driverName: selectedDriver.name,
      matricula: selectedDriver.matricula,
      vehicleId: `VH-${vehicles.length + 1}`,
      type: vehicleType,
      capacity: parseInt(capacity) || 9999,
      color: DRIVER_COLORS[vehicles.length % DRIVER_COLORS.length],
      // Depots will be overwritten by global config in page.tsx
      depot: { id: '', name: '', address: '', lat: 0, lng: 0 },
      endDepot: { id: '', name: '', address: '', lat: 0, lng: 0 },
      invoices: invoices.trim(),
    };

    onAdd(newVehicle);
    
    // Al agregar, recalcular el próximo disponible excluyendo el que se acaba de agregar
    const nextAssigned = [...assignedDriverIds, selectedDriver.name];
    const nextAvailable = DRIVERS.find(d => !nextAssigned.includes(d.name));
    setDriverId(nextAvailable?.id || DRIVERS[0].id);
    setVehicleType('Camión grande');
    setCapacity('');
    setInvoices('');
  };

  return (
    <div className="space-y-4">
      {/* Formulario */}
      {firstAvailableDriver ? (
        <form onSubmit={handleSubmit} className="space-y-3 bg-shuma-surface p-4 rounded-xl border border-shuma-border">
        <div className="space-y-3">
          {/* Chofer */}
          <div>
            <label className="block text-xs font-medium text-shuma-muted mb-1">
              Chofer *
            </label>
            <select
              value={driverId}
              onChange={(e) => {
                const newId = e.target.value;
                setDriverId(newId);
                const driver = DRIVERS.find(d => d.id === newId);
                if (driver?.defaultType) {
                  setVehicleType(driver.defaultType);
                }
              }}
              className={inputCls}
            >
              {DRIVERS.map((d) => {
                const isAssigned = assignedDriverIds.includes(d.name);
                return (
                  <option 
                    key={d.id} 
                    value={d.id} 
                    disabled={isAssigned}
                    className={isAssigned ? 'opacity-50 cursor-not-allowed bg-shuma-surface text-shuma-muted' : ''}
                  >
                    {d.name} — Mat. {d.matricula} {isAssigned ? '(Asignado)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-shuma-muted mb-1">
              Tipo de vehículo *
            </label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as any)}
              className={inputCls}
            >
              <option value="Camión grande">Camión grande</option>
              <option value="Camión chico">Camión chico</option>
              <option value="Camioneta">Camioneta</option>
            </select>
          </div>

          {/* Capacidad y Facturas */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-shuma-muted mb-1">
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
              <label className="block text-xs font-medium text-shuma-muted mb-1">
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

        {formError && <p className="text-xs text-red-400 mt-2">{formError}</p>}

        <button
          type="submit"
          disabled={vehicles.length >= 6}
          className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                     bg-shuma-surface hover:bg-shuma-border border border-shuma-border hover:border-shuma-accent
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-sm font-medium text-shuma-text transition-all duration-200"
        >
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {vehicles.length >= 6 ? 'Máximo 6 camiones' : 'Agregar camión'}
        </button>
        </form>
      ) : (
        <div className="bg-shuma-surface p-4 rounded-xl border border-shuma-border text-center text-sm text-shuma-muted">
          Todos los choferes han sido asignados
        </div>
      )}

      {/* Lista de vehículos */}
      {vehicles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-shuma-muted uppercase tracking-wider">
            {vehicles.length} {vehicles.length === 1 ? 'camión' : 'camiones'} listos
          </p>
          <ul className="space-y-1.5">
            {vehicles.map((v) => (
              <li
                key={v.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-shuma-surface/50
                           border border-shuma-border group"
              >
                <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: v.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-shuma-text truncate">
                    {v.driverName}
                    <span className="ml-1.5 text-xs text-shuma-muted font-normal">Mat. {v.matricula}</span>
                  </p>
                  <p className="text-xs text-shuma-muted">
                    {v.type}
                    {v.capacity < 9999 && ` · Máx ${v.capacity} bultos`}
                  </p>
                  {v.invoices && (
                    <p className="text-xs text-amber-400/80 truncate mt-0.5">📄 {v.invoices}</p>
                  )}
                </div>
                <button
                  onClick={() => onRemove(v.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/20
                             text-shuma-muted hover:text-red-400 transition-all duration-150 shrink-0"
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
          <p className="text-xs text-shuma-muted">Agrega al menos un camión para optimizar rutas</p>
        </div>
      )}
    </div>
  );
}
