import { NativeModules, Platform } from "react-native";

export type WidgetRow = { label: string; time: string };

/**
 * Pushes ready-to-display prayer time strings to the home screen widget.
 * Deliberately takes already-formatted display strings (not raw timetable
 * data) — all prayer-time calculation logic stays in JS where it's already
 * tested; the native widget just displays whatever it's given.
 */
export function updateWidget(
  nextLabel: string,
  nextTime: string,
  countdown: string,
  rows: WidgetRow[],
): void {
  if (Platform.OS !== "android") return;
  try {
    NativeModules.WidgetModule?.updateWidgetData(
      JSON.stringify({ nextLabel, nextTime, countdown, rows }),
    );
  } catch {}
}
