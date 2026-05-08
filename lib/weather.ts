export interface WeatherData {
  temp: number;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  alerts: string[];
}

const OWM_API_KEY = process.env.NEXT_PUBLIC_OWM_API_KEY!;
const LAT = 19.4326;
const LON = -99.1332;

export async function getWeatherCDMX(): Promise<WeatherData> {
  const url = \`https://api.openweathermap.org/data/2.5/weather?lat=\${LAT}&lon=\${LON}&appid=\${OWM_API_KEY}&units=metric&lang=es\`;
  
  try {
    const res = await fetch(url, { next: { revalidate: 600 } }); // Cache for 10 mins
    if (!res.ok) {
      throw new Error('No se pudo obtener el clima');
    }
    
    const data = await res.json();
    const alerts: string[] = [];
    
    const isRaining = data.weather.some((w: any) => w.main === 'Rain' || w.main === 'Drizzle' || w.main === 'Thunderstorm');
    // OpenWeatherMap wind speed is in m/s. 30 km/h is ~8.33 m/s.
    const windKmH = data.wind.speed * 3.6;
    
    if (isRaining || windKmH > 30) {
      alerts.push('⚠️ Condiciones adversas - tome precauciones');
    }

    return {
      temp: Math.round(data.main.temp),
      description: data.weather[0]?.description || 'Desconocido',
      icon: data.weather[0]?.icon || '01d',
      humidity: data.main.humidity,
      windSpeed: Math.round(windKmH),
      alerts,
    };
  } catch (error) {
    console.error('Error fetching weather:', error);
    return {
      temp: 0,
      description: 'Error',
      icon: '01d',
      humidity: 0,
      windSpeed: 0,
      alerts: [],
    };
  }
}
