'use client';

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
}

export default function AcceptRouteModal({
  isOpen,
  onClose,
  routes,
  userName,
  userRole,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Guard ANTES del early return — no hay hooks después de este punto
  if (!isOpen) return null;

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
      setTimeout(() => { onSuccess?.(); onClose(); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" onClick={onClose} />

      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div
          className="bg-shuma-bg border border-shuma-border rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(85vh, 600px)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-shuma-border">
            <h2 className="text-lg font-bold text-shuma-text">✅ Aceptar Ruta</h2>
            <button onClick={onClose} className="p-1 hover:bg-shuma-surface rounded-lg">
              <X className="w-5 h-5 text-shuma-muted" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {success ? (
              <div className="text-center space-y-3">
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
                <div className="p-3 rounded-lg bg-shuma-surface border border-shuma-border space-y-2 max-h-48 overflow-y-auto">
                  {routes.map((route, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-shuma-muted">
                      <span style={{ color: route.color }}>●</span>
                      <span>{route.driverName} • {route.stops.length} paradas • {(( route.totalDistance || 0)/1000).toFixed(1)} km</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!success && !error && (
            <div className="flex gap-3 p-6 border-t border-shuma-border">
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
}
