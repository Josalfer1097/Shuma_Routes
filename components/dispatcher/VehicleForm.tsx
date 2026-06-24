'use client';

import { useState, useEffect } from 'react';
import type { Vehicle } from '@/types';
import type { SupabaseVehicle } from '@/types';

interface DriverFromDB {
  id: string;
  name: string;
  employee_id: string | null;
  active: boolean;
}

interface Props {
  vehicles: Vehicle[];
  onAdd: (vehicle: Vehicle) => void;
  onRemove: (id: string) => void;
}

const DRIVER_COLORS = [
  '#2196F3', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  truck_large:  'Camión grande',
  truck_medium: 'Camión mediano',
  truck_small:  'Camión chico',
  van:          'Camioneta',
};

const inputCls = `w-full px-3 py-2 text-sm bg-shuma-bg border border-shuma-border rounded-lg
  text-shuma-text placeholder-shuma-muted focus:outline-none focus:border-shuma-accent
  focus:ring-1 focus:ring-shuma-accent transition-colors`;

export default function VehicleForm({ vehicles, onAdd, onRemove }: Props) {
  const [driversDB, setDriversDB]   = useState<DriverFromDB[]>([]);
  const [vehiclesDB, setVehiclesDB] = useState<SupabaseVehicle[]>([]);
  const [loadingDB, setLoadingDB]   = useState(true);

  const [selectedDriverId,  setSelectedDriverId]  = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [capacity,   setCapacity]   = useState('');
  const [invoices,   setInvoices]   = useState('');
  const [formError,  setFormError]  = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/drivers')
      .then(r => r.json())
      .then(json => {
        if (json.ok) {
          setDriversDB(json.drivers || []);
          setVehiclesDB(json.vehicles || []);
          // Preseleccionar primer chofer no asignado
          const assignedNames = vehicles.map(v => v.driverName);
          const first = (json.drivers || []).find((d: DriverFromDB) => !assignedNames.includes(d.name));
          if (first) setSelectedDriverId(first.id);
          // Preseleccionar primer vehículo
          if (json.vehicles?.length > 0) setSelectedVehicleId(json.vehicles[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingDB(false));
  }, []);

  const assignedDriverNames = vehicles.map(v => v.driverName);
  const availableDrivers = driversDB.filter(d => !assignedDriverNames.includes(d.name));
  const selectedVehicle = vehiclesDB.find(v => v.id === selectedVehicleId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const driver = driversDB.find(d => d.id === selectedDriverId);
    if (!driver) { setFormError('Selecciona un chofer.'); return; }
    if (!selectedVehicle) { setFormError('Selecciona un vehículo.'); return; }

    const newVehicle: Vehicle = {
      id:          crypto.randomUUID(),
      driverName:  driver.name,
      matricula:   selectedVehicle.plate,
      vehicleId:   `VH-${vehicles.length + 1}`,
      type:        VEHICLE_TYPE_LABELS[selectedVehicle.type] as any || selectedVehicle.type,
      capacity:    parseInt(capacity) || 9999,
      color:       DRIVER_COLORS[vehicles.length % DRIVER_COLORS.length],
      depot:       { id: '', name: '', address: '', lat: 0, lng: 0 },
      endDepot:    { id: '', name: '', address: '', lat: 0, lng: 0 },
      invoices:    invoices.trim(),
    };

    onAdd(newVehicle);

    // Resetear: siguiente chofer disponible
    const nextAssigned = [...assignedDriverNames, driver.name];
    const next = driversDB.find(d => !nextAssigned.includes(d.name));
    setSelectedDriverId(next?.id || '');
    setSelectedVehicleId(vehiclesDB[0]?.id || '');
    setCapacity('');
    setInvoices('');
  };

  if (loadingDB) return (
    <div className="flex items-center justify-center py-8 text-shuma-muted text-sm gap-2">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Cargando choferes...
    </div>
  );

  return (
    <div className="space-y-4">
      {availableDrivers.length > 0 && vehicles.length < 10 ? (
        <form onSubmit={handleSubmit} className="space-y-3 bg-shuma-surface p-4 rounded-xl border border-shuma-border">
          <div className="space-y-3">

            {/* Chofer */}
            <div>
              <label className="block text-xs font-medium text-shuma-muted mb-1">Chofer *</label>
              <select
                value={selectedDriverId}
                onChange={e => setSelectedDriverId(e.target.value)}
                className={inputCls}
              >
                <option value="">— Selecciona un chofer —</option>
                {driversDB.map(d => {
                  const isAssigned = assignedDriverNames.includes(d.name);
                  return (
                    <option key={d.id} value={d.id} disabled={isAssigned}>
                      {d.name} {d.employee_id ? `(${d.employee_id})` : ''} {isAssigned ? '— Asignado' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Vehículo */}
            <div>
              <label className="block text-xs font-medium text-shuma-muted mb-1">Vehículo *</label>
              <select
                value={selectedVehicleId}
                onChange={e => setSelectedVehicleId(e.target.value)}
                className={inputCls}
              >
                <option value="">— Selecciona un vehículo —</option>
                {(['truck_large', 'truck_medium', 'truck_small', 'van'] as const).map(type => {
                  const group = vehiclesDB.filter(v => v.type === type);
                  if (group.length === 0) return null;
                  return (
                    <optgroup key={type} label={VEHICLE_TYPE_LABELS[type]}>
                      {group.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.plate} — {VEHICLE_TYPE_LABELS[v.type]}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* Capacidad y Facturas */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-shuma-muted mb-1">Bultos máximos</label>
                <input
                  type="number"
                  value={capacity}
                  onChange={e => setCapacity(e.target.value)}
                  placeholder="Sin límite"
                  min="1"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-shuma-muted mb-1">Factura(s)</label>
                <input
                  type="text"
                  value={invoices}
                  onChange={e => setInvoices(e.target.value)}
                  placeholder="Ej: F-001, F-002"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {formError && <p className="text-xs text-red-400 mt-2">{formError}</p>}

          <button
            type="submit"
            disabled={!selectedDriverId || !selectedVehicleId}
            className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                     bg-shuma-surface hover:bg-shuma-border border border-shuma-border hover:border-shuma-accent
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-sm font-medium text-shuma-text transition-all duration-200"
          >
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar chofer
          </button>
        </form>
      ) : (
        <div className="bg-shuma-surface p-4 rounded-xl border border-shuma-border text-center text-sm text-shuma-muted">
          {vehicles.length >= 10 ? 'Máximo 10 choferes por ruta' : 'Todos los choferes han sido asignados'}
        </div>
      )}

      {/* Lista de choferes agregados */}
      {vehicles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-shuma-muted uppercase tracking-wider">
            {vehicles.length} {vehicles.length === 1 ? 'chofer' : 'choferes'} listos
          </p>
          <ul className="space-y-1.5">
            {vehicles.map(v => (
              <li key={v.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-shuma-surface/50 border border-shuma-border group">
                <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: v.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-shuma-text truncate">
                    {v.driverName}
                    <span className="ml-1.5 text-xs text-shuma-muted font-normal">· {v.matricula}</span>
                  </p>
                  <p className="text-xs text-shuma-muted">
                    {v.type}{v.capacity < 9999 && ` · Máx ${v.capacity} bultos`}
                  </p>
                  {v.invoices && (
                    <p className="text-xs text-amber-400/80 truncate mt-0.5">📄 {v.invoices}</p>
                  )}
                </div>
                <button
                  onClick={() => onRemove(v.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/20
                             text-shuma-muted hover:text-red-400 transition-all shrink-0"
                  title="Eliminar"
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

      {vehicles.length === 0 && !loadingDB && (
        <div className="text-center py-4">
          <p className="text-xs text-shuma-muted">Agrega al menos un chofer para optimizar rutas</p>
        </div>
      )}
    </div>
  );
}
