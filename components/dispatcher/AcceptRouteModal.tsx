'use client';

import { useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
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
  onSuccess
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleAcceptRoute = async () => {
    if (routes.length === 0) {
      setError('No hay rutas para guardar');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const ipAddress = await fetch('https://api.ipify.org?format=json')
        .then(r => r.json())
        .then(d => d.ip)
        .catch(() => 'unknown');

      // Crear entrada en routes por cada vehículo
      for (const route of routes) {
        const { data: routeData, error: routeErr } = await supabase
          .from('routes')
          .insert({
            date: now.toISOString().split('T')[0],
            depot_id: route.depot?.id || null,
            return_depot_id: route.endDepot?.id || null,
            departure_time: route.departureTime || '08:00',
            status: 'optimized',
            total_deliveries: route.stops.length,
            total_drivers: 1,
            created_by: userName,
            version: 1,
            is_latest: true,
            created_at: now.toISOString(),
            updated_at: now.toISOString()
          })
          .select()
          .single();

        if (routeErr) throw new Error(`Error guardando ruta: ${routeErr.message}`);

        // Crear entregas asociadas
        for (const stop of route.stops) {
          const { error: deliveryErr } = await supabase
            .from('deliveries')
            .insert({
              route_id: routeData.id,
              invoice: stop.address.invoice || 'SIN-FACTURA',
              client_name: stop.address.name,
              address: stop.address?.raw || '',
              lat: stop.address?.lat,
              lng: stop.address?.lng,
              geocoded: stop.address?.geocoded || false,
              stop_order: stop.sequence,
              status: 'pending'
            });

          if (deliveryErr) throw new Error(`Error guardando entrega: ${deliveryErr.message}`);
        }

        // Registrar en audit_log
        await supabase.from('audit_log').insert({
          action: 'route_accepted',
          entity: 'route',
          entity_id: routeData.id,
          user_name: userName,
          user_role: userRole,
          ip_address: ipAddress,
          user_agent: navigator.userAgent,
          module: 'route',
          metadata: {
            deliveries_count: route.stops.length,
            vehicle_plate: route.vehicleId,
            total_duration: route.totalDuration
          },
          created_at: now.toISOString()
        });
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div 
          className="
            bg-shuma-bg border border-shuma-border rounded-2xl shadow-2xl
            w-full max-w-md
            flex flex-col
          "
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-shuma-border">
            <h2 className="text-lg font-bold text-shuma-text">✅ Aceptar Ruta</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-shuma-surface rounded-lg"
            >
              <X className="w-5 h-5 text-shuma-muted" />
            </button>
          </div>

          {/* Content */}
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
                  ¿Deseas guardar <strong className="text-shuma-text">{routes.length} ruta(s)</strong> con <strong className="text-shuma-text">{routes.reduce((acc, r) => acc + r.stops.length, 0)} entregas</strong>?
                </p>
                <div className="p-3 rounded-lg bg-shuma-surface border border-shuma-border space-y-2">
                  {routes.slice(0, 3).map((route, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-shuma-muted">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      <span>{route.vehicleId} • {route.stops.length} paradas</span>
                    </div>
                  ))}
                  {routes.length > 3 && (
                    <p className="text-xs text-shuma-muted">+{routes.length - 3} más</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!success && (
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
