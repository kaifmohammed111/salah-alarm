import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";

import { useApp } from "@/src/context/AppContext";
import { useNow } from "@/src/context/NowContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { formatHijri } from "@/src/lib/hijri";
import { QUOTES } from "@/src/lib/quotes";
import { getMoonInfo } from "@/src/lib/moon";
import MoonPhase from "@/src/components/MoonPhase";
import {
  PRAYER_LABELS,
  PRAYER_ORDER,
  PrayerKey,
  computeStatuses,
  countdownString,
  findTodayRow,
  formatTime,
  nextPrayerInfo,
  startJamaat,
} from "@/src/lib/prayer";
import PrayerCard from "@/src/components/PrayerCard";
import AlarmSettingsSheet, { AlarmSheetRef } from "@/src/components/AlarmSettingsSheet";
import DateSheet, { DateSheetRef } from "@/src/components/DateSheet";

const HERO_BG = "#20403B";

function sameYMD(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

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
  const { colors, settings, timetable, configs, setConfig, needsNextMonth, quoteStartIndex } =
    useApp();
  const now = useNow();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sheetRef = useRef<AlarmSheetRef>(null);
  const dateSheetRef = useRef<DateSheetRef>(null);

  const [qi, setQi] = useState(quoteStartIndex);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const moon = getMoonInfo(now);

  // Start from the quote chosen for this app-open, then gently slide through the rest.
  useEffect(() => {
    setQi(quoteStartIndex);
  }, [quoteStartIndex]);
  useEffect(() => {
    const id = setInterval(() => setQi((v) => (v + 1) % QUOTES.length), 12000);
    return () => clearInterval(id);
  }, []);

  const quote = QUOTES[qi % QUOTES.length];

  const viewDate = selectedDate ?? now;
  const isToday = sameYMD(viewDate, now);
  const viewRow = findTodayRow(timetable, viewDate);
  const statusRef = isToday ? now : new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 0, 0, 0);

  const statuses = computeStatuses(viewRow, settings.showSunrise, statusRef);
  if (!isToday) {
    (Object.keys(statuses) as PrayerKey[]).forEach((k) => {
      if (statuses[k] === "current") statuses[k] = "upcoming";
    });
  }
  const next = isToday ? nextPrayerInfo(viewRow, settings.showSunrise, now) : null;
  const { time, period } = clockText(now, settings.is24h);

  const keys = PRAYER_ORDER.filter((k) => (k === "sunrise" ? settings.showSunrise : true));

  const dateStr = viewDate.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: HERO_BG }]}>
          <View style={styles.moonWrap} pointerEvents="none">
            <MoonPhase size={230} now={now} backgroundColor={HERO_BG} />
          </View>
          <LinearGradient
            colors={["rgba(32,64,59,0.15)", "rgba(32,64,59,0.55)", "rgba(32,64,59,0.95)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.quoteWrap, { top: insets.top + SPACING.md }]}>
            <Animated.View key={qi} entering={FadeIn.duration(700)} testID="home-quote">
              <Ionicons name="book-outline" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.quoteText}>“{quote.text}”</Text>
              <Text style={styles.quoteSource}>— {quote.source}</Text>
            </Animated.View>

            <Pressable
              testID="home-date-btn"
              onPress={() => dateSheetRef.current?.present(viewDate)}
              style={styles.dateBtn}
              hitSlop={8}
            >
              <View style={styles.dateRow}>
                <Text style={styles.dateText}>{dateStr}</Text>
                <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.85)" />
              </View>
              <Text style={styles.hijriText}>{formatHijri(viewDate)}</Text>
              <Text style={styles.moonText}>
                🌙 {moon.name} · {Math.round(moon.illumination * 100)}% lit
              </Text>
            </Pressable>
          </View>

          <View style={[styles.heroContent, { paddingTop: insets.top + SPACING.lg }]}>
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
            ) : isToday && viewRow ? (
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
                Please upload next month’s prayer timetable.
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
                Upload your mosque’s monthly prayer timetable to auto-schedule daily alarms.
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
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
                  {isToday ? "Today’s Prayers" : dateStr}
                </Text>
                {!isToday ? (
                  <Pressable
                    testID="reset-today-btn"
                    onPress={() => setSelectedDate(null)}
                    style={[styles.resetPill, { backgroundColor: colors.brandTertiary }]}
                  >
                    <Ionicons name="refresh" size={13} color={colors.brand} />
                    <Text style={[styles.resetText, { color: colors.onBrandTertiary }]}>Today</Text>
                  </Pressable>
                ) : null}
              </View>
              {!viewRow ? (
                <View style={[styles.noRow, { backgroundColor: colors.surfaceSecondary }]}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.muted} />
                  <Text style={[styles.noRowText, { color: colors.onSurfaceTertiary }]}>
                    No timings stored for this date. Import that month’s timetable.
                  </Text>
                </View>
              ) : (
                <>
                  {viewRow.sehriEnd || viewRow.iftar ? (
                    <View style={styles.ramadanRow} testID="ramadan-strip">
                      <View style={[styles.ramCard, { backgroundColor: colors.brandTertiary }]}>
                        <Ionicons name="restaurant-outline" size={20} color={colors.brand} />
                        <View>
                          <Text style={[styles.ramLabel, { color: colors.onBrandTertiary }]}>Sehri Ends</Text>
                          <Text style={[styles.ramValue, { color: colors.onBrandTertiary }]}>
                            {formatTime(viewRow.sehriEnd || "", settings.is24h)}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.ramCard, { backgroundColor: colors.brandTertiary }]}>
                        <Ionicons name="moon-outline" size={20} color={colors.brand} />
                        <View>
                          <Text style={[styles.ramLabel, { color: colors.onBrandTertiary }]}>Iftar</Text>
                          <Text style={[styles.ramValue, { color: colors.onBrandTertiary }]}>
                            {formatTime(viewRow.iftar || "", settings.is24h)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : null}
                  {keys.map((k: PrayerKey) => {
                    const sj = startJamaat(viewRow, k);
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
                        onPress={() => sheetRef.current?.present(k)}
                        onToggleSound={() => setConfig(k, { enabled: !configs[k].enabled })}
                      />
                    );
                  })}
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
      <AlarmSettingsSheet ref={sheetRef} />
      <DateSheet
        ref={dateSheetRef}
        selected={viewDate}
        onSelect={(d) => setSelectedDate(sameYMD(d, now) ? null : d)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { height: 380, justifyContent: "flex-end", overflow: "hidden" },
  moonWrap: { position: "absolute", top: 60, left: 0, right: 0, alignItems: "center" },
  quoteWrap: { position: "absolute", left: SPACING.xl, right: SPACING.xl },
  moonText: { fontFamily: FONTS.medium, fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 3 },
  quoteText: {
    fontFamily: FONTS.semibold,
    fontSize: 16,
    color: "#FFFFFF",
    lineHeight: 23,
    marginTop: SPACING.sm,
  },
  quoteSource: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    marginTop: 4,
  },
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
  dateBtn: { alignSelf: "flex-start", marginTop: SPACING.md },
  dateRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.md },
  resetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.pill,
  },
  resetText: { fontFamily: FONTS.semibold, fontSize: 12 },
  noRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  noRowText: { fontFamily: FONTS.medium, fontSize: 13, flex: 1 },
  ramadanRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.md },
  ramCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  ramLabel: { fontFamily: FONTS.medium, fontSize: 12 },
  ramValue: { fontFamily: FONTS.bold, fontSize: 18, marginTop: 1 },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 18 },
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
