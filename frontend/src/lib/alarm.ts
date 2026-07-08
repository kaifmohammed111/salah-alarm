import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
// Built-in sounds get their own native channel with a bundled raw resource,
// so playback follows the Notification volume slider (Android's guaranteed
// behavior for channel sounds). Custom uploaded sounds keep using JS playback
// via expo-audio, which follows Media volume — see SOUND_SOURCES in
// alarm-ring.tsx and the warning text in AlarmSettingsSheet.
const SOUND_CHANNELS: Record<string, string> = {
  beep: "prayer-alarm-beep",
  short_adhan: "prayer-alarm-short_adhan",
  full_adhan: "prayer-alarm-full_adhan",
  custom: "prayer-alarm-custom",
};
const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 7; // schedule this many days ahead
const MAX_SCHEDULED = 60; // stay under the OS pending-alarm limit
const PENDING_ALARM_KEY = "pending-alarm-data";

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
    const base = {
      importance: m.AndroidImportance.HIGH,
      visibility: m.AndroidVisibility.PUBLIC,
      vibration: true,
      vibrationPattern: [300, 500, 300, 500],
      bypassDnd: true,
    };
    // Built-in sounds: each channel references a bundled native raw resource
    // (see plugins/withAlarmSounds.js), so playback follows Notification volume.
    await m.default.createChannel({
      id: SOUND_CHANNELS.beep,
      name: "Prayer Alarms (Beep)",
      sound: "beep",
      ...base,
    });
    await m.default.createChannel({
      id: SOUND_CHANNELS.short_adhan,
      name: "Prayer Alarms (Short Adhan)",
      sound: "short_adhan",
      ...base,
    });
    await m.default.createChannel({
      id: SOUND_CHANNELS.full_adhan,
      name: "Prayer Alarms (Full Adhan)",
      sound: "full_adhan",
      ...base,
    });
    // Custom uploaded sounds: no native channel sound — played via JS in the
    // ring screen instead, since the sound file isn't a bundled native resource.
    await m.default.createChannel({
      id: SOUND_CHANNELS.custom,
      name: "Prayer Alarms (Custom)",
      ...base,
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

// Prompts the user to exempt this app from Android's battery/Doze optimization.
// Without this, many OEMs (notably Vivo, Oppo, Xiaomi) freeze the app in the
// background and delay or drop scheduled alarms entirely until the app is
// manually reopened. Only prompts once per install — safe to call on every
// app launch.
const BATTERY_PROMPT_KEY = "battery-optimization-prompted";
export async function requestBatteryOptimizationExemption(force = false): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    if (!force) {
      const already = await AsyncStorage.getItem(BATTERY_PROMPT_KEY);
      if (already) {
        console.log("BATTERY EXEMPTION: already prompted, skipping");
        return;
      }
      await AsyncStorage.setItem(BATTERY_PROMPT_KEY, "1");
    }
    const IntentLauncher = require("expo-intent-launcher");
    console.log("BATTERY EXEMPTION: launching intent, force =", force);
    try {
      const result = await IntentLauncher.startActivityAsync(
        "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
        { data: "package:com.emergent.salahalarm.lxw9zs" },
      );
      console.log("BATTERY EXEMPTION: intent result", JSON.stringify(result));
    } catch (innerErr) {
      // Some OEMs block the direct per-app intent. Fall back to the general
      // battery optimization list, where the user can find and allow the app.
      console.log("BATTERY EXEMPTION: direct intent failed, trying fallback", innerErr);
      await IntentLauncher.startActivityAsync(
        "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
      );
    }
  } catch (e) {
    console.warn("requestBatteryOptimizationExemption failed", e);
  }
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
            channelId: SOUND_CHANNELS[j.sound] || SOUND_CHANNELS.custom,
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
// return the alarm payload so we can route to the ring screen. Falls back to a
// value persisted by the background handler, since getInitialNotification() is
// unreliable on some Android OEMs (notably when launched via fullScreenAction
// rather than a direct notification press).
export async function getLaunchAlarm(): Promise<AlarmData | null> {
  const m = nf();
  if (!m) return null;
  try {
    const initial = await m.default.getInitialNotification();
    const d = initial?.notification?.data;
    if (d?.type === "alarm") {
      await AsyncStorage.removeItem(PENDING_ALARM_KEY);
      return d as AlarmData;
    }
  } catch {}

  // Fallback: check for data persisted by the background/delivery handler.
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALARM_KEY);
    if (raw) {
      await AsyncStorage.removeItem(PENDING_ALARM_KEY);
      const parsed = JSON.parse(raw);
      if (parsed?.type === "alarm") return parsed as AlarmData;
    }
  } catch {}

  return null;
}

// Fires while the app is already open and an alarm is delivered/pressed.
export function registerForegroundAlarmHandler(onAlarm: (data: AlarmData) => void): () => void {
  const m = nf();
  if (!m) return () => {};
  const notifee = m.default;
  const { EventType } = m;
  return notifee.onForegroundEvent((event: any) => {
    console.log("FOREGROUND EVENT RAW:", JSON.stringify(event));
    const { type, detail } = event;
    const d = detail?.notification?.data;
    if ((type === EventType.PRESS || type === EventType.DELIVERED) && d?.type === "alarm") {
      onAlarm(d as AlarmData);
    }
  });
}

// Must be registered once at module load so Notifee has a background handler.
// Persists the alarm payload to AsyncStorage on delivery so getLaunchAlarm()
// can recover it even if getInitialNotification() fails to populate.
export function registerBackgroundAlarmHandler(): void {
  const m = nf();
  if (!m) return;
  const notifee = m.default;
  const { EventType } = m;
  notifee.onBackgroundEvent(async (event: any) => {
    console.log("BACKGROUND EVENT RAW:", JSON.stringify(event));
    try {
      const { type, detail } = event;
      const d = detail?.notification?.data;
      if (
        (type === EventType.DELIVERED || type === EventType.PRESS) &&
        d?.type === "alarm"
      ) {
        await AsyncStorage.setItem(PENDING_ALARM_KEY, JSON.stringify(d));
        console.log("BACKGROUND EVENT: wrote pending alarm to storage");
      }
    } catch (e) {
      console.log("BACKGROUND EVENT ERROR:", e);
    }
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

// Must be called whenever the ring screen is dismissed, regardless of which
// path routed there (foreground event vs. AsyncStorage fallback). Without
// this, a stale entry can sit in storage and get picked up again by the next
// app-resume check, routing straight back to the ring screen and fighting
// the user's own dismiss action in a loop.
export async function clearPendingAlarm(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_ALARM_KEY);
  } catch {}
}
