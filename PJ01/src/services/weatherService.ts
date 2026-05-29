import * as Location from "expo-location";
import { proxyGet } from "./apiProxy";

export interface WeatherData {
  temp: number;
  description: string;
  icon: string;
  city: string;
}

export async function getCurrentWeather(): Promise<WeatherData> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("위치 권한이 필요합니다.");
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low,
  });

  const data = await proxyGet<{
    main?: { temp?: number };
    weather?: Array<{ description?: string; icon?: string }>;
    name?: string;
  }>(`/api/weather/current?lat=${location.coords.latitude}&lon=${location.coords.longitude}`);

  return {
    temp: Math.round(data.main?.temp ?? 0),
    description: data.weather?.[0]?.description ?? "알 수 없음",
    icon: data.weather?.[0]?.icon ?? "01d",
    city: data.name ?? "",
  };
}

export function getWeatherEmoji(description: string): string {
  if (description.includes("rain") || description.includes("비")) return "🌧";
  if (description.includes("snow") || description.includes("눈")) return "❄️";
  if (description.includes("cloud") || description.includes("구름")) return "☁️";
  if (description.includes("clear") || description.includes("맑")) return "☀️";
  return "🌤";
}

export function getWeatherCategory(temp: number): string {
  if (temp <= 5) return "추움";
  if (temp <= 15) return "선선함";
  if (temp <= 25) return "따뜻함";
  return "더움";
}
