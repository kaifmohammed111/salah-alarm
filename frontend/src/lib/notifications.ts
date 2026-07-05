import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import {
  AlarmConfig,
  DayRow,
  PRAYER_LABELS,
  PRAYER_ORDER,
  PrayerKey,
  prayerTime,
  timeToDate,
} from "./prayer";

let handlerSet = false;

export function initNotifications() {
  if (handlerSet || Platform.OS === "web") return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return true;
    const req = await Notifications.requestPermissionsAsync();
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("prayer-alarms", {
        name: "Prayer Alarms",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 400, 200, 400],
        bypassDnd: true,
      });
    }
    return req.status === "granted";
  } catch {
    return false;
  }
}

// Cancel & reschedule all prayer notifications for today's row.
export async function scheduleTodayAlarms(
  row: DayRow | null,
  configs: Record<PrayerKey, AlarmConfig>,
  showSunrise: boolean,
): Promise<number> {
  if (Platform.OS === "web") return 0;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!row) return 0;
    const now = new Date();
    let count = 0;

    for (const key of PRAYER_ORDER) {
      if (key === "sunrise") continue; // sunrise never alarms
      const cfg = configs[key];
      if (!cfg?.enabled) continue;
      const t = timeToDate(prayerTime(row, key), now);
      if (!t || t.getTime() <= now.getTime()) continue;

      // Main alarm at prayer time.
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${PRAYER_LABELS[key]} time`,
          body: `It's time for ${PRAYER_LABELS[key]} prayer.`,
          sound: "default",
          vibrate: cfg.vibration ? [0, 400, 200, 400] : undefined,
          ...(Platform.OS === "android" ? { channelId: "prayer-alarms" } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: t },
      });
      count++;

      // Optional 30-min pre-alarm reminder.
      if (cfg.preAlarm) {
        const pre = new Date(t.getTime() - 30 * 60 * 1000);
        if (pre.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${PRAYER_LABELS[key]} in 30 minutes`,
              body: `${PRAYER_LABELS[key]} prayer is coming up soon.`,
              sound: "default",
              ...(Platform.OS === "android" ? { channelId: "prayer-alarms" } : {}),
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: pre },
          });
          count++;
        }
      }
    }
    return count;
  } catch (e) {
    console.warn("scheduleTodayAlarms failed", e);
    return 0;
  }
}
