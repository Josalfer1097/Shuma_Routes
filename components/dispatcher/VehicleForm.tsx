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
  const [formError,  setFormError]  = useState<string | null>(null);

  const [driverSearch, setDriverSearch]       = useState('');
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);

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

  useEffect(() => {
    if (!showDriverDropdown) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.driver-combobox')) setShowDriverDropdown(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showDriverDropdown]);

  const assignedDriverNames = vehicles.map(v => v.driverName);
  const assignedMatriculas = vehicles.map(v => v.matricula);
  const availableDrivers = driversDB.filter(d => !assignedDriverNames.includes(d.name));
  const filteredDrivers = availableDrivers.filter(d =>
    d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
    (d.employee_id || '').toLowerCase().includes(driverSearch.toLowerCase())
  );
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
      invoices:    '',
    };

    onAdd(newVehicle);

    // Resetear: siguiente chofer disponible
    const nextAssigned = [...assignedDriverNames, driver.name];
    const next = driversDB.find(d => !nextAssigned.includes(d.name));
    setSelectedDriverId(next?.id || '');
    const nextVehicle = vehiclesDB.find(v =>
      ![...assignedMatriculas, newVehicle.matricula].includes(v.plate)
    );
    setSelectedVehicleId(nextVehicle?.id || '');
    setCapacity('');
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
      <style>{`
        .vf-select { background: #0D1E38; color: #E8EFF8; border: 1px solid #112040;
          border-radius: 8px; padding: 7px 10px; width: 100%; font-size: 14px;
          font-family: 'DM Sans', sans-serif; appearance: none; outline: none;
          transition: border-color 0.2s; cursor: pointer; }
        .vf-select:focus { border-color: #2196F3; box-shadow: 0 0 0 2px rgba(33,150,243,0.12); }
        .vf-select option { background: #0D1E38; color: #E8EFF8; }
        .vf-select option:disabled { color: #3B5270; }
        .vf-select optgroup { background: #0A1628; color: #5B7BA0; font-size: 11px;
          font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
      `}</style>
      {availableDrivers.length > 0 && vehicles.length < 10 ? (
        <form onSubmit={handleSubmit} className="space-y-3 bg-shuma-surface p-4 rounded-xl border border-shuma-border">
          <div className="space-y-3">

            {/* Chofer */}
            <div>
              <label className="block text-xs font-medium text-shuma-muted mb-1">Chofer *</label>
              <div className="driver-combobox" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => { setShowDriverDropdown(!showDriverDropdown); setDriverSearch(''); }}
                  style={{
                    width: '100%', padding: '8px 10px', textAlign: 'left',
                    background: '#0D1E38', border: '1px solid #112040',
                    borderRadius: 8, color: selectedDriverId
                      ? '#E8EFF8' : '#3B5270',
                    fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                    cursor: 'pointer', outline: 'none',
                    transition: 'border-color 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#2196F3')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#112040')}
                >
                  <span>
                    {selectedDriverId
                      ? (() => {
                          const d = driversDB.find(d => d.id === selectedDriverId);
                          return d ? `${d.name}${d.employee_id ? ` (${d.employee_id})` : ''}` : '— Selecciona un chofer —';
                        })()
                      : '— Selecciona un chofer —'}
                  </span>
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
                    style={{ transform: showDriverDropdown ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s', flexShrink: 0 }}>
                    <path d="M1 1l4 4 4-4" stroke="#5B7BA0" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {showDriverDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    zIndex: 50, marginTop: 4,
                    background: '#0D1E38',
                    border: '1px solid rgba(33,150,243,0.3)',
                    borderRadius: 10, overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}>
                    <div style={{ padding: '8px 8px 4px' }}>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Buscar chofer..."
                        value={driverSearch}
                        onChange={e => setDriverSearch(e.target.value)}
                        style={{
                          width: '100%', padding: '6px 10px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(33,150,243,0.2)',
                          borderRadius: 6, color: '#E8EFF8',
                          fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {filteredDrivers.length === 0 ? (
                        <div style={{ padding: '10px 12px', fontSize: 12,
                          color: '#3B5270', fontFamily: "'DM Sans', sans-serif",
                          textAlign: 'center' }}>
                          Sin resultados
                        </div>
                      ) : (
                        filteredDrivers.map(d => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => {
                              setSelectedDriverId(d.id);
                              setShowDriverDropdown(false);
                              setDriverSearch('');
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              width: '100%', padding: '8px 12px',
                              background: selectedDriverId === d.id
                                ? 'rgba(33,150,243,0.15)' : 'transparent',
                              border: 'none', cursor: 'pointer', textAlign: 'left',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                              transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => {
                              if (selectedDriverId !== d.id)
                                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                            }}
                            onMouseLeave={e => {
                              if (selectedDriverId !== d.id)
                                (e.currentTarget as HTMLElement).style.background = 'transparent';
                            }}
                          >
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: (() => {
                                const routeV = vehicles.find(v => v.driverName === d.name);
                                return routeV ? `${routeV.color}20` : '#3b82f620';
                              })(),
                              border: `1px solid ${(() => {
                                const routeV = vehicles.find(v => v.driverName === d.name);
                                return routeV ? `${routeV.color}40` : '#3b82f640';
                              })()}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700, 
                              color: (() => {
                                const routeV = vehicles.find(v => v.driverName === d.name);
                                return routeV ? routeV.color : '#3b82f6';
                              })(),
                              fontFamily: "'Exo 2', sans-serif", flexShrink: 0,
                            }}>
                              {d.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500,
                                color: '#E8EFF8', fontFamily: "'DM Sans', sans-serif" }}>
                                {d.name}
                              </div>
                              {d.employee_id && (
                                <div style={{ fontSize: 10, color: '#5B7BA0',
                                  fontFamily: "'DM Sans', sans-serif" }}>
                                  {d.employee_id}
                                </div>
                              )}
                            </div>
                            {selectedDriverId === d.id && (
                              <span style={{ marginLeft: 'auto', color: '#2196F3', fontSize: 14 }}>✓</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Vehículo */}
            <div>
              <label className="block text-xs font-medium text-shuma-muted mb-1">Vehículo *</label>
              <select
                value={selectedVehicleId}
                onChange={e => setSelectedVehicleId(e.target.value)}
                className="vf-select"
              >
                <option value="">— Selecciona un vehículo —</option>
                {(['truck_large', 'truck_medium', 'truck_small', 'van'] as const).map(type => {
                  const group = vehiclesDB.filter(v => v.type === type);
                  if (group.length === 0) return null;
                  return (
                    <optgroup key={type} label={VEHICLE_TYPE_LABELS[type]}>
                      {group.map(v => {
                        const isAssigned = assignedMatriculas.includes(v.plate);
                        return (
                          <option key={v.id} value={v.id} disabled={isAssigned}>
                            {v.plate} — {VEHICLE_TYPE_LABELS[v.type]}{isAssigned ? ' (Asignado)' : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                  );
                })}
              </select>
              {selectedVehicle && (
                <div style={{ marginTop: 6 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 10, color: '#5B7BA0',
                    fontFamily: "'DM Sans', sans-serif", marginBottom: 3,
                  }}>
                    <span>{VEHICLE_TYPE_LABELS[selectedVehicle.type]}</span>
                    <span>Capacidad: {(selectedVehicle as any).max_stops === null ? '∞' : ((selectedVehicle as any).max_stops || '∞')} entregas</span>
                  </div>
                  <div style={{
                    height: 3, borderRadius: 99,
                    background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: (selectedVehicle as any).max_stops
                        ? `${Math.min(100, (vehicles.length / (vehiclesDB.length || 1)) * 100)}%`
                        : '30%',
                      background: 'linear-gradient(90deg, #1565C0, #2196F3)',
                      borderRadius: 99,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              )}
            </div>

            {/* Capacidad */}
            <div className="grid grid-cols-1 gap-2">
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
                    {v.type}{v.capacity < 9999 && ` — Máx ${v.capacity} bultos`}
                  </p>
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
