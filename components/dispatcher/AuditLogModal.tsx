'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
}

export default function AuditLogModal({ isOpen, onClose, userRole }: Props) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [filterAction, setFilterAction] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [dateFrom, setDateFrom] = useState('');

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterAction) query = query.eq('action', filterAction);
      if (filterModule) query = query.eq('module', filterModule);
      if (filterUser) query = query.eq('user_name', filterUser);
      if (dateFrom) {
        const startDate = new Date(dateFrom).toISOString();
        query = query.gte('created_at', startDate);
      }

      const { data, error: err } = await query.limit(500);
      
      if (err) throw err;
      setLogs(data || []);
      setFilteredLogs(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching logs');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterModule, filterUser, dateFrom]);

  useEffect(() => {
    if (isOpen && userRole === 'admin') {
      fetchAuditLogs();
    }
  }, [isOpen, userRole, fetchAuditLogs]);

  // Guard DESPUÉS de todos los hooks
  if (!isOpen || userRole !== 'admin') return null;

  const exportToCSV = () => {
    const csv = [
      ['Fecha', 'Usuario', 'Rol', 'Módulo', 'Acción', 'Entidad', 'IP', 'Detalles'],
      ...filteredLogs.map(log => [
        new Date(log.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
        log.user_name,
        log.user_role,
        log.module,
        log.action,
        log.entity,
        log.ip_address,
        JSON.stringify(log.metadata || {})
      ])
    ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bitacora-shuma-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('es-MX', { 
      timeZone: 'America/Mexico_City',
      dateStyle: 'short',
      timeStyle: 'medium'
    });
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      {/* Modal */}
      <div 
        className={`
          fixed inset-0 z-50 flex items-center justify-center p-4
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          transition-opacity duration-200
        `}
      >
        <div 
          className="
            bg-shuma-bg border border-shuma-border rounded-2xl shadow-2xl
            w-full max-w-5xl max-h-[90vh] overflow-hidden
            flex flex-col
          "
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-shuma-border">
            <div>
              <h2 className="text-xl font-bold text-shuma-text">📊 Bitácora de Auditoría</h2>
              <p className="text-xs text-shuma-muted mt-1">CDMX • Filtrable y exportable</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-shuma-surface rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-shuma-muted" />
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-4 border-b border-shuma-border/50 bg-shuma-surface/50">
            <input
              type="text"
              placeholder="Usuario"
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="px-3 py-2 rounded-lg bg-shuma-bg border border-shuma-border text-xs text-shuma-text placeholder:text-shuma-muted focus:outline-none focus:border-blue-500"
            />
            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="px-3 py-2 rounded-lg bg-shuma-bg border border-shuma-border text-xs text-shuma-text focus:outline-none focus:border-blue-500"
            >
              <option value="">Módulo</option>
              <option value="route">Ruta</option>
              <option value="delivery">Entrega</option>
              <option value="auth">Auth</option>
              <option value="pdf">PDF</option>
              <option value="csv">CSV</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg bg-shuma-bg border border-shuma-border text-xs text-shuma-text focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={exportToCSV}
              disabled={filteredLogs.length === 0}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-600/20 border border-green-500/30 text-xs text-green-400 hover:bg-green-600/30 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
            <button
              onClick={() => {
                setFilterAction('');
                setFilterModule('');
                setFilterUser('');
                setDateFrom('');
              }}
              className="px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-xs text-blue-400 hover:bg-blue-600/30 transition-colors"
            >
              Limpiar
            </button>
          </div>

          {/* Tabla */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-shuma-muted text-sm">Cargando bitácora…</div>
              </div>
            ) : error ? (
              <div className="p-4 text-red-400 text-sm">{error}</div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-shuma-muted text-sm">No hay registros</div>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-shuma-surface border-b border-shuma-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-shuma-muted">Fecha/Hora (CDMX)</th>
                    <th className="px-4 py-3 text-left font-semibold text-shuma-muted">Usuario</th>
                    <th className="px-4 py-3 text-left font-semibold text-shuma-muted">Rol</th>
                    <th className="px-4 py-3 text-left font-semibold text-shuma-muted">Módulo</th>
                    <th className="px-4 py-3 text-left font-semibold text-shuma-muted">Acción</th>
                    <th className="px-4 py-3 text-left font-semibold text-shuma-muted">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-shuma-border/50">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-shuma-surface/50 transition-colors">
                      <td className="px-4 py-2 text-shuma-text">{formatDate(log.created_at)}</td>
                      <td className="px-4 py-2 text-blue-400 font-medium">{log.user_name}</td>
                      <td className="px-4 py-2 text-amber-400">{log.user_role}</td>
                      <td className="px-4 py-2 text-cyan-400">{log.module}</td>
                      <td className="px-4 py-2 text-shuma-text">{log.action}</td>
                      <td className="px-4 py-2 text-shuma-muted text-xs">{log.ip_address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-shuma-border bg-shuma-surface/50 text-xs text-shuma-muted">
            Total: {filteredLogs.length} registros
          </div>
        </div>
      </div>
    </>
  );
}
