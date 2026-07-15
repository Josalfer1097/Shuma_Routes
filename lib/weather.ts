export interface HourlyForecast {
  time: number;       // unix timestamp
  temp: number;
  description: string;
  icon: string;
  rain3h?: number;    // mm en 3 horas
  pop: number;        // probabilidad de precipitación 0-1
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
  visibility: number;       // metros → mostrar en km
  clouds: number;           // porcentaje de nubosidad
  rain1h?: number;          // mm en última hora (si llueve)
  alerts: string[];
  sunrise: number;          // unix timestamp
  sunset: number;           // unix timestamp
}

export async function getWeatherCDMX(lat: number, lng: number): Promise<WeatherData> {
  try {
    const res = await fetch(`/api/weather?type=current&lat=${lat}&lng=${lng}`);
    const json = await res.json();
    if (json.ok && json.data) return json.data as WeatherData;
    throw new Error('Respuesta inválida de /api/weather');
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

export async function getForecastCDMX(
  lat: number,
  lng: number
): Promise<HourlyForecast[]> {
  try {
    const res = await fetch(`/api/weather?type=forecast&lat=${lat}&lng=${lng}`);
    const json = await res.json();
    if (json.ok && json.data) return json.data as HourlyForecast[];
    return [];
  } catch {
    return [];
  }
}
