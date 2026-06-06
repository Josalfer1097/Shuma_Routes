import React from 'react';

interface Props {
  isOpen: boolean;
  title: string;
  haversineExtraKm: number;
  isRestrictedZone: boolean;
  onConfirm: (reoptimize: boolean) => void;
  onCancel: () => void;
}

export default function ConfirmationModal({ isOpen, title, haversineExtraKm, isRestrictedZone, onConfirm, onCancel }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-shuma-surface border border-shuma-border rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 relative overflow-hidden">
        {/* Decoracin superior */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-amber-500" />
        
        <h3 className="text-lg font-bold text-shuma-text mb-4">{title}</h3>
        
        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-3 bg-shuma-bg/50 p-3 rounded-lg border border-shuma-border">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <span className="text-blue-400">📍</span>
            </div>
            <div>
              <p className="text-xs text-shuma-muted">Impacto estimado</p>
              <p className="text-sm font-bold text-shuma-text">
                {haversineExtraKm > 0 ? '+' : ''}{haversineExtraKm.toFixed(1)} km al recorrido
              </p>
            </div>
          </div>

          {isRestrictedZone && (
            <div className="flex items-start gap-3 bg-red-500/10 p-3 rounded-lg border border-red-500/30">
              <div className="shrink-0 mt-0.5">
                <span className="text-red-400">⚠️</span>
              </div>
              <div>
                <p className="text-xs font-bold text-red-400">Cruza zona de tráfico pesado</p>
                <p className="text-[10px] text-red-300/80 mt-1">
                  (Centro/Norte entre 7-9am o 6-8pm según ETA)
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs text-shuma-text font-medium text-center mb-2">
            ¿Re-optimizar ruta automáticamente después de mover?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onConfirm(true)}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold py-2.5 rounded-xl transition-all"
            >
              ✓ Sí, Re-optimizar
            </button>
            <button
              onClick={() => onConfirm(false)}
              className="flex-1 bg-shuma-surface hover:bg-shuma-border text-white text-sm font-bold py-2.5 rounded-xl transition-all"
            >
              Solo agregar
            </button>
          </div>
          <button
            onClick={onCancel}
            className="w-full text-xs text-shuma-muted hover:text-shuma-text py-2 mt-1 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
