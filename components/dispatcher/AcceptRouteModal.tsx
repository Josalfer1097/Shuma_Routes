'use client';

import { createPortal } from 'react-dom';
import { useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import type { Route } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  routes: Route[];
  userName: string;
  userRole: string;
  onSuccess?: () => void;
  duplicateWarning?: string | null;
}

export default function AcceptRouteModal({
  isOpen,
  onClose,
  routes,
  userName,
  userRole,
  onSuccess,
  duplicateWarning,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const editingRouteId = typeof window !== 'undefined' ? sessionStorage.getItem('shuma_editing_route_id') : null;
  const editingDriverName = typeof window !== 'undefined' ? sessionStorage.getItem('shuma_editing_driver_name') : null;

  const handleAcceptRoute = async () => {
    if (routes.length === 0) { setError('No hay rutas para guardar'); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/routes/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes, userName, userRole }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al guardar rutas');

      setSuccess(true);
      sessionStorage.removeItem('shuma_rutas_session');
      sessionStorage.removeItem('shuma_editing_route_id');
      sessionStorage.removeItem('shuma_editing_driver_name');
      setTimeout(() => { onSuccess?.(); onClose(); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ zIndex: 9998 }}
        onClick={onClose}
      />
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 9999, pointerEvents: 'none' }}
      >
        <div
          className="pointer-events-auto bg-shuma-bg border border-shuma-border rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
          style={{ maxHeight: 'min(85vh, 600px)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-shuma-border shrink-0">
            <h2 className="text-lg font-bold text-shuma-text">✅ Aceptar Ruta</h2>
            <button onClick={onClose} className="p-1 hover:bg-shuma-surface rounded-lg">
              <X className="w-5 h-5 text-shuma-muted" />
            </button>
          </div>

          {/* Contenido scrolleable */}
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {success ? (
              <div className="text-center space-y-3 py-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto animate-bounce" />
                <p className="text-shuma-text font-semibold">¡Ruta guardada exitosamente!</p>
                <p className="text-xs text-shuma-muted">{routes.length} ruta(s) guardada(s) en Supabase</p>
              </div>
            ) : error ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="w-full px-4 py-2 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-600/30 transition-colors"
                >
                  Intentar de nuevo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-shuma-muted">
                  ¿Deseas guardar{' '}
                  <strong className="text-shuma-text">{routes.length} ruta(s)</strong> con{' '}
                  <strong className="text-shuma-text">
                    {routes.reduce((acc, r) => acc + r.stops.length, 0)} entregas
                  </strong>?
                </p>
                {duplicateWarning && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-400 font-medium">{duplicateWarning}</p>
                  </div>
                )}
                {editingRouteId && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.25)',
                  }}>
                    <p style={{ fontSize: 12, color: '#fbbf24', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
                      ✏️ Estás editando la ruta de <strong>{editingDriverName}</strong>. Al guardar se creará
                      una nueva versión optimizada — la ruta original anterior debe cerrarse manualmente
                      desde Rutas Activas si ya no la necesitas.
                    </p>
                  </div>
                )}
                <div className="rounded-lg bg-shuma-surface border border-shuma-border overflow-hidden">
                  <div className="overflow-y-auto divide-y divide-shuma-border/50" style={{ maxHeight: 200 }}>
                    {routes.map((route, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2.5 text-xs text-shuma-muted">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: route.color }} />
                        <span className="font-medium text-shuma-text">{route.driverName}</span>
                        <span>·</span>
                        <span>{route.stops.length} entregas</span>
                        <span>·</span>
                        <span>{((route.totalDistance || 0) / 1000).toFixed(1)} km</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer fijo */}
          {!success && !error && (
            <div className="flex gap-3 p-5 border-t border-shuma-border shrink-0">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-lg border border-shuma-border text-shuma-text text-sm font-semibold hover:bg-shuma-surface disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAcceptRoute}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-green-700 border border-green-500 text-white text-sm font-semibold hover:from-green-500 hover:to-green-600 disabled:opacity-50 transition-all"
              >
                {loading ? 'Guardando…' : 'Guardar Ruta'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
}
