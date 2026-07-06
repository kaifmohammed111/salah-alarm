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
  scheduleAlarms,
  setupAlarms,
} from "@/src/lib/alarm";
import { QUOTES } from "@/src/lib/quotes";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type ThemeMode = "light" | "dark" | "system";

export type Settings = {
  is24h: boolean;
  themeMode: ThemeMode;
  asrMethod: "hanafi" | "shafi";
  showSunrise: boolean;
  preAlarmAnchor: "start" | "jamaat";
};

const DEFAULT_SETTINGS: Settings = {
  is24h: false,
  themeMode: "system",
  asrMethod: "hanafi",
  showSunrise: true,
  preAlarmAnchor: "jamaat",
};

function defaultConfigs(): Record<PrayerKey, AlarmConfig> {
  const c = {} as Record<PrayerKey, AlarmConfig>;
  PRAYER_ORDER.forEach((k) => (c[k] = defaultAlarmConfig(k)));
  return c;
}

type AppState = {
  ready: boolean;
  now: Date;
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
  runOcr: (base64: string) => Promise<Timetable>;
  runOcrPdf: (base64: string) => Promise<Timetable>;
  clearTimetable: () => Promise<void>;
  reschedule: () => Promise<number>;
  exportBackup: () => string;
  importBackup: (json: string) => Promise<boolean>;
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
  const [now, setNow] = useState(new Date());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [configs, setConfigs] = useState<Record<PrayerKey, AlarmConfig>>(defaultConfigs());
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());
  const [quoteStartIndex, setQuoteStartIndex] = useState(0);

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
        if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
      } catch {}
      try {
        if (tt) setTimetable(JSON.parse(tt));
      } catch {}
      try {
        if (cf) setConfigs({ ...defaultConfigs(), ...JSON.parse(cf) });
      } catch {}
      await requestAlarmPermissions();
      setReady(true);
    })();
  }, []);

  // Ticking clock (1s).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
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
    () => findTodayRow(timetable, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timetable, now.getDate()],
  );

  const needsNextMonth = useMemo(() => {
    if (!timetable) return false;
    return !todayRow;
  }, [timetable, todayRow]);

  const rescheduleRef = useRef<any>(null);
  const reschedule = useCallback(async () => {
    return scheduleAlarms(timetable, configs, settings.showSunrise, settings.preAlarmAnchor);
  }, [timetable, configs, settings.showSunrise, settings.preAlarmAnchor]);
  rescheduleRef.current = reschedule;

  // Reschedule whenever inputs change (and daily, as the horizon rolls forward).
  useEffect(() => {
    if (!ready) return;
    scheduleAlarms(timetable, configs, settings.showSunrise, settings.preAlarmAnchor);
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

  const runOcr = async (base64: string): Promise<Timetable> => {
    const res = await fetch(`${BACKEND_URL}/api/ocr/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: base64 }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `OCR failed (${res.status})`);
    }
    const data = await res.json();
    return { id: data.id, month: data.month, year: data.year, rows: data.rows || [] };
  };

  const runOcrPdf = async (base64: string): Promise<Timetable> => {
    const res = await fetch(`${BACKEND_URL}/api/ocr/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_base64: base64 }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `PDF OCR failed (${res.status})`);
    }
    const data = await res.json();
    return { id: data.id, month: data.month, year: data.year, rows: data.rows || [] };
  };

  const exportBackup = () =>
    JSON.stringify({ settings, timetable, configs, version: 1 });

  const importBackup = async (json: string): Promise<boolean> => {
    try {
      const parsed = JSON.parse(json);
      if (parsed.settings) persistSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
      if (parsed.configs) {
        const merged = { ...defaultConfigs(), ...parsed.configs };
        setConfigs(merged);
        await storage.setItem(K_CONFIGS, JSON.stringify(merged));
      }
      if (parsed.timetable) await saveTimetable(parsed.timetable);
      return true;
    } catch {
      return false;
    }
  };

  const value: AppState = {
    ready,
    now,
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
    runOcr,
    runOcrPdf,
    clearTimetable,
    reschedule,
    exportBackup,
    importBackup,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
