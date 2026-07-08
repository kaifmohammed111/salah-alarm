import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Device from "expo-device";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { useApp } from "@/src/context/AppContext";
import { storage } from "@/src/utils/storage";
import { requestBatteryOptimizationExemption } from "@/src/lib/alarm";
import { FONTS, RADIUS, SPACING } from "@/src/theme";

import { settingsGuard } from "@/src/utils/settingsGuard";
import type { Settings } from "@/src/context/AppContext";

const K_BACKUP = "salah.backup";

const ALARM_BG_OPTIONS: { id: string; label: string; colors: [string, string, string] }[] = [
  { id: "default", label: "Default", colors: ["#2C5750", "#20403B", "#132925"] },
  { id: "nightsky", label: "Night Sky", colors: ["#0B1E3D", "#01122D", "#000814"] },
  { id: "playful", label: "Playful", colors: ["#7C3AED", "#DB2777", "#F59E0B"] },
  { id: "kids", label: "Kids", colors: ["#FDE68A", "#93C5FD", "#C4B5FD"] },
];

// OEMs known to hide/split background permissions behind vendor-specific
// settings screens that can't be reliably deep-linked into from a standard
// Android intent. We show manual instructions for these brands.
const OEM_INSTRUCTIONS: Record<string, string> = {
  vivo: "On Vivo phones: after tapping above, also go to Settings → Battery → Background power consumption management → SalahSync → Allow background power usage.",
  oppo: "On Oppo phones: after tapping above, also go to Settings → Battery → App Battery Management → SalahSync → Allow background activity.",
  xiaomi: "On Xiaomi/Redmi phones: after tapping above, also go to Settings → Apps → SalahSync → Battery saver → No restrictions, and enable Autostart.",
  realme: "On Realme phones: after tapping above, also go to Settings → Battery → App Battery Management → SalahSync → Allow background activity.",
};

export default function SettingsScreen() {
  const { colors, isDark, settings, updateSettings, exportBackup, importBackup, timetable } =
    useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draft state: edits here don't persist/apply anywhere else in the app
  // until the user explicitly taps Save. Re-seeded whenever `settings`
  // itself changes from outside this screen (e.g. right after a save).
  const [draft, setDraft] = useState<Settings>(settings);
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const saveSettings = () => {
    updateSettings(draft);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    flash("Settings saved");
  };

  const discardSettings = () => {
    setDraft(settings);
  };

  // Keep the shared guard's flags/callbacks current every render so the
  // Tabs layout always sees the latest dirty state and can call back into
  // this screen's own save/discard logic when intercepting a tab switch.
  settingsGuard.isDirty = isDirty;
  settingsGuard.save = saveSettings;
  settingsGuard.discard = discardSettings;

  const flash = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const doBackup = async () => {
    await storage.setItem(K_BACKUP, exportBackup());
    flash("Backup saved on this device");
  };
  const doRestore = async () => {
    const b = await storage.getItem(K_BACKUP, "");
    if (!b) return flash("No backup found");
    const ok = await importBackup(b);
    flash(ok ? "Backup restored" : "Restore failed");
  };

  const doBatteryExemption = async () => {
    await requestBatteryOptimizationExemption(true);
  };

  const openConverter = () => {
    Linking.openURL("https://tools.nanonets.com/image-to-csv");
  };

  const MOSQUES = [
    { name: "Ghamkol Sharif", url: "https://gsmosque.org/prayer-time-table/" },
    {
      name: "Zia Ul Quran",
      url: "https://www.facebook.com/media/set/?set=a.454605720032175&type=3&locale=en_GB",
    },
    { name: "Faizan E Medina", url: "https://dawateislamimidlands.net/stechford-birminghan/" },
    { name: "Misbah Ul Quran", url: "https://misbahulquran.net/" },
  ];
  const openMosqueLink = (url: string) => Linking.openURL(url);

  const deviceBrand = (Device.brand || "").toLowerCase();
  const oemHint = OEM_INSTRUCTIONS[deviceBrand];

  const iconTile = (name: string, bg: string, color: string) => (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <Ionicons name={name as any} size={18} color={color} />
    </View>
  );

  const RowSwitch = ({
    icon,
    label,
    value,
    onChange,
    testID,
  }: {
    icon: string;
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
    testID: string;
  }) => (
    <View style={[styles.row, { borderBottomColor: colors.divider }]}>
      <View style={styles.rowLeft}>
        {iconTile(icon, colors.brandTertiary, colors.brand)}
        <Text style={[styles.rowLabel, { color: colors.onSurface }]}>{label}</Text>
      </View>
      <Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ true: colors.brand }} />
    </View>
  );

  const Segmented = ({
    options,
    value,
    onChange,
    testID,
  }: {
    options: { id: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
    testID: string;
  }) => (
    <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]} testID={testID}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            testID={`${testID}-${o.id}`}
            onPress={() => onChange(o.id)}
            style={[styles.segmentItem, active && { backgroundColor: colors.brand }]}
          >
            <Text style={[styles.segmentText, { color: active ? "#fff" : colors.onSurfaceSecondary }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: SPACING.xxxl }}>
        {/* Reliability */}
        {Platform.OS === "android" ? (
          <>
            <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>RELIABILITY</Text>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                testID="battery-optimization-btn"
                onPress={doBatteryExemption}
                style={[styles.row, { borderBottomWidth: 0 }]}
              >
                <View style={styles.rowLeft}>
                  {iconTile("battery-charging-outline", colors.brandTertiary, colors.brand)}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.onSurface }]}>
                      Allow background alarms
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]}>
                      Required for alarms to ring reliably when the app isn't open
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
              {oemHint ? (
                <View style={[styles.oemHintBox, { borderTopColor: colors.divider }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.brand} />
                  <Text style={[styles.oemHintText, { color: colors.onSurfaceTertiary }]}>{oemHint}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Time */}
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>TIME</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <RowSwitch
            icon="time-outline"
            label="24-hour format"
            value={draft.is24h}
            onChange={(v) => setDraft((d) => ({ ...d, is24h: v }))}
            testID="setting-24h"
          />
        </View>

        {/* Pre-alarm */}
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>PRE-ALARM</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={styles.rowLeft}>
              {iconTile("alarm-outline", colors.brandTertiary, colors.brand)}
              <View>
                <Text style={[styles.rowLabel, { color: colors.onSurface }]}>Ring early relative to</Text>
                <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]}>
                  Pre-alarm minutes count back from this time
                </Text>
              </View>
            </View>
          </View>
          <Segmented
            testID="setting-prealarm-anchor"
            value={draft.preAlarmAnchor}
            onChange={(v) => setDraft((d) => ({ ...d, preAlarmAnchor: v as any }))}
            options={[
              { id: "start", label: "Start time" },
              { id: "jamaat", label: "Jamaat time" },
            ]}
          />
        </View>

        {/* Appearance */}
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.row, { borderBottomColor: colors.divider }]}>
            <View style={styles.rowLeft}>
              {iconTile("contrast-outline", colors.brandTertiary, colors.brand)}
              <Text style={[styles.rowLabel, { color: colors.onSurface }]}>Theme</Text>
            </View>
          </View>
          <Segmented
            testID="setting-theme"
            value={draft.themeMode}
            onChange={(v) => setDraft((d) => ({ ...d, themeMode: v as any }))}
            options={[
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
              { id: "system", label: "System" },
            ]}
          />
          <View style={{ height: SPACING.sm }} />
          <RowSwitch
            icon="partly-sunny-outline"
            label="Show Sunrise row"
            value={draft.showSunrise}
            onChange={(v) => setDraft((d) => ({ ...d, showSunrise: v }))}
            testID="setting-sunrise"
          />
        </View>

        {/* Alarm Screen */}
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>ALARM SCREEN</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary, marginBottom: SPACING.md }]}>
            Background shown when an alarm rings
          </Text>
          <View style={styles.alarmBgGrid}>
            {ALARM_BG_OPTIONS.map((opt) => {
              const active = draft.alarmBackground === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  testID={`alarm-bg-${opt.id}`}
                  onPress={() => setDraft((d) => ({ ...d, alarmBackground: opt.id as any }))}
                  style={styles.alarmBgItem}
                >
                  <LinearGradient
                    colors={opt.colors}
                    style={[
                      styles.alarmBgSwatch,
                      { borderColor: active ? colors.brand : "transparent", borderWidth: active ? 3 : 0 },
                    ]}
                  >
                    {active ? (
                      <View style={styles.alarmBgCheck}>
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      </View>
                    ) : null}
                  </LinearGradient>
                  <Text style={[styles.alarmBgLabel, { color: colors.onSurface }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Timetable */}
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>TIMETABLE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            testID="manual-edit-btn"
            onPress={() => router.push("/editor")}
            style={[styles.row, { borderBottomColor: colors.divider }]}
          >
            <View style={styles.rowLeft}>
              {iconTile("create-outline", colors.brandTertiary, colors.brand)}
              <View>
                <Text style={[styles.rowLabel, { color: colors.onSurface }]}>Edit timetable manually</Text>
                <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]}>
                  Enter or correct times day by day
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <Pressable
            testID="convert-csv-link"
            onPress={openConverter}
            style={[styles.row, { borderBottomWidth: 0 }]}
          >
            <View style={styles.rowLeft}>
              {iconTile("image-outline", colors.brandTertiary, colors.brand)}
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.onSurface }]}>
                  Have a photo or PDF instead?
                </Text>
                <Text style={[styles.rowSub, { color: colors.onSurfaceTertiary }]}>
                  Convert it to a CSV file first, then import it here
                </Text>
              </View>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {/* Mosque Timetables */}
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>MOSQUE TIMETABLES</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {MOSQUES.map((m, i) => (
            <Pressable
              key={m.name}
              testID={`mosque-link-${i}`}
              onPress={() => openMosqueLink(m.url)}
              style={[
                styles.row,
                i === MOSQUES.length - 1
                  ? { borderBottomWidth: 0 }
                  : { borderBottomColor: colors.divider },
              ]}
            >
              <View style={styles.rowLeft}>
                {iconTile("business-outline", colors.brandTertiary, colors.brand)}
                <Text style={[styles.rowLabel, { color: colors.onSurface }]}>{m.name}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        {/* Data */}
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>DATA</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable testID="backup-btn" onPress={doBackup} style={[styles.row, { borderBottomColor: colors.divider }]}>
            <View style={styles.rowLeft}>
              {iconTile("cloud-upload-outline", "#DCFCE7", colors.success)}
              <Text style={[styles.rowLabel, { color: colors.onSurface }]}>Backup timetable</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <Pressable testID="restore-btn" onPress={doRestore} style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={styles.rowLeft}>
              {iconTile("cloud-download-outline", "#DBEAFE", colors.brand)}
              <Text style={[styles.rowLabel, { color: colors.onSurface }]}>Restore timetable</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <Text style={[styles.footerNote, { color: colors.muted }]}>
          {timetable ? `Timetable loaded: ${timetable.month || ""} ${timetable.year || ""}`.trim() : "No timetable loaded"}
        </Text>
      </ScrollView>

      {isDirty ? (
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + SPACING.md, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Pressable testID="settings-discard-btn" onPress={discardSettings} style={styles.discardBtn}>
            <Text style={[styles.discardText, { color: colors.muted }]}>Discard</Text>
          </Pressable>
          <Pressable testID="settings-save-btn" onPress={saveSettings} style={[styles.saveBtn, { backgroundColor: colors.brand }]}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>Save Settings</Text>
          </Pressable>
        </View>
      ) : null}

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + (isDirty ? 92 : 20), backgroundColor: colors.onSurface }]} testID="settings-toast">
          <Text style={[styles.toastText, { color: colors.surface }]}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: FONTS.bold, fontSize: 26 },
  section: { fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 1, marginTop: SPACING.xl, marginBottom: SPACING.sm },
  card: { borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACING.lg, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  rowLabel: { fontFamily: FONTS.medium, fontSize: 15 },
  rowSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 1 },
  oemHintBox: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-start",
  },
  oemHintText: { fontFamily: FONTS.regular, fontSize: 12, flex: 1, lineHeight: 17 },
  tile: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", borderRadius: RADIUS.md, padding: 4, marginBottom: SPACING.md },
  segmentItem: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center" },
  segmentText: { fontFamily: FONTS.semibold, fontSize: 14 },
  footerNote: { fontFamily: FONTS.regular, fontSize: 12, textAlign: "center", marginTop: SPACING.xl },
  alarmBgGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md },
  alarmBgItem: { alignItems: "center", width: 76 },
  alarmBgSwatch: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  alarmBgCheck: { alignItems: "center", justifyContent: "center" },
  alarmBgLabel: { fontFamily: FONTS.medium, fontSize: 11, marginTop: SPACING.xs, textAlign: "center" },
  saveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  discardBtn: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.md },
  discardText: { fontFamily: FONTS.semibold, fontSize: 14 },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  saveBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: "#fff" },
  toast: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  toastText: { fontFamily: FONTS.semibold, fontSize: 14 },
});
