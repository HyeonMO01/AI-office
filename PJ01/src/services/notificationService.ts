import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DAILY_NOTIF_ID_KEY = "@fizzylush/daily_notif_id";
const NOTIF_PREFS_KEY = "@fizzylush/notif_prefs";

export interface NotifPrefs {
  dailyOutfit: boolean;
  recommendations: boolean;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "fizzylush",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  await setupAndroidChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function loadNotifPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    if (raw) return JSON.parse(raw) as NotifPrefs;
  } catch { /* ignore */ }
  return { dailyOutfit: false, recommendations: false };
}

export async function saveNotifPrefs(prefs: NotifPrefs): Promise<void> {
  await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
}

export async function scheduleDailyOutfitNotification(enabled: boolean): Promise<void> {
  const existingId = await AsyncStorage.getItem(DAILY_NOTIF_ID_KEY).catch(() => null);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
    await AsyncStorage.removeItem(DAILY_NOTIF_ID_KEY).catch(() => {});
  }
  if (!enabled) return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "오늘의 AI 코디 추천 ✨",
      body: "오늘 뭐 입을지 고민돼요? 맞춤 코디가 준비됐어요!",
      data: { screen: "Home" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 8,
      minute: 0,
    },
  });
  await AsyncStorage.setItem(DAILY_NOTIF_ID_KEY, id);
}

export async function sendLocalNotification(title: string, body: string): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}
