'use client';

import { useEffect, useState } from 'react';
import { Cloud, CloudRain, Sun, AlertCircle } from 'lucide-react';
import type { WeatherData } from '@/lib/weather';

interface Props {
  weather: WeatherData | null;
  onAuditOpen?: () => void;
}

export default function WeatherIntelPanel({ weather, onAuditOpen }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !weather) return null;

  // Determinar alerta y color
  const getAlertStatus = () => {
    if (weather.alerts && weather.alerts.length > 0) {
      return { status: 'tormenta', color: 'from-red-900 to-red-800', icon: CloudRain, label: 'Alerta ↑' };
    }
    const desc = weather.description.toLowerCase();
    if (desc.includes('nubes') || desc.includes('nublado')) {
      return { status: 'precaution', color: 'from-amber-900 to-amber-800', icon: Cloud, label: 'Precaución' };
    }
    return { status: 'optimal', color: 'from-green-900 to-green-800', icon: Sun, label: 'Óptimo' };
  };

  const alert = getAlertStatus();
  const AlertIcon = alert.icon;

  return (
    <div 
      className="fixed top-20 right-6 z-50 group"
      style={{
        animation: 'fadeInSlide 0.4s ease-out'
      }}
    >
      <style>{`
        @keyframes fadeInSlide {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes iconBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }

        .weather-icon-animated {
          animation: iconBob 2.5s ease-in-out infinite;
        }

        .weather-panel-hover {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .weather-panel-hover:hover {
          transform: scale(1.05);
        }

        .weather-glow {
          box-shadow: 0 0 20px rgba(33, 150, 243, 0.3);
        }

        .weather-glow.alert-tormenta {
          box-shadow: 0 0 24px rgba(239, 68, 68, 0.4);
        }

        .weather-glow.alert-precaution {
          box-shadow: 0 0 24px rgba(245, 158, 11, 0.4);
        }
      `}</style>

      {/* Card principal */}
      <div 
        className={`
          weather-panel-hover weather-glow
          backdrop-blur-xl bg-gradient-to-br ${alert.color}
          border border-white/10 rounded-2xl p-4 w-64
          alert-${alert.status}
        `}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <AlertIcon className="w-5 h-5 text-white weather-icon-animated" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white/70">INTELIGENCIA CLIMÁTICA</p>
              <p className="text-base font-bold text-white">{weather.temp}°C</p>
            </div>
          </div>
        </div>

        {/* Condición */}
        <div className="mb-3 pb-3 border-b border-white/10">
          <p className="text-sm text-white/90 font-medium">{weather.description}</p>
          <p className="text-xs text-white/60 mt-1">Humedad: {weather.humidity}% | Viento: {Math.round(weather.windSpeed)} km/h</p>
        </div>

        {/* Alerta */}
        <div className={`
          flex items-start gap-2 p-2.5 rounded-lg mb-3
          ${alert.status === 'tormenta' ? 'bg-red-500/20 border border-red-500/30' :
            alert.status === 'precaution' ? 'bg-amber-500/20 border border-amber-500/30' :
            'bg-green-500/20 border border-green-500/30'}
        `}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-white" />
          <p className="text-xs text-white font-medium">{alert.label}</p>
        </div>

        {/* Botón Bitácora */}
        <button
          onClick={onAuditOpen}
          className="
            w-full flex items-center justify-center gap-2
            px-3 py-2 rounded-lg
            bg-white/15 hover:bg-white/25
            border border-white/20 hover:border-white/40
            text-white text-xs font-semibold
            transition-all duration-200
          "
        >
          <span>📊 Bitácora</span>
        </button>
      </div>
    </div>
  );
}
