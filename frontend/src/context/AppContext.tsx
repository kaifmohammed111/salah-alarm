import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Appearance } from "react-native";

import { storage } from "@/src/utils/storage";
import { DARK, LIGHT, ThemeColors } from "@/src/theme";
import {
  AlarmConfig,
  PRAYER_ORDER,
  PrayerKey,
  Timetable,
  defaultAlarmConfig,
  findTodayRow,
} from "@/src/lib/prayer";
import {
  requestAlarmPermissions,
  requestBatteryOptimizationExemption,
  scheduleAlarms,
  setupAlarms,
} from "@/src/lib/alarm";
import { QUOTES } from "@/src/lib/quotes";


type ThemeMode = "light" | "dark" | "system";

// FIX: added four new colorways (ocean/sunset/forest/royal) alongside the
// existing default/nightsky/playful/kids set — see app/alarm-ring.tsx for
// the actual gradient definitions and app/(tabs)/settings.tsx for the
// picker UI.
export type AlarmBackgroundStyle =
  | "default"
  | "nightsky"
  | "playful"
  | "kids"
  | "ocean"
  | "sunset"
  | "forest"
  | "royal";
export type WidgetStyle = "grid" | "clock";

export type Settings = {
  is24h: boolean;
  themeMode: ThemeMode;
  asrMethod: "hanafi" | "shafi";
  showSunrise: boolean;
  preAlarmAnchor: "start" | "jamaat";
  alarmBackground: AlarmBackgroundStyle;
  // Controls what "next prayer" countdown (home screen + widget) counts
  // down to. Deliberately separate from the alarm-scheduling logic, which
  // has its own fixed per-prayer start/jamaat convention and is untouched
  // by this setting.
  countdownAnchor: "start" | "jamaat";
  widgetStyle: WidgetStyle;
  // When on, alarm notifications are non-swipeable (ongoing) with a
  // longer, more insistent vibration pattern — a compensating measure
  // for Android's platform-level restriction on auto-launching the
  // full-screen alarm UI while the phone is actively in use (screen on,
  // user engaged elsewhere), which can't be overridden from app code.
  strongAlarmNotification: boolean;
  // Which madhab's prayer-performance details (hand position, Wudu
  // steps, etc.) to show in the "How to Pray" feature — separate from
  // asrMethod, which only controls Asr's shadow-length calculation, a
  // narrower concept. null means the user hasn't chosen yet, which
  // triggers the one-time "choose your madhab" prompt; once set, it's
  // only changed again via Settings, not re-prompted.
  fiqh: "hanafi" | "shafii" | "maliki" | "hanbali" | null;
};

const DEFAULT_SETTINGS: Settings = {
  is24h: false,
  themeMode: "system",
  asrMethod: "hanafi",
  showSunrise: true,
  preAlarmAnchor: "jamaat",
  alarmBackground: "default",
  countdownAnchor: "jamaat",
  widgetStyle: "grid",
  strongAlarmNotification: false,
  fiqh: null,
};

function defaultConfigs(): Record<PrayerKey, AlarmConfig> {
  const c = {} as Record<PrayerKey, AlarmConfig>;
  PRAYER_ORDER.forEach((k) => (c[k] = defaultAlarmConfig(k)));
  return c;
}

type AppState = {
  ready: boolean;
  colors: ThemeColors;
  isDark: boolean;
  quoteStartIndex: number;
  settings: Settings;
  timetable: Timetable | null;
  configs: Record<PrayerKey, AlarmConfig>;
  todayRow: ReturnType<typeof findTodayRow>;
  needsNextMonth: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  setConfig: (key: PrayerKey, patch: Partial<AlarmConfig>) => void;
  saveTimetable: (tt: Timetable) => Promise<void>;
  clearTimetable: () => Promise<void>;
  reschedule: () => Promise<number>;
};

const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
};

const K_SETTINGS = "salah.settings";
const K_TIMETABLE = "salah.timetable";
const K_CONFIGS = "salah.configs";
const K_QUOTE_IDX = "salah.quoteIndex";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [configs, setConfigs] = useState<Record<PrayerKey, AlarmConfig>>(defaultConfigs());
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());
  const [quoteStartIndex, setQuoteStartIndex] = useState(0);
  // Deliberately NOT subscribed to the fast per-second tick (useNow()) here.
  // todayRow only actually needs to change once a day, at midnight — so we
  // track just the date-of-month locally, refreshed on a slow interval. This
  // keeps AppProvider (and therefore every screen using useApp()) from
  // re-rendering every second, which previously caused visible jank during
  // interactions like dragging the volume slider.
  const [dateOfMonth, setDateOfMonth] = useState(() => new Date().getDate());
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date().getDate();
      setDateOfMonth((prev) => (prev !== d ? d : prev));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Load persisted state.
  useEffect(() => {
    (async () => {
      await setupAlarms();
      const s = await storage.getItem(K_SETTINGS, "");
      const tt = await storage.getItem(K_TIMETABLE, "");
      const cf = await storage.getItem(K_CONFIGS, "");
      // Rotate the hero quote on every app open.
      const prevIdx = (await storage.getItem(K_QUOTE_IDX, -1)) as number;
      const nextIdx = (((prevIdx ?? -1) as number) + 1 + QUOTES.length) % QUOTES.length;
      setQuoteStartIndex(nextIdx);
      await storage.setItem(K_QUOTE_IDX, nextIdx);
      try {
        if (s) {
          const loaded = { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
          // Migration: "arc" was removed as a widget style option — any
          // install that already saved this legacy value falls back to
          // "grid" instead of silently keeping a now-hidden style with no
          // way to change it in Settings.
          if ((loaded.widgetStyle as string) === "arc") {
            loaded.widgetStyle = "grid";
          }
          setSettings(loaded);
        }
      } catch {}
      try {
        if (tt) setTimetable(JSON.parse(tt));
      } catch {}
      try {
        if (cf) setConfigs({ ...defaultConfigs(), ...JSON.parse(cf) });
      } catch {}
      // One-time cleanup: the streak feature was removed after brief
      // testing, but its data key was already written to storage on
      // devices that tried it. Harmless to leave (nothing reads it
      // anymore), but removing it is cheap and tidier. Safe to no-op
      // forever after the first run once the key no longer exists.
      await storage.removeItem("streaks.log");
      await requestAlarmPermissions();
      await requestBatteryOptimizationExemption();
      setReady(true);
    })();
  }, []);

  // System theme listener.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => sub.remove();
  }, []);

  const isDark =
    settings.themeMode === "dark" ||
    (settings.themeMode === "system" && systemScheme === "dark");
  const colors = isDark ? DARK : LIGHT;

  const todayRow = useMemo(
    () => findTodayRow(timetable, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timetable, dateOfMonth],
  );

  const needsNextMonth = useMemo(() => {
    if (!timetable) return false;
    return !todayRow;
  }, [timetable, todayRow]);

  const rescheduleRef = useRef<any>(null);
  const reschedule = useCallback(async () => {
    return scheduleAlarms(timetable, configs, settings.showSunrise, settings.preAlarmAnchor, settings.strongAlarmNotification);
  }, [timetable, configs, settings.showSunrise, settings.preAlarmAnchor]);
  rescheduleRef.current = reschedule;

  // Reschedule whenever inputs change (and daily, as the horizon rolls forward).
  useEffect(() => {
    if (!ready) return;
    scheduleAlarms(timetable, configs, settings.showSunrise, settings.preAlarmAnchor, settings.strongAlarmNotification);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, timetable, configs, settings.showSunrise, settings.preAlarmAnchor, todayRow?.date]);

  const persistSettings = (next: Settings) => {
    setSettings(next);
    storage.setItem(K_SETTINGS, JSON.stringify(next));
  };
  const updateSettings = (patch: Partial<Settings>) =>
    persistSettings({ ...settings, ...patch });

  const setConfig = (key: PrayerKey, patch: Partial<AlarmConfig>) => {
    setConfigs((prev) => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      storage.setItem(K_CONFIGS, JSON.stringify(next));
      return next;
    });
  };

  const saveTimetable = async (tt: Timetable) => {
    setTimetable(tt);
    await storage.setItem(K_TIMETABLE, JSON.stringify(tt));
  };

  const clearTimetable = async () => {
    setTimetable(null);
    await storage.removeItem(K_TIMETABLE);
  };

  const value: AppState = {
    ready,
    colors,
    isDark,
    quoteStartIndex,
    settings,
    timetable,
    configs,
    todayRow,
    needsNextMonth,
    updateSettings,
    setConfig,
    saveTimetable,
    clearTimetable,
    reschedule,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
