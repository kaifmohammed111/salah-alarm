import { Platform } from "react-native";

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

const CHANNEL_ID = "prayer-alarm";
const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 7; // schedule this many days ahead
const MAX_SCHEDULED = 60; // stay under the OS pending-alarm limit

// Lazily require Notifee so the web preview / Expo Go don't crash on the native module.
function nf(): any | null {
  if (Platform.OS === "web") return null;
  try {
    return require("@notifee/react-native");
  } catch {
    return null;
  }
}

export type AlarmData = {
  type: "alarm";
  prayer: string;
  label: string;
  sound: string;
  customUri: string;
  pre: string;
};

// Create the high-importance alarm channel. Sound is intentionally omitted — the
// chosen audio is played by the in-app full-screen ring screen so we can support
// custom MP3s, play-once, and stop on hardware buttons.
export async function setupAlarms(): Promise<void> {
  const m = nf();
  if (!m || Platform.OS !== "android") return;
  try {
    await m.default.createChannel({
      id: CHANNEL_ID,
      name: "Prayer Alarms",
      importance: m.AndroidImportance.HIGH,
      visibility: m.AndroidVisibility.PUBLIC,
      vibration: true,
      vibrationPattern: [300, 500, 300, 500],
      bypassDnd: true,
    });
  } catch (e) {
    console.warn("setupAlarms failed", e);
  }
}

export async function requestAlarmPermissions(): Promise<void> {
  const m = nf();
  if (!m) return;
  try {
    await m.default.requestPermission();
  } catch {}
}

// Cancel & (re)schedule exact full-screen alarms for every enabled prayer (and
// its optional pre-alarm) across the next several days.
export async function scheduleAlarms(
  timetable: Timetable | null,
  configs: Record<PrayerKey, AlarmConfig>,
  showSunrise: boolean,
  preAlarmAnchor: "start" | "jamaat" = "jamaat",
): Promise<number> {
  const m = nf();
  if (!m || Platform.OS !== "android") return 0;
  const notifee = m.default;
  const { AndroidImportance, AndroidCategory, AndroidVisibility, TriggerType } = m;

  try {
    const existing = await notifee.getTriggerNotificationIds();
    if (existing?.length) await notifee.cancelTriggerNotifications(existing);
    if (!timetable?.rows?.length) return 0;

    const now = new Date();
    const horizon = now.getTime() + HORIZON_DAYS * DAY_MS;

    type Job = {
      when: Date;
      key: PrayerKey;
      label: string;
      sound: string;
      customUri: string;
      pre: number;
      vibrate: boolean;
    };
    const jobs: Job[] = [];

    for (const row of timetable.rows) {
      const dom = parseInt((row.date || "").trim(), 10);
      if (!dom) continue;
      const dayBase = new Date(now.getFullYear(), now.getMonth(), dom);

      for (const key of PRAYER_ORDER) {
        if (key === "sunrise") continue;
        const cfg = configs[key];
        if (!cfg?.enabled) continue;

        const t = timeToDate(prayerTime(row, key), dayBase);
        if (t && t.getTime() > now.getTime() && t.getTime() <= horizon) {
          jobs.push({
            when: t,
            key,
            label: PRAYER_LABELS[key],
            sound: cfg.sound,
            customUri: cfg.customUri || "",
            pre: 0,
            vibrate: !!cfg.vibration,
          });
        }

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
                key,
                label: PRAYER_LABELS[key],
                sound: cfg.sound,
                customUri: cfg.customUri || "",
                pre: minutes,
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
      const data: AlarmData = {
        type: "alarm",
        prayer: j.key,
        label: j.label,
        sound: j.sound,
        customUri: j.customUri,
        pre: String(j.pre),
      };
      await notifee.createTriggerNotification(
        {
          id: `alarm-${j.key}-${j.pre}-${j.when.getTime()}`,
          title: j.pre > 0 ? `${j.label} in ${j.pre} min` : `${j.label} time`,
          body:
            j.pre > 0
              ? `${j.label} ${preAlarmAnchor} is in ${j.pre} minutes.`
              : `It's time for ${j.label} prayer.`,
          android: {
            channelId: CHANNEL_ID,
            importance: AndroidImportance.HIGH,
            category: AndroidCategory.ALARM,
            visibility: AndroidVisibility.PUBLIC,
            fullScreenAction: { id: "default", launchActivity: "default" },
            pressAction: { id: "default", launchActivity: "default" },
            autoCancel: false,
            vibrationPattern: j.vibrate ? [300, 500, 300, 500] : undefined,
          },
          data: data as any,
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: j.when.getTime(),
          alarmManager: { allowWhileIdle: true },
        },
      );
      count++;
    }
    return count;
  } catch (e) {
    console.warn("scheduleAlarms failed", e);
    return 0;
  }
}

// If the app was launched (or brought forward) by an alarm's full-screen intent,
// return the alarm payload so we can route to the ring screen.
export async function getLaunchAlarm(): Promise<AlarmData | null> {
  const m = nf();
  if (!m) return null;
  try {
    const initial = await m.default.getInitialNotification();
    const d = initial?.notification?.data;
    if (d?.type === "alarm") return d as AlarmData;
  } catch {}
  return null;
}

// Fires while the app is already open and an alarm is delivered/pressed.
export function registerForegroundAlarmHandler(onAlarm: (data: AlarmData) => void): () => void {
  const m = nf();
  if (!m) return () => {};
  const notifee = m.default;
  const { EventType } = m;
  return notifee.onForegroundEvent(({ type, detail }: any) => {
    const d = detail?.notification?.data;
    if ((type === EventType.PRESS || type === EventType.DELIVERED) && d?.type === "alarm") {
      onAlarm(d as AlarmData);
    }
  });
}

// Must be registered once at module load so Notifee has a background handler.
export function registerBackgroundAlarmHandler(): void {
  const m = nf();
  if (!m) return;
  const notifee = m.default;
  notifee.onBackgroundEvent(async () => {
    // The full-screen intent launches the activity; routing is handled on start
    // via getLaunchAlarm(). Nothing else needed here.
  });
}

// Clear a delivered alarm notification once dismissed from the ring screen.
export async function clearAlarmNotifications(): Promise<void> {
  const m = nf();
  if (!m) return;
  try {
    await m.default.cancelDisplayedNotifications();
  } catch {}
}
