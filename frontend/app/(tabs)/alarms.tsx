import React, { useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import {
  PRAYER_LABELS,
  PRAYER_ORDER,
  PrayerKey,
  computeStatuses,
  startJamaat,
} from "@/src/lib/prayer";
import PrayerCard from "@/src/components/PrayerCard";
import AlarmSettingsSheet, { AlarmSheetRef } from "@/src/components/AlarmSettingsSheet";

export default function AlarmsScreen() {
  const { colors, now, settings, todayRow, timetable, configs, setConfig } = useApp();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<AlarmSheetRef>(null);

  const statuses = useMemo(
    () => computeStatuses(todayRow, settings.showSunrise, now),
    [todayRow, settings.showSunrise, now],
  );
  const keys = PRAYER_ORDER.filter((k) => (k === "sunrise" ? settings.showSunrise : true));

  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Prayer Alarms</Text>
        <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
          Tap a prayer to change sound, volume & more
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: SPACING.xxxl }}
      >
        {!timetable ? (
          <View style={styles.empty}>
            <Ionicons name="alarm-outline" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>
              Upload a timetable to see your prayer alarms.
            </Text>
          </View>
        ) : (
          keys.map((k: PrayerKey) => {
            const sj = startJamaat(todayRow!, k);
            return (
              <PrayerCard
                key={k}
                prayerKey={k}
                startTime={sj.start}
                jamaatTime={sj.jamaat}
                status={statuses[k]}
                config={configs[k]}
                colors={colors}
                is24h={settings.is24h}
                asrMethod={settings.asrMethod}
                onPress={() => sheetRef.current?.present(k)}
                onToggleSound={() => setConfig(k, { enabled: !configs[k].enabled })}
              />
            );
          })
        )}
      </ScrollView>
      <AlarmSettingsSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontFamily: FONTS.bold, fontSize: 26 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: SPACING.xxxl, gap: SPACING.md },
  emptyText: { fontFamily: FONTS.medium, fontSize: 14, textAlign: "center" },
});
