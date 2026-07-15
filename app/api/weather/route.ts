import { NextRequest, NextResponse } from 'next/server';

export interface HourlyForecast {
  time: number;
  temp: number;
  description: string;
  icon: string;
  rain3h?: number;
  pop: number;
}

export interface WeatherData {
  temp: number;
  feelsLike: number;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  windDeg: number;
  pressure: number;
  visibility: number;
  clouds: number;
  rain1h?: number;
  alerts: string[];
  sunrise: number;
  sunset: number;
}

function fallbackWeather(): WeatherData {
  return {
    temp: 22, feelsLike: 21, description: 'Cielo despejado', icon: '01d',
    humidity: 40, windSpeed: 10, windDeg: 180, pressure: 1013,
    visibility: 10000, clouds: 5, alerts: [],
    sunrise: Date.now() / 1000 - 21600,
    sunset: Date.now() / 1000 + 21600,
  };
}

async function fetchCurrent(lat: string, lng: string, apiKey: string): Promise<WeatherData> {
  const url =
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}` +
    `&appid=${apiKey}&units=metric&lang=es`;

  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`OWM ${res.status}`);
  const data = await res.json();

  const windKmH = Math.round((data.wind?.speed || 0) * 3.6);
  const alerts: string[] = [];
  const weatherMain = data.weather[0]?.main || '';
  const weatherDesc = data.weather[0]?.description || '';
  const tempC = Math.round(data.main.temp);
  const rain1h = data.rain?.['1h'] || 0;

  if (weatherMain === 'Thunderstorm') {
    alerts.push(`⛈️ Tormenta eléctrica detectada — suspender rutas externas`);
  } else if (weatherMain === 'Rain' && rain1h > 10) {
    alerts.push(`🌧️ Lluvia intensa: ${rain1h} mm/h — visibilidad reducida, precaución en vialidades`);
  } else if (weatherMain === 'Rain') {
    alerts.push(`🌦️ Lluvia ligera: ${rain1h > 0 ? rain1h + ' mm/h' : weatherDesc} — pavimento mojado`);
  } else if (weatherMain === 'Drizzle') {
    alerts.push(`🌂 Llovizna — condiciones resbaladizas en calles`);
  } else if (weatherMain === 'Snow') {
    alerts.push(`🌨️ Nevadas detectadas — rutas severamente afectadas`);
  } else if (weatherMain === 'Fog' || weatherMain === 'Mist') {
    alerts.push(`🌫️ Neblina — visibilidad ${(data.visibility / 1000).toFixed(1)} km, reduzca velocidad`);
  } else if (weatherMain === 'Dust' || weatherMain === 'Sand') {
    alerts.push(`💨 Tolvanera — visibilidad reducida, cerrar ventanas`);
  }

  if (windKmH > 50) {
    alerts.push(`💨 Viento fuerte: ${windKmH} km/h — riesgo de objetos en vía`);
  } else if (windKmH > 30) {
    alerts.push(`🌬️ Viento moderado: ${windKmH} km/h — precaución en autopistas`);
  }

  if (tempC >= 35) {
    alerts.push(`🔥 Calor extremo: ${tempC}°C — hidratación frecuente para conductores, evitar exposición prolongada`);
  } else if (tempC <= 4) {
    alerts.push(`🥶 Temperatura baja: ${tempC}°C — riesgo de hielo en carretera`);
  }

  return {
    temp: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    description: data.weather?.[0]?.description || 'Sin datos',
    icon: data.weather?.[0]?.icon || '01d',
    humidity: data.main.humidity,
    windSpeed: windKmH,
    windDeg: data.wind?.deg || 0,
    pressure: data.main.pressure,
    visibility: data.visibility || 10000,
    clouds: data.clouds?.all || 0,
    rain1h: data.rain?.['1h'],
    alerts,
    sunrise: data.sys?.sunrise || 0,
    sunset: data.sys?.sunset || 0,
  };
}

async function fetchForecast(lat: string, lng: string, apiKey: string): Promise<HourlyForecast[]> {
  const url =
    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}` +
    `&appid=${apiKey}&units=metric&lang=es&cnt=8`;

  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) return [];
  const data = await res.json();

  return (data.list || []).map((item: any) => ({
    time:        item.dt,
    temp:        Math.round(item.main.temp),
    description: item.weather?.[0]?.description || '',
    icon:        item.weather?.[0]?.icon || '01d',
    rain3h:      item.rain?.['3h'],
    pop:         item.pop || 0,
  }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat  = searchParams.get('lat');
  const lng  = searchParams.get('lng');
  const type = searchParams.get('type') || 'current';

  const apiKey = (process.env.OWM_API_KEY || '').trim();

  if (!lat || !lng) {
    return NextResponse.json({ ok: false, error: 'Faltan lat/lng' }, { status: 400 });
  }

  if (!apiKey || apiKey.toLowerCase().includes('tu_api_key') || apiKey.length < 10) {
    return NextResponse.json({
      ok: true,
      data: type === 'forecast' ? [] : fallbackWeather(),
    });
  }

  try {
    if (type === 'forecast') {
      const forecast = await fetchForecast(lat, lng, apiKey);
      return NextResponse.json({ ok: true, data: forecast });
    }
    const current = await fetchCurrent(lat, lng, apiKey);
    return NextResponse.json({ ok: true, data: current });
  } catch (err) {
    console.error('[api/weather] error:', err);
    if (type === 'forecast') return NextResponse.json({ ok: true, data: [] });
    return NextResponse.json({
      ok: true,
      data: {
        temp: 0, feelsLike: 0, description: 'Sin señal', icon: '01d',
        humidity: 0, windSpeed: 0, windDeg: 0, pressure: 0,
        visibility: 0, clouds: 0, alerts: [],
        sunrise: 0, sunset: 0,
      },
    });
  }
}
