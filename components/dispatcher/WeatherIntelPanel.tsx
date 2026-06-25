'use client';

import { useState } from 'react';
import { Cloud, CloudRain, Sun, Wind, Droplets, Eye, Gauge, Thermometer, X } from 'lucide-react';
import type { WeatherData, HourlyForecast } from '@/lib/weather';

interface Props {
  weather: WeatherData;
  forecast?: HourlyForecast[];
}

function getWindDirection(deg: number): string {
  const dirs = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
  const short = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const idx = Math.round(deg / 45) % 8;
  return `${short[idx]} (${dirs[idx]})`;
}

function getWindShort(deg: number): string {
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

const NAV_BTN = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  background: 'transparent',
  border: '1px solid #112040',
  borderRadius: 6,
  color: '#5B7BA0',
  fontSize: 11,
  fontFamily: "'Exo 2', sans-serif",
  cursor: 'pointer',
  transition: 'all 0.2s',
} as const;

export default function WeatherIntelPanel({ weather, forecast = [] }: Props) {
  const [open, setOpen] = useState(false);

  const hasAlert  = weather.alerts.length > 0;
  const isRaining = weather.description.toLowerCase().includes('lluv') ||
                    weather.description.toLowerCase().includes('torment');
  const alertColor = hasAlert ? '#ef4444' : isRaining ? '#f59e0b' : '#22c55e';
  const AlertIcon  = hasAlert || isRaining ? CloudRain : weather.clouds > 60 ? Cloud : Sun;

  const datos = [
    {
      icon: <Thermometer size={12} />,
      label: 'Sensación',
      value: `${weather.feelsLike}°C`,
      tooltip: 'Temperatura que siente el cuerpo considerando humedad y viento (sensación térmica)',
    },
    {
      icon: <Droplets size={12} />,
      label: 'Humedad',
      value: `${weather.humidity}%`,
      tooltip: 'Porcentaje de humedad relativa del aire. >80% puede afectar la comodidad del conductor',
    },
    {
      icon: <Wind size={12} />,
      label: 'Viento',
      value: `${weather.windSpeed} km/h ${getWindShort(weather.windDeg)}`,
      tooltip: `Velocidad del viento: ${weather.windSpeed} km/h. Dirección: ${getWindDirection(weather.windDeg)}. Vientos >50 km/h pueden dificultar la conducción`,
    },
    {
      icon: <Gauge size={12} />,
      label: 'Presión',
      value: `${weather.pressure} hPa`,
      tooltip: 'Presión atmosférica en hectopascales. Valores normales: 1000-1025 hPa. Cambios bruscos indican frentes meteorológicos',
    },
    {
      icon: <Eye size={12} />,
      label: 'Visibilidad',
      value: `${(weather.visibility / 1000).toFixed(1)} km`,
      tooltip: `Distancia máxima visible: ${(weather.visibility / 1000).toFixed(1)} km. Menos de 1 km es niebla densa — peligroso para rutas`,
    },
    {
      icon: <Cloud size={12} />,
      label: 'Nubosidad',
      value: `${weather.clouds}%`,
      tooltip: `${weather.clouds}% del cielo cubierto por nubes. 0% = despejado, 100% = completamente nublado`,
    },
    ...(weather.rain1h !== undefined
      ? [{
          icon: <CloudRain size={12} />,
          label: 'Lluvia 1h',
          value: `${weather.rain1h} mm`,
          tooltip: `Precipitación acumulada en la última hora: ${weather.rain1h} mm. >10 mm/h se considera lluvia intensa`,
        }]
      : []),
  ];

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Botón header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Ver condiciones climáticas para rutas de entrega"
        style={{
          ...NAV_BTN,
          background: open ? 'rgba(33,150,243,0.10)' : 'transparent',
          borderColor: open ? '#2196F3' : '#112040',
          color: open ? '#2196F3' : '#5B7BA0',
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
        {hasAlert && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            width: 5, height: 5, borderRadius: '50%',
            background: '#ef4444',
            boxShadow: '0 0 5px #ef4444',
            animation: 'pulse-dot 1.5s ease-in-out infinite',
          }} />
        )}
      </button>

      {/* ── Panel expandible ── */}
      {open && (
        <>
          <style>{`
            @keyframes fadeInDown {
              from { opacity:0; transform:translateY(-8px); }
              to   { opacity:1; transform:translateY(0); }
            }
            @keyframes pulse-dot {
              0%,100% { opacity:1; transform:scale(1); }
              50%      { opacity:0.4; transform:scale(0.7); }
            }
            .wx-card:hover { background: rgba(255,255,255,0.06) !important; }
            .wx-card { position: relative; }
            .wx-tooltip {
              display: none;
              position: absolute;
              bottom: calc(100% + 6px);
              left: 50%;
              transform: translateX(-50%);
              background: #0d1f3c;
              border: 1px solid rgba(33,150,243,0.3);
              border-radius: 8px;
              padding: 8px 10px;
              font-size: 10px;
              color: #94a3b8;
              width: 200px;
              text-align: center;
              z-index: 1100;
              line-height: 1.4;
              pointer-events: none;
              white-space: normal;
            }
            .wx-card:hover .wx-tooltip { display: block; }
          `}</style>

          <div
            style={{ position: 'fixed', inset: 0, zIndex: 998 }}
            onClick={() => setOpen(false)}
          />

          <div style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 999,
            width: 290,
            background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 100%)',
            border: `1px solid ${alertColor}40`,
            borderRadius: 16,
            boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 30px ${alertColor}20`,
            overflow: 'visible',
            animation: 'fadeInDown 0.2s ease-out',
          }}>

            {/* Header */}
            <div style={{
              padding: '14px 16px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}>
              <div>
                <p style={{ fontSize: 9, color: '#5B7BA0', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Exo 2',sans-serif", margin: 0 }}>
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

            {/* Alerta */}
            {weather.alerts.length > 0 && weather.alerts.map((alert, i) => (
              <div key={i} style={{
                margin: i === 0 ? '10px 12px 0' : '4px 12px 0',
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.25)',
                fontSize: 11,
                color: '#fca5a5',
                lineHeight: 1.4,
              }}>
                {alert}
              </div>
            ))}

            <div style={{ padding: '0 12px 10px' }}>
            
            {forecast.length > 0 && (
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: '10px 12px',
              }}>
                <p style={{
                  fontSize: 9, color: '#5B7BA0', letterSpacing: '0.1em',
                  textTransform: 'uppercase', fontFamily: "'Exo 2', sans-serif",
                  margin: '0 0 8px',
                }}>
                  Pronóstico próximas horas
                </p>
                <div style={{
                  display: 'flex', gap: 6, overflowX: 'auto',
                  paddingBottom: 4,
                }}>
                  {forecast.slice(0, 6).map((f) => {
                    const hour = new Date(f.time * 1000).toLocaleTimeString('es-MX', {
                      timeZone: 'America/Mexico_City',
                      hour: '2-digit', minute: '2-digit', hour12: false,
                    });
                    const hasRain = (f.rain3h || 0) > 0 || f.pop > 0.3;
                    return (
                      <div key={f.time} style={{
                        flexShrink: 0, textAlign: 'center',
                        padding: '6px 8px', borderRadius: 8,
                        background: hasRain
                          ? 'rgba(59,130,246,0.08)'
                          : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${hasRain
                          ? 'rgba(59,130,246,0.2)'
                          : 'rgba(255,255,255,0.04)'}`,
                        minWidth: 46,
                      }}>
                        <p style={{ fontSize: 9, color: '#5B7BA0', margin: 0 }}>{hour}</p>
                        <img
                          src={`https://openweathermap.org/img/wn/${f.icon}.png`}
                          alt={f.description}
                          width={28} height={28}
                          style={{ margin: '2px auto', display: 'block' }}
                        />
                        <p style={{
                          fontSize: 11, fontWeight: 700,
                          color: '#E8EFF8', margin: 0,
                          fontFamily: "'Exo 2', sans-serif",
                        }}>
                          {f.temp}°
                        </p>
                        {f.pop > 0.1 && (
                          <p style={{ fontSize: 9, color: '#60a5fa', margin: '1px 0 0' }}>
                            {Math.round(f.pop * 100)}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              padding: '10px 12px',
            }}>
              {datos.map(({ icon, label, value, tooltip }) => (
                <div
                  key={label}
                  className="wx-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 8px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'default',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{ color: '#5B7BA0', flexShrink: 0 }}>{icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 9, color: '#5B7BA0', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                    <p style={{ fontSize: 11, color: '#e2e8f0', margin: 0, fontWeight: 600 }}>{value}</p>
                  </div>
                  {/* Tooltip */}
                  <div className="wx-tooltip">{tooltip}</div>
                </div>
              ))}
            </div>
            </div>

            {/* Amanecer / Atardecer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-around',
              padding: '8px 12px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              fontSize: 11,
              color: '#94a3b8',
            }}>
              <span title="Hora de amanecer en CDMX">🌅 Amanecer: {formatTime(weather.sunrise)}</span>
              <span title="Hora de atardecer en CDMX">🌇 Atardecer: {formatTime(weather.sunset)}</span>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
