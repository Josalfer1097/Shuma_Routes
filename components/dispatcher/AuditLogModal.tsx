'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { X, Download, ChevronRight, ChevronDown } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  user_name: string;
  user_role: string;
  ip_address: string;
  user_agent: string;
  module: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
  initialEntityId?: string;
}

export default function AuditLogModal({ isOpen, onClose, userRole, initialEntityId }: Props) {
  const [logs, setLogs]                 = useState<AuditLogEntry[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterModule, setFilterModule] = useState('');
  const [filterUser, setFilterUser]     = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [filterEntityId, setFilterEntityId] = useState(initialEntityId || '');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (initialEntityId) {
      setFilterEntityId(initialEntityId);
    } else {
      setFilterEntityId('');
    }
  }, [initialEntityId, isOpen]);

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterModule) params.set('module', filterModule);
      if (filterUser)   params.set('user_name', filterUser);
      if (dateFrom)     params.set('dateFrom', dateFrom);
      if (filterEntityId) params.set('entity_id', filterEntityId);

      const res  = await fetch(`/api/audit?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error('Error al cargar bitácora');
      setLogs(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [filterModule, filterUser, dateFrom, filterEntityId]);

  useEffect(() => {
    if (isOpen && userRole === 'admin') {
      fetchLogs();
    }
  }, [isOpen, userRole, fetchLogs]);

  // Guard DESPUÉS de todos los hooks — regla de React
  if (!isOpen || userRole !== 'admin') return null;

  const exportToCSV = () => {
    const rows = [
      ['Fecha', 'Usuario', 'Rol', 'Módulo', 'Acción', 'Entidad', 'IP'],
      ...logs.map(log => [
        new Date(log.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
        log.user_name,
        log.user_role,
        log.module,
        log.action,
        log.entity,
        log.ip_address,
      ]),
    ]
      .map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = `bitacora-shuma-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      dateStyle: 'short',
      timeStyle: 'medium',
    });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-shuma-bg border border-shuma-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-shuma-border">
            <div>
              <h2 className="text-xl font-bold text-shuma-text">📊 Bitácora de Auditoría</h2>
              <p className="text-xs text-shuma-muted mt-1">CDMX • Filtrable y exportable</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-shuma-surface rounded-lg transition-colors">
              <X className="w-5 h-5 text-shuma-muted" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 p-4 border-b border-shuma-border/50 bg-shuma-surface/50">
            <input
              type="text"
              placeholder="Usuario"
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              className="px-3 py-2 rounded-lg bg-shuma-bg border border-shuma-border text-xs text-shuma-text placeholder:text-shuma-muted focus:outline-none focus:border-blue-500"
            />
            <select
              value={filterModule}
              onChange={e => setFilterModule(e.target.value)}
              className="px-3 py-2 rounded-lg bg-shuma-bg border border-shuma-border text-xs text-shuma-text focus:outline-none focus:border-blue-500"
            >
              <option value="">Módulo</option>
              <option value="Rutas">Rutas</option>
              <option value="Entregas">Entregas</option>
              <option value="Autenticación">Autenticación</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg bg-shuma-bg border border-shuma-border text-xs text-shuma-text focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Entity ID"
              value={filterEntityId}
              onChange={e => setFilterEntityId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-shuma-bg border border-shuma-border text-xs text-shuma-text placeholder:text-shuma-muted focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={exportToCSV}
              disabled={logs.length === 0}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-600/20 border border-green-500/30 text-xs text-green-400 hover:bg-green-600/30 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
            <button
              onClick={() => { setFilterModule(''); setFilterUser(''); setDateFrom(''); setFilterEntityId(''); }}
              className="px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-xs text-blue-400 hover:bg-blue-600/30 transition-colors"
            >
              Limpiar
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-shuma-muted text-sm">Cargando bitácora…</div>
            ) : error ? (
              <div className="p-4 text-red-400 text-sm">{error}</div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-shuma-muted text-sm">No hay registros</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-shuma-surface border-b border-shuma-border">
                  <tr>
                    {['Fecha/Hora (CDMX)', 'Usuario', 'Rol', 'Módulo', 'Acción', 'IP'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-shuma-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-shuma-border/50">
                  {logs.map(log => {
                    const isExpanded = expandedRows.has(log.id);
                    const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
                    
                    return (
                      <Fragment key={log.id}>
                        <tr 
                          onClick={() => hasMetadata && toggleExpand(log.id)}
                          className={`hover:bg-shuma-surface/50 transition-colors ${hasMetadata ? 'cursor-pointer' : ''}`}
                        >
                          <td className="px-4 py-2 text-shuma-text">
                            <div className="flex items-center gap-2">
                              {hasMetadata ? (
                                <span className="text-shuma-muted shrink-0">
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </span>
                              ) : <span className="w-[14px]"></span>}
                              {formatDate(log.created_at)}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-blue-400 font-medium">{log.user_name}</td>
                          <td className="px-4 py-2 text-amber-400">{log.user_role}</td>
                          <td className="px-4 py-2 text-cyan-400">{log.module}</td>
                          <td className="px-4 py-2 text-shuma-text">{log.action}</td>
                          <td className="px-4 py-2 text-shuma-muted">{log.ip_address}</td>
                        </tr>
                        {isExpanded && hasMetadata && (
                          <tr className="bg-slate-900/40 border-b border-shuma-border/50">
                            <td colSpan={6} className="px-10 py-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-6">
                                {Object.entries(log.metadata!).map(([key, value]) => {
                                  // Manejo de fotos
                                  if (key === 'foto_evidencia' || key === 'fotos_evidencia') {
                                    let urls: string[] = [];
                                    if (typeof value === 'string' && value.startsWith('[')) {
                                      try { urls = JSON.parse(value); } catch(e) {}
                                    } else if (typeof value === 'string' && value.startsWith('http')) {
                                      urls = [value];
                                    }
                                    if (urls.length > 0) {
                                      return (
                                        <div key={key} className="col-span-2 sm:col-span-4 mt-2">
                                          <p className="text-[10px] text-shuma-muted font-bold uppercase tracking-wider mb-2">{key.replace(/_/g, ' ')}</p>
                                          <div className="flex gap-3 overflow-x-auto pb-2">
                                            {urls.map((u, i) => (
                                              <a key={i} href={u} target="_blank" rel="noreferrer" className="shrink-0">
                                                <img src={u} alt="Evidencia" className="h-32 object-cover rounded-xl border border-shuma-border hover:opacity-80 transition-opacity" />
                                              </a>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    }
                                  }
                                  
                                  // Valores normales
                                  return (
                                    <div key={key}>
                                      <p className="text-[10px] text-shuma-muted font-bold uppercase tracking-wider">{key.replace(/_/g, ' ')}</p>
                                      <p className="text-sm text-shuma-text mt-0.5 font-medium">{String(value)}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-6 py-3 border-t border-shuma-border bg-shuma-surface/50 text-xs text-shuma-muted">
            Total: {logs.length} registros
          </div>
        </div>
      </div>
    </>
  );
}
