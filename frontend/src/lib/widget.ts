import { NativeModules, Platform } from "react-native";

export type WidgetRow = { label: string; time: string; timestamp: number };

/**
 * Pushes ready-to-display prayer time strings to the home screen widget.
 * Deliberately takes already-formatted display strings (not raw timetable
 * data) — all prayer-time calculation logic stays in JS where it's already
 * tested. Each row also carries a real timestamp so the native widget can
 * recompute "next prayer" on its own between app opens (e.g. on Android's
 * periodic ~30min widget refresh), instead of going stale once the
 * originally-pushed "next" prayer's time passes.
 */
export function updateWidget(
  nextLabel: string,
  nextTime: string,
  nextTimestamp: number,
  rows: WidgetRow[],
  nextIndex: number,
  style: "arc" | "grid",
  tomorrowFajrTimestamp: number,
): void {
  if (Platform.OS !== "android") return;
  const payload = {
    nextLabel,
    nextTime,
    nextTimestamp,
    rows,
    nextIndex,
    style,
    tomorrowFajrTimestamp,
  };
  try {
    NativeModules.WidgetModule?.updateWidgetData(JSON.stringify(payload));
  } catch {}
}
