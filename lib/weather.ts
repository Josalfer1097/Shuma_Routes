export interface WeatherData {
  temp: number;
  feelsLike: number;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  windDeg: number;
  pressure: number;
  visibility: number;       // metros → mostrar en km
  clouds: number;           // porcentaje de nubosidad
  rain1h?: number;          // mm en última hora (si llueve)
  alerts: string[];
  sunrise: number;          // unix timestamp
  sunset: number;           // unix timestamp
}

export async function getWeatherCDMX(lat: number, lng: number): Promise<WeatherData> {
  const apiKey = (process.env.NEXT_PUBLIC_OWM_API_KEY || '').trim();

  if (!apiKey || apiKey.toLowerCase().includes('tu_api_key') || apiKey.length < 10) {
    return {
      temp: 22, feelsLike: 21, description: 'Cielo despejado', icon: '01d',
      humidity: 40, windSpeed: 10, windDeg: 180, pressure: 1013,
      visibility: 10000, clouds: 5, alerts: [],
      sunrise: Date.now() / 1000 - 21600,
      sunset: Date.now() / 1000 + 21600,
    };
  }

  const url =
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}` +
    `&appid=${apiKey}&units=metric&lang=es`;

  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`OWM ${res.status}`);
    const data = await res.json();

    const windKmH = Math.round((data.wind?.speed || 0) * 3.6);
    const alerts: string[] = [];
    const weatherMain = data.weather[0]?.main || '';
    const weatherDesc = data.weather[0]?.description || '';
    const tempC = Math.round(data.main.temp);
    const rain1h = data.rain?.['1h'] || 0;

    // Alertas específicas con causa y dato concreto
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

    // Alerta de viento independiente
    if (windKmH > 50) {
      alerts.push(`💨 Viento fuerte: ${windKmH} km/h — riesgo de objetos en vía`);
    } else if (windKmH > 30) {
      alerts.push(`🌬️ Viento moderado: ${windKmH} km/h — precaución en autopistas`);
    }

    // Alerta de temperatura extrema
    if (tempC >= 35) {
      alerts.push(`🌡️ Calor extremo: ${tempC}°C — hidratación y descanso para conductores`);
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
  } catch (error) {
    console.error('OWM error:', error);
    return {
      temp: 0, feelsLike: 0, description: 'Sin señal', icon: '01d',
      humidity: 0, windSpeed: 0, windDeg: 0, pressure: 0,
      visibility: 0, clouds: 0, alerts: [],
      sunrise: 0, sunset: 0,
    };
  }
}
