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
  nextTimestamp: number,
  rows: WidgetRow[],
  nextIndex: number,
  style: "arc" | "grid",
): void {
  if (Platform.OS !== "android") return;
  const payload = { nextLabel, nextTime, nextTimestamp, rows, nextIndex, style };
  console.log("WIDGET PUSH:", JSON.stringify(payload));
  console.log("WidgetModule exists:", !!NativeModules.WidgetModule);
  try {
    NativeModules.WidgetModule?.updateWidgetData(JSON.stringify(payload));
    console.log("WIDGET PUSH: call completed without throwing");
  } catch (e) {
    console.log("WIDGET PUSH ERROR:", e);
  }
}
