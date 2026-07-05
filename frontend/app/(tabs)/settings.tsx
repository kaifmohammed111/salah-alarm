import React, { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { useApp } from "@/src/context/AppContext";
import { storage } from "@/src/utils/storage";
import { FONTS, RADIUS, SPACING } from "@/src/theme";

const K_BACKUP = "salah.backup";

export default function SettingsScreen() {
  const { colors, isDark, settings, updateSettings, exportBackup, importBackup, timetable } =
    useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        {/* Time */}
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>TIME</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <RowSwitch
            icon="time-outline"
            label="24-hour format"
            value={settings.is24h}
            onChange={(v) => updateSettings({ is24h: v })}
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
            value={settings.preAlarmAnchor}
            onChange={(v) => updateSettings({ preAlarmAnchor: v as any })}
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
            value={settings.themeMode}
            onChange={(v) => updateSettings({ themeMode: v as any })}
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
            value={settings.showSunrise}
            onChange={(v) => updateSettings({ showSunrise: v })}
            testID="setting-sunrise"
          />
        </View>

        {/* Timetable */}
        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>TIMETABLE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            testID="manual-edit-btn"
            onPress={() => router.push("/editor")}
            style={[styles.row, { borderBottomWidth: 0 }]}
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

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 80, backgroundColor: colors.onSurface }]} testID="settings-toast">
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
  tile: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", borderRadius: RADIUS.md, padding: 4, marginBottom: SPACING.md },
  segmentItem: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center" },
  segmentText: { fontFamily: FONTS.semibold, fontSize: 14 },
  footerNote: { fontFamily: FONTS.regular, fontSize: 12, textAlign: "center", marginTop: SPACING.xl },
  toast: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  toastText: { fontFamily: FONTS.semibold, fontSize: 14 },
});
