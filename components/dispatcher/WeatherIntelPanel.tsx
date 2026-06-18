'use client';

import { useState } from 'react';
import { Cloud, CloudRain, Sun, Wind, Droplets, Eye, Gauge, Thermometer, X } from 'lucide-react';
import type { WeatherData } from '@/lib/weather';

interface Props {
  weather: WeatherData;
  onAuditOpen: () => void;
}

function getWindDirection(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}

function formatTime(unix: number): string {
  if (!unix) return '--:--';
  return new Date(unix * 1000).toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function WeatherIntelPanel({ weather, onAuditOpen }: Props) {
  const [open, setOpen] = useState(false);

  const hasAlert   = weather.alerts.length > 0;
  const isRaining  = weather.description.toLowerCase().includes('lluv') ||
                     weather.description.toLowerCase().includes('torment');
  const alertColor = hasAlert  ? '#ef4444' :
                     isRaining ? '#f59e0b' : '#22c55e';
  const AlertIcon  = hasAlert || isRaining ? CloudRain : weather.clouds > 60 ? Cloud : Sun;

  // ── Botón header (siempre visible) ──────────────────────────────────────
  const headerBtn = (
    <button
      onClick={() => setOpen(o => !o)}
      title="Inteligencia Climática"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        background: open ? 'rgba(33,150,243,0.10)' : 'transparent',
        border: `1px solid ${open ? '#2196F3' : '#112040'}`,
        borderRadius: 6,
        color: open ? '#2196F3' : '#5B7BA0',
        fontSize: 11,
        fontFamily: "'Exo 2', sans-serif",
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#2196F3';
        e.currentTarget.style.color = '#2196F3';
        e.currentTarget.style.background = 'rgba(33,150,243,0.06)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = open ? '#2196F3' : '#112040';
        e.currentTarget.style.color = open ? '#2196F3' : '#5B7BA0';
        e.currentTarget.style.background = open ? 'rgba(33,150,243,0.10)' : 'transparent';
      }}
    >
      <AlertIcon size={14} />
      <span className="hidden-mobile">{weather.temp}°C</span>
      {/* Dot de alerta */}
      {hasAlert && (
        <span style={{
          position: 'absolute', top: 3, right: 3,
          width: 6, height: 6, borderRadius: '50%',
          background: '#ef4444',
          boxShadow: '0 0 6px #ef4444',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      )}
    </button>
  );

  // ── Panel expandible ─────────────────────────────────────────────────────
  const panel = open && (
    <>
      {/* Overlay para cerrar */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 998 }}
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        left: 0,
        zIndex: 999,
        width: 280,
        background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 100%)',
        border: `1px solid ${alertColor}40`,
        borderRadius: 16,
        boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 30px ${alertColor}20`,
        overflow: 'hidden',
        animation: 'fadeInDown 0.2s ease-out',
      }}>
        <style>{`
          @keyframes fadeInDown {
            from { opacity: 0; transform: translateY(-8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50%  { opacity: 0.4; }
          }
        `}</style>

        {/* Header del panel */}
        <div style={{
          padding: '14px 16px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div>
            <p style={{ fontSize: 9, color: '#5B7BA0', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Exo 2', sans-serif", margin: 0 }}>
              INTELIGENCIA CLIMÁTICA · CDMX
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{weather.temp}°</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>C</span>
            </div>
            <p style={{ fontSize: 12, color: '#cbd5e1', margin: '2px 0 0', textTransform: 'capitalize' }}>{weather.description}</p>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B7BA0', padding: 4 }}>
            <X size={14} />
          </button>
        </div>

        {/* Alerta si la hay */}
        {hasAlert && (
          <div style={{
            margin: '10px 12px 0',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            fontSize: 11,
            color: '#fca5a5',
          }}>
            {weather.alerts[0]}
          </div>
        )}

        {/* Grid de datos */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1,
          padding: '10px 12px',
        }}>
          {[
            { icon: <Thermometer size={12} />, label: 'Sensación',  value: `${weather.feelsLike}°C` },
            { icon: <Droplets size={12} />,   label: 'Humedad',    value: `${weather.humidity}%` },
            { icon: <Wind size={12} />,        label: 'Viento',     value: `${weather.windSpeed} km/h ${getWindDirection(weather.windDeg)}` },
            { icon: <Gauge size={12} />,       label: 'Presión',    value: `${weather.pressure} hPa` },
            { icon: <Eye size={12} />,         label: 'Visibilidad', value: `${(weather.visibility / 1000).toFixed(1)} km` },
            { icon: <Cloud size={12} />,       label: 'Nubosidad',  value: `${weather.clouds}%` },
            ...(weather.rain1h !== undefined
              ? [{ icon: <CloudRain size={12} />, label: 'Lluvia 1h', value: `${weather.rain1h} mm` }]
              : []),
          ].map(({ icon, label, value }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
            }}>
              <span style={{ color: '#5B7BA0' }}>{icon}</span>
              <div>
                <p style={{ fontSize: 9, color: '#5B7BA0', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                <p style={{ fontSize: 11, color: '#e2e8f0', margin: 0, fontWeight: 600 }}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Amanecer/Atardecer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          padding: '8px 12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 11,
          color: '#94a3b8',
        }}>
          <span>🌅 {formatTime(weather.sunrise)}</span>
          <span>🌇 {formatTime(weather.sunset)}</span>
        </div>

        {/* Botón Bitácora */}
        <div style={{ padding: '0 12px 12px' }}>
          <button
            onClick={() => { setOpen(false); onAuditOpen(); }}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 8,
              background: 'rgba(33,150,243,0.12)',
              border: '1px solid rgba(33,150,243,0.25)',
              color: '#60a5fa',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.2s',
              fontFamily: "'Exo 2', sans-serif",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(33,150,243,0.22)';
              e.currentTarget.style.borderColor = 'rgba(33,150,243,0.5)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(33,150,243,0.12)';
              e.currentTarget.style.borderColor = 'rgba(33,150,243,0.25)';
            }}
          >
            📊 Abrir Bitácora
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ position: 'relative' }}>
      {headerBtn}
      {panel}
    </div>
  );
}
