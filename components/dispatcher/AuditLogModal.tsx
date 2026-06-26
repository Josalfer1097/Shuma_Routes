'use client';

import { useEffect, useState, useCallback, Fragment, useRef } from 'react';
import { X, Download, ChevronRight, ChevronDown, LogIn, LogOut, Package, Truck, RotateCcw, Lock, AlertCircle } from 'lucide-react';

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
  const [searchText, setSearchText]   = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [totalCount, setTotalCount]   = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage]   = useState(1);
  const [actionType, setActionType]     = useState<string>('');
  const PAGE_SIZE = 50; // registros por página
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const handleDragStart = (e: React.MouseEvent) => {
    if (isMaximized) return;
    // No iniciar drag si se hace click en botones del header
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX:  modalPos.x,
      origY:  modalPos.y,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setModalPos({
        x: dragRef.current.origX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const COL_MAX_WIDTHS = {
    fecha:   280,
    usuario: 200,
    rol:     120,
    modulo:  160,
    accion:  350,
    ip:      160,
  };

  const [colWidths, setColWidths] = useState({
    fecha:   200,
    usuario: 130,
    rol:     90,
    modulo:  110,
    accion:  200,
    ip:      120,
  });

  const startResize = (col: keyof typeof colWidths, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[col];
    const onMove = (ev: MouseEvent) => {
      const diff = ev.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [col]: Math.min(
          COL_MAX_WIDTHS[col],
          Math.max(60, startW + diff)
        )
      }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

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
      tableScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      const params = new URLSearchParams();
      if (filterModule) params.set('module', filterModule);
      if (filterUser)   params.set('user_name', filterUser);
      if (dateFrom)     params.set('dateFrom', dateFrom);
      if (filterEntityId) params.set('entity_id', filterEntityId);
      if (searchText)   params.set('search', searchText);
      if (dateTo)       params.set('dateTo', dateTo);
      if (actionType)   params.set('actionType', actionType);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String((currentPage - 1) * PAGE_SIZE));

      const res  = await fetch(`/api/audit?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error('Error al cargar bitácora');
      setLogs(json.data || []);
      setTotalCount(json.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [filterModule, filterUser, dateFrom, filterEntityId, searchText, dateTo, currentPage, actionType]);

  useEffect(() => {
    if (isOpen && userRole === 'admin') {
      fetchLogs();
    }
  }, [isOpen, userRole, fetchLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterModule, filterUser, dateFrom, filterEntityId, searchText, dateTo, actionType]);

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

  const getActionIcon = (action: string, module: string) => {
    const a = action.toLowerCase();
    const m = module.toLowerCase();
    if (a.includes('login') || a.includes('sesión'))   return <LogIn size={13} className="text-blue-400 shrink-0" />;
    if (a.includes('logout') || a.includes('salida'))  return <LogOut size={13} className="text-slate-400 shrink-0" />;
    if (a.includes('entrega') || m === 'entregas')     return <Package size={13} className="text-emerald-400 shrink-0" />;
    if (a.includes('ruta') || m === 'rutas')           return <Truck size={13} className="text-blue-400 shrink-0" />;
    if (a.includes('reapertura') || a.includes('corrección')) return <RotateCcw size={13} className="text-amber-400 shrink-0" />;
    if (a.includes('cierre') || a.includes('cerrar'))  return <Lock size={13} className="text-purple-400 shrink-0" />;
    return <AlertCircle size={13} className="text-shuma-muted shrink-0" />;
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className="bg-shuma-bg border border-shuma-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={isMaximized ? {
            width: 'calc(100vw - 32px)',
            height: 'calc(100vh - 32px)',
            maxWidth: 'none',
            maxHeight: 'none',
            position: 'relative',
            transform: 'none',
            transition: 'none',
            resize: 'none',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          } : {
            width: '90vw',
            maxWidth: 1100,
            maxHeight: '90vh',
            position: 'relative',
            transform: `translate(${modalPos.x}px, ${modalPos.y}px)`,
            transition: isDragging ? 'none' : 'transform 0.1s ease',
            resize: 'both',
            overflow: 'auto',
            minWidth: 600,
            minHeight: 400,
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="flex items-center justify-between p-6 border-b border-shuma-border"
            onMouseDown={handleDragStart}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          >
            <div>
              <h2 className="text-xl font-bold text-shuma-text">🔒 Bitácora de Auditoría</h2>
              <p className="text-xs text-shuma-muted mt-1">
                CDMX • Filtrable y exportable
                <span style={{ marginLeft: 8, opacity: 0.4, fontSize: 10 }}>
                  ↕↔ Arrastra para mover · ↘ Esquina para redimensionar
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setIsMaximized(m => !m);
                  if (!isMaximized) setModalPos({ x: 0, y: 0 }); // centrar al maximizar
                }}
                className="p-2 hover:bg-shuma-surface rounded-lg transition-colors"
                title={isMaximized ? 'Restaurar' : 'Maximizar'}
              >
                {isMaximized ? (
                  // Ícono restaurar (dos cuadros)
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    className="text-shuma-muted">
                    <rect x="8" y="8" width="13" height="13" rx="1"/>
                    <path d="M4 16V4h12"/>
                  </svg>
                ) : (
                  // Ícono maximizar (cuadro con flecha)
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    className="text-shuma-muted">
                    <polyline points="15 3 21 3 21 9"/>
                    <polyline points="9 21 3 21 3 15"/>
                    <line x1="21" y1="3" x2="14" y2="10"/>
                    <line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                )}
              </button>
              <button onClick={onClose} className="p-2 hover:bg-shuma-surface rounded-lg transition-colors">
                <X className="w-5 h-5 text-shuma-muted" />
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-shuma-border/50 bg-shuma-surface/50 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {[
                { key: '',        label: 'Todos',    icon: '📋' },
                { key: 'login',   label: 'Accesos',  icon: '🔐' },
                { key: 'entrega', label: 'Entregas', icon: '📦' },
                { key: 'ruta',    label: 'Rutas',    icon: '🚛' },
                { key: 'sistema', label: 'Sistema',  icon: '⚙️' },
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => { setActionType(key); setCurrentPage(1); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    actionType === key
                      ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                      : 'bg-shuma-surface text-shuma-muted border-shuma-border hover:text-white hover:border-blue-500/30'
                  }`}
                >
                  <span>{icon}</span> {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              <input
              type="text"
              placeholder="🔍 Buscar en acciones, usuario, detalles..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchLogs()}
              className="col-span-2 sm:col-span-6 px-3 py-2 rounded-lg bg-shuma-bg border border-shuma-accent/40 text-xs text-shuma-text placeholder:text-shuma-muted focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
            />
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
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
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
              onClick={() => { setFilterModule(''); setFilterUser(''); setDateFrom(''); setFilterEntityId(''); setSearchText(''); setDateTo(''); setActionType(''); }}
              className="px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-xs text-blue-400 hover:bg-blue-600/30 transition-colors"
            >
              Limpiar
            </button>
            </div>
          </div>

          {totalCount > 0 && (
            <div className="px-4 py-1.5 bg-shuma-surface/50 border-b border-shuma-border/30 text-[11px] text-shuma-muted font-medium">
              {totalCount} registro{totalCount !== 1 ? 's' : ''} encontrado{totalCount !== 1 ? 's' : ''}
              {searchText && <span className="text-blue-400 ml-1">· búsqueda: "{searchText}"</span>}
            </div>
          )}

          <div ref={tableScrollRef} className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-shuma-muted text-sm">Cargando bitácora…</div>
            ) : error ? (
              <div className="p-4 text-red-400 text-sm">{error}</div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-shuma-muted text-sm">No hay registros</div>
            ) : (
              <table className="w-full text-xs" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
                <thead className="sticky top-0 bg-shuma-surface border-b border-shuma-border">
                  <tr>
                    {([
                      { key: 'fecha',   label: 'Fecha/Hora (CDMX)' },
                      { key: 'usuario', label: 'Usuario' },
                      { key: 'rol',     label: 'Rol' },
                      { key: 'modulo',  label: 'Módulo' },
                      { key: 'accion',  label: 'Acción' },
                      { key: 'ip',      label: 'IP' },
                    ] as const).map(({ key, label }) => (
                      <th
                        key={key}
                        style={{ width: colWidths[key], minWidth: 60, position: 'relative', userSelect: 'none' }}
                        className="px-4 py-3 text-left font-semibold text-shuma-muted"
                      >
                        {label}
                        {/* Handle de resize */}
                        <span
                          onMouseDown={(e) => startResize(key, e)}
                          style={{
                            position: 'absolute', right: 0, top: 0, bottom: 0,
                            width: 6, cursor: 'col-resize',
                            background: 'transparent',
                            borderRight: '2px solid rgba(33,150,243,0.15)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.borderRightColor = 'rgba(33,150,243,0.5)')}
                          onMouseLeave={e => (e.currentTarget.style.borderRightColor = 'rgba(33,150,243,0.15)')}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-shuma-border/50">
                  {logs.map((log, rowIdx) => {
                    const isExpanded = expandedRows.has(log.id);
                    const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
                    
                    return (
                      <Fragment key={log.id}>
                        <tr 
                          onClick={() => hasMetadata && toggleExpand(log.id)}
                          className={`hover:bg-shuma-surface/50 transition-colors ${hasMetadata ? 'cursor-pointer' : ''} ${rowIdx % 2 === 0 ? '' : 'bg-slate-900/30'}`}
                        >
                          <td className="px-4 py-2 text-shuma-text" style={{ width: colWidths.fecha, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div className="flex items-center gap-2">
                              {hasMetadata ? (
                                <span className="text-shuma-muted shrink-0">
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </span>
                              ) : <span className="w-[14px]"></span>}
                              {formatDate(log.created_at)}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-blue-400 font-medium" style={{ width: colWidths.usuario, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.user_name}</td>
                          <td className="px-4 py-2" style={{ width: colWidths.rol, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide border ${
                              log.user_role === 'admin'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                            }`}>
                              {log.user_role === 'admin' ? 'ADMIN' : 'CHOFER'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-cyan-400" style={{ width: colWidths.modulo, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.module}</td>
                          <td className="px-4 py-2 text-shuma-text" style={{ width: colWidths.accion, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div className="flex items-center gap-1.5">
                              {getActionIcon(log.action, log.module)}
                              {log.action}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-shuma-muted" style={{ width: colWidths.ip, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.ip_address}</td>
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
                                  const HIDDEN_KEYS = [
                                    'driver_id', 'route_driver_id', 'ruta_id', 'delivery_id',
                                    'request_id', 'entity_id', 'user_id', 'route_id',
                                  ];

                                  const KEY_LABELS: Record<string, string> = {
                                    ruta_code:         'Código de Ruta',
                                    ruta_fecha:        'Fecha de Ruta',
                                    factura:           'Factura',
                                    cliente:           'Cliente',
                                    direccion:         'Dirección',
                                    parada:            'N° Parada',
                                    valor_mercancia:   'Valor Mercancía',
                                    motivo_fallo:      'Motivo',
                                    entrega_parcial:   'Entrega Parcial',
                                    cantidad_parcial:  'Cantidad Parcial',
                                    fotos_evidencia:   'Fotos',
                                    estado_anterior:   'Estado Anterior',
                                    estado_nuevo:      'Estado Nuevo',
                                    entregas_activadas:'Entregas Activadas',
                                    full_name:         'Nombre Completo',
                                    reason:            'Motivo',
                                    device:            'Dispositivo',
                                    browser:           'Navegador',
                                    consent_type:      'Tipo Consentimiento',
                                    timestamp:         'Timestamp',
                                  };

                                  if (HIDDEN_KEYS.includes(key)) return null;
                                  if ((key === 'foto_evidencia' || key === 'fotos_evidencia') && value === 'No') return null;
                                  if (value === null || value === 'null' || value === undefined) return null;
                                  if (value === false || value === 'false') return null;

                                  const strVal = String(value);
                                  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strVal);
                                  if (isUUID && !KEY_LABELS[key]) return null;

                                  const displayKey = KEY_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                  const displayValue = strVal;

                                  const isMonetary = key === 'valor_mercancia' && !isNaN(Number(value));
                                  const isDateStr = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(strVal);
                                  
                                  const formattedValue = isDateStr
                                    ? new Date(strVal).toLocaleString('es-MX', {
                                        timeZone: 'America/Mexico_City',
                                        dateStyle: 'short', timeStyle: 'medium'
                                      })
                                    : isMonetary ? `$${Number(value).toLocaleString('es-MX')}`
                                    : displayValue;

                                  return (
                                    <div key={key}>
                                      <p className="text-[10px] text-shuma-muted font-bold uppercase tracking-wider">{displayKey}</p>
                                      <p className="text-sm text-shuma-text mt-0.5 font-medium" title={isUUID ? strVal : undefined}>{formattedValue}</p>
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

          <div className="px-4 py-3 border-t border-shuma-border bg-shuma-surface/50
            flex items-center justify-between gap-4 flex-wrap">
            
            {/* Info */}
            <span className="text-xs text-shuma-muted">
              {totalCount > 0 ? (
                <>
                  Mostrando{' '}
                  <span className="text-shuma-text font-medium">
                    {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)}
                  </span>
                  {' '}de{' '}
                  <span className="text-shuma-text font-medium">{totalCount}</span>
                  {' '}registros
                </>
              ) : (
                'Sin registros'
              )}
            </span>

            {/* Controles */}
            {totalCount > PAGE_SIZE && (
              <div className="flex items-center gap-1">
                {/* Primera página */}
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded text-xs text-shuma-muted hover:text-white
                    hover:bg-shuma-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Primera página"
                >
                  «
                </button>

                {/* Anterior */}
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded text-xs text-shuma-muted hover:text-white
                    hover:bg-shuma-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ‹ Anterior
                </button>

                {/* Páginas numéricas — máximo 5 visibles */}
                {(() => {
                  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
                  const delta = 2;
                  const pages: (number | '...')[] = [];
                  
                  for (let i = 1; i <= totalPages; i++) {
                    if (
                      i === 1 || i === totalPages ||
                      (i >= currentPage - delta && i <= currentPage + delta)
                    ) {
                      pages.push(i);
                    } else if (
                      (i === currentPage - delta - 1 && i > 1) ||
                      (i === currentPage + delta + 1 && i < totalPages)
                    ) {
                      pages.push('...');
                    }
                  }
                  
                  return pages.map((p, i) => p === '...' ? (
                    <span key={`dots-${i}`}
                      className="px-1 text-xs text-shuma-muted">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                        currentPage === p
                          ? 'bg-blue-600 text-white'
                          : 'text-shuma-muted hover:text-white hover:bg-shuma-border'
                      }`}
                    >
                      {p}
                    </button>
                  ));
                })()}

                {/* Siguiente */}
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1))}
                  disabled={currentPage >= Math.ceil(totalCount / PAGE_SIZE)}
                  className="px-2.5 py-1 rounded text-xs text-shuma-muted hover:text-white
                    hover:bg-shuma-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente ›
                </button>

                {/* Última página */}
                <button
                  onClick={() => setCurrentPage(Math.ceil(totalCount / PAGE_SIZE))}
                  disabled={currentPage >= Math.ceil(totalCount / PAGE_SIZE)}
                  className="px-2 py-1 rounded text-xs text-shuma-muted hover:text-white
                    hover:bg-shuma-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Última página"
                >
                  »
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
