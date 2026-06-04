'use client';

import { useState, useEffect } from 'react';
import type { WeatherData } from '@/lib/weather';

interface Props {
  weather: WeatherData;
}

export default function WeatherBanner({ weather }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedState = localStorage.getItem('weatherBannerExpanded');
    if (savedState) {
      setIsExpanded(savedState === 'true');
    }
  }, []);

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem('weatherBannerExpanded', String(newState));
    
    if (newState) {
      const hasSeenInfo = localStorage.getItem('weatherBannerInfoSeen');
      if (!hasSeenInfo) {
        setShowInfo(true);
        localStorage.setItem('weatherBannerInfoSeen', 'true');
        setTimeout(() => {
          setShowInfo(false);
        }, 3000);
      }
    }
  };

  if (!isMounted) return null;

  // Determinar recomendación basada en el clima
  let recomendacion = 'Conduce con precaución.';
  const isRaining = weather.description.toLowerCase().includes('lluvia') || 
                    weather.description.toLowerCase().includes('llovizna') || 
                    weather.description.toLowerCase().includes('tormenta');
  
  if (isRaining) {
    if (weather.description.toLowerCase().includes('intensa') || weather.description.toLowerCase().includes('tormenta')) {
      recomendacion = 'Lluvia intensa: Evitar pasos a desnivel inundables. Mantener doble distancia de frenado.';
    } else {
      recomendacion = 'Lluvia ligera: Mantener distancia de frenado doble.';
    }
  } else if (weather.windSpeed > 50) {
    recomendacion = 'Viento fuerte: Precaución con carga alta o lonas sueltas.';
  } else if (weather.description.toLowerCase().includes('neblina') || weather.description.toLowerCase().includes('niebla')) {
    recomendacion = 'Neblina: Usar luces bajas, reducir velocidad y aumentar distancia de seguimiento.';
  } else if (weather.windSpeed > 30) {
    recomendacion = 'Viento moderado a fuerte: Cuidado en zonas expuestas.';
  }

  const hasAlerts = weather.alerts.length > 0;

  return (
    <div className="px-4 py-3 border-b border-slate-700/50 shrink-0 bg-slate-800/30">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Clima CDMX</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-white">{weather.temp}°C</span>
            <span className="text-xs text-slate-300 capitalize">{weather.description}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Humedad: {weather.humidity}% · Viento: {weather.windSpeed} km/h
          </div>
        </div>
        <img 
          src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} 
          alt="Clima" 
          className="w-10 h-10 drop-shadow-md"
        />
      </div>

      {hasAlerts && (
        <div className="mt-2 flex items-center justify-between px-2 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
          <p className="text-[11px] font-medium text-yellow-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {weather.alerts[0]}
          </p>
          <button 
            onClick={handleToggle}
            className="text-[10px] font-bold text-yellow-500 hover:text-yellow-400 underline decoration-yellow-500/30 underline-offset-2 transition-colors"
          >
            {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
          </button>
        </div>
      )}

      {isExpanded && hasAlerts && (
        <div className="mt-2 p-3 bg-slate-900/50 rounded-lg border border-slate-700 relative">
          {showInfo && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap animate-fade-in-up">
              ℹ️ El estado del clima se guarda entre sesiones
            </div>
          )}
          
          <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">Detalle de Condiciones</h4>
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div className="bg-slate-800 p-2 rounded">
              <span className="block text-slate-500 mb-0.5">Visibilidad</span>
              <span className="font-medium text-slate-200">Reducida</span>
            </div>
            <div className="bg-slate-800 p-2 rounded">
              <span className="block text-slate-500 mb-0.5">Sensación térmica</span>
              <span className="font-medium text-slate-200">{weather.temp > 0 ? weather.temp - 2 : weather.temp}°C</span>
            </div>
            <div className="bg-slate-800 p-2 rounded">
              <span className="block text-slate-500 mb-0.5">Viento</span>
              <span className="font-medium text-slate-200">{weather.windSpeed} km/h</span>
            </div>
            <div className="bg-slate-800 p-2 rounded">
              <span className="block text-slate-500 mb-0.5">Humedad</span>
              <span className="font-medium text-slate-200">{weather.humidity}%</span>
            </div>
          </div>
          
          <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2">
            <h5 className="text-[10px] font-bold text-blue-400 uppercase mb-1">Recomendación para conductores</h5>
            <p className="text-[11px] text-blue-200/90 leading-relaxed">
              {recomendacion}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
