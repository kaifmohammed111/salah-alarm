import React, { useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { formatHijri } from "@/src/lib/hijri";
import {
  PRAYER_LABELS,
  PRAYER_ORDER,
  PrayerKey,
  computeStatuses,
  countdownString,
  formatTime,
  nextPrayerInfo,
  startJamaat,
} from "@/src/lib/prayer";
import PrayerCard from "@/src/components/PrayerCard";
import AlarmSettingsSheet, { AlarmSheetRef } from "@/src/components/AlarmSettingsSheet";

const HERO = "https://images.pexels.com/photos/10943458/pexels-photo-10943458.jpeg";
const HERO_DARK = "https://images.pexels.com/photos/20216577/pexels-photo-20216577.jpeg";

function clockText(now: Date, is24h: boolean): { time: string; period: string } {
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, "0");
  if (is24h) return { time: `${String(h).padStart(2, "0")}:${m}`, period: "" };
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return { time: `${h}:${m}`, period };
}

export default function HomeScreen() {
  const { colors, isDark, now, settings, todayRow, timetable, configs, setConfig, needsNextMonth } =
    useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sheetRef = useRef<AlarmSheetRef>(null);

  const statuses = computeStatuses(todayRow, settings.showSunrise, now);
  const next = nextPrayerInfo(todayRow, settings.showSunrise, now);
  const { time, period } = clockText(now, settings.is24h);

  const keys = PRAYER_ORDER.filter((k) => (k === "sunrise" ? settings.showSunrise : true));

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={{ uri: isDark ? HERO_DARK : HERO }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={300}
          />
          <LinearGradient
            colors={["rgba(15,23,42,0.35)", "rgba(15,23,42,0.75)", "rgba(15,23,42,0.95)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroContent, { paddingTop: insets.top + SPACING.lg }]}>
            <Text style={styles.dateText}>{dateStr}</Text>
            <Text style={styles.hijriText}>{formatHijri(now)}</Text>

            <View style={styles.clockRow}>
              <Text style={styles.clock} testID="home-clock">{time}</Text>
              {period ? <Text style={styles.period}>{period}</Text> : null}
            </View>

            {next ? (
              <View style={styles.nextWrap} testID="home-next-prayer">
                <Text style={styles.nextLabel}>
                  Next · {PRAYER_LABELS[next.key]} at {formatTime(next.time, settings.is24h)}
                </Text>
                <Text style={styles.countdown}>{countdownString(next.date, now)}</Text>
              </View>
            ) : todayRow ? (
              <View style={styles.nextWrap}>
                <Text style={styles.nextLabel}>All prayers done for today</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          {needsNextMonth ? (
            <Pressable
              testID="upload-next-month-banner"
              onPress={() => router.push("/upload")}
              style={[styles.banner, { backgroundColor: colors.brandTertiary }]}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.brand} />
              <Text style={[styles.bannerText, { color: colors.onBrandTertiary }]}>
                Please upload next month's prayer timetable.
              </Text>
            </Pressable>
          ) : null}

          {!timetable ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.brandTertiary }]}>
                <Ionicons name="cloud-upload-outline" size={40} color={colors.brand} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>No timetable yet</Text>
              <Text style={[styles.emptySub, { color: colors.onSurfaceTertiary }]}>
                Upload your mosque's monthly prayer timetable to auto-schedule daily alarms.
              </Text>
              <Pressable
                testID="empty-upload-btn"
                onPress={() => router.push("/upload")}
                style={[styles.emptyBtn, { backgroundColor: colors.brand }]}
              >
                <Text style={[styles.emptyBtnText, { color: colors.onBrandPrimary }]}>
                  Upload Timetable
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Today's Prayers</Text>
              {keys.map((k: PrayerKey) => {
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
              })}
            </>
          )}
        </View>
      </ScrollView>
      <AlarmSettingsSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { height: 340, justifyContent: "flex-end" },
  heroContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl },
  dateText: { fontFamily: FONTS.medium, fontSize: 14, color: "rgba(255,255,255,0.85)" },
  hijriText: { fontFamily: FONTS.regular, fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  clockRow: { flexDirection: "row", alignItems: "flex-end", marginTop: SPACING.md },
  clock: { fontFamily: FONTS.bold, fontSize: 64, color: "#FFFFFF", letterSpacing: -1 },
  period: { fontFamily: FONTS.semibold, fontSize: 20, color: "rgba(255,255,255,0.85)", marginBottom: 12, marginLeft: 6 },
  nextWrap: { marginTop: SPACING.sm },
  nextLabel: { fontFamily: FONTS.medium, fontSize: 14, color: "rgba(255,255,255,0.9)" },
  countdown: { fontFamily: FONTS.bold, fontSize: 22, color: "#FFFFFF", marginTop: 2 },
  body: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
  },
  bannerText: { fontFamily: FONTS.semibold, fontSize: 14, flex: 1 },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 18, marginBottom: SPACING.md },
  empty: { alignItems: "center", paddingVertical: SPACING.xxxl },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  emptyTitle: { fontFamily: FONTS.bold, fontSize: 20, color: "#0F172A" },
  emptySub: { fontFamily: FONTS.regular, fontSize: 14, textAlign: "center", marginTop: SPACING.sm, lineHeight: 20 },
  emptyBtn: { marginTop: SPACING.xl, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  emptyBtnText: { fontFamily: FONTS.bold, fontSize: 15 },
});
