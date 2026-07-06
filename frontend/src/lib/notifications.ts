import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import {
  AlarmConfig,
  PRAYER_LABELS,
  PRAYER_ORDER,
  PrayerKey,
  TimePair,
  Timetable,
  prayerTime,
  timeToDate,
} from "./prayer";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 7; // schedule this many days ahead so alarms fire even if the app isn't opened
const MAX_SCHEDULED = 60; // stay under the OS pending-notification limit (iOS ~64)

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

// Cancel & (re)schedule prayer notifications across the next several days so
// every enabled prayer (and its optional pre-alarm) rings at its time — even if
// the app isn't reopened daily. Jobs are sorted by time and capped to the OS limit.
export async function scheduleAlarms(
  timetable: Timetable | null,
  configs: Record<PrayerKey, AlarmConfig>,
  showSunrise: boolean,
  preAlarmAnchor: "start" | "jamaat" = "jamaat",
): Promise<number> {
  if (Platform.OS === "web") return 0;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!timetable?.rows?.length) return 0;

    const now = new Date();
    const horizon = now.getTime() + HORIZON_DAYS * DAY_MS;

    type Job = { when: Date; title: string; body: string; vibrate: boolean };
    const jobs: Job[] = [];

    for (const row of timetable.rows) {
      const dom = parseInt((row.date || "").trim(), 10);
      if (!dom) continue;
      // Build the concrete calendar date for this day-of-month in the current month.
      const dayBase = new Date(now.getFullYear(), now.getMonth(), dom);

      for (const key of PRAYER_ORDER) {
        if (key === "sunrise") continue; // sunrise never alarms
        const cfg = configs[key];
        if (!cfg?.enabled) continue;

        // Main alarm at the prayer time.
        const t = timeToDate(prayerTime(row, key), dayBase);
        if (t && t.getTime() > now.getTime() && t.getTime() <= horizon) {
          jobs.push({
            when: t,
            title: `${PRAYER_LABELS[key]} time`,
            body: `It's time for ${PRAYER_LABELS[key]} prayer.`,
            vibrate: !!cfg.vibration,
          });
        }

        // Optional pre-alarm: ring N minutes before the chosen anchor (start / jamaat).
        const minutes = cfg.preAlarmMinutes || 0;
        if (minutes > 0) {
          const pair = row[key] as TimePair;
          const anchorStr = preAlarmAnchor === "jamaat" ? pair?.jamaat : pair?.start;
          const anchorDate = timeToDate(anchorStr || "", dayBase);
          if (anchorDate) {
            const pre = new Date(anchorDate.getTime() - minutes * 60 * 1000);
            if (pre.getTime() > now.getTime() && pre.getTime() <= horizon) {
              jobs.push({
                when: pre,
                title: `${PRAYER_LABELS[key]} in ${minutes} min`,
                body: `${PRAYER_LABELS[key]} ${preAlarmAnchor} is in ${minutes} minutes.`,
                vibrate: !!cfg.vibration,
              });
            }
          }
        }
      }
    }

    jobs.sort((a, b) => a.when.getTime() - b.when.getTime());

    let count = 0;
    for (const j of jobs.slice(0, MAX_SCHEDULED)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: j.title,
          body: j.body,
          sound: "default",
          vibrate: j.vibrate ? [0, 400, 200, 400] : undefined,
          ...(Platform.OS === "android" ? { channelId: "prayer-alarms" } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: j.when },
      });
      count++;
    }
    return count;
  } catch (e) {
    console.warn("scheduleAlarms failed", e);
    return 0;
  }
}
