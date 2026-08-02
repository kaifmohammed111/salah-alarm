import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";

import { useApp } from "@/src/context/AppContext";
import { updateWidget } from "@/src/lib/widget";
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
  timeToDate,
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
  const [showMonthlyView, setShowMonthlyView] = useState(false);
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
  const next = isToday ? nextPrayerInfo(viewRow, settings.showSunrise, now, settings.countdownAnchor) : null;
  const { time, period } = clockText(now, settings.is24h);

  const keys = PRAYER_ORDER.filter((k) => (k === "sunrise" ? settings.showSunrise : true));

  // Push today's prayer summary to the home screen widget whenever it
  // changes. Only for the actual "today" view (not when browsing another
  // date), and only using already-computed display values — no calculation
  // logic is duplicated on the native side.
  useEffect(() => {
    if (!isToday || !viewRow) return;
    // Always send the full 6-prayer set to the widget, regardless of the
    // in-app "show sunrise" setting — keeps the widget's layout consistent.
    // Each row carries its own timestamp so the native widget can work out
    // "next prayer" on its own between app opens, rather than relying
    // solely on whatever was true at the moment this effect last ran.
    //
    // FIX: each row's timestamp must respect settings.countdownAnchor
    // (start vs. jamaat), same as the in-app countdown does via
    // nextPrayerInfo(). This was previously hardcoded to `.start` for
    // every row, so toggling the setting never changed what the widget
    // displayed. Falls back to `.start` if a jamaat time isn't set for
    // that prayer, so the widget never silently gets a missing timestamp.
    const rows = PRAYER_ORDER.map((k) => {
      if (k === "sunrise") {
        const rowDate = timeToDate(viewRow.sunrise || "", now);
        return {
          label: PRAYER_LABELS[k],
          time: formatTime(viewRow.sunrise || "", settings.is24h),
          timestamp: rowDate ? rowDate.getTime() : 0,
        };
      }
      const sj = startJamaat(viewRow, k);
      const anchorTimeStr = settings.countdownAnchor === "jamaat" ? sj.jamaat || sj.start : sj.start;
      const rowDate = timeToDate(anchorTimeStr || "", now);
      return {
        label: PRAYER_LABELS[k],
        time: formatTime(anchorTimeStr || "", settings.is24h),
        timestamp: rowDate ? rowDate.getTime() : 0,
      };
    });

    // Computed regardless of branch below — needed either way now that
    // it's always part of the payload, so the widget has it on hand for
    // when today's prayers eventually run out between app opens.
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowRow = findTodayRow(timetable, tomorrow);
    const tomorrowFajrTime = tomorrowRow?.fajr?.start;
    const tomorrowFajrDate = tomorrowFajrTime ? timeToDate(tomorrowFajrTime, tomorrow) : null;
    const tomorrowFajrTimestamp = tomorrowFajrDate ? tomorrowFajrDate.getTime() : 0;

    if (next) {
      const nextIndex = PRAYER_ORDER.indexOf(next.key);
      updateWidget(
        PRAYER_LABELS[next.key],
        formatTime(next.time, settings.is24h),
        next.date.getTime(),
        rows,
        nextIndex,
        settings.widgetStyle,
        tomorrowFajrTimestamp,
        settings.countdownAnchor,
      );
    } else {
      // All of today's prayers have passed — fall back to showing
      // tomorrow's Fajr rather than a blank placeholder.
      updateWidget(
        "Fajr",
        tomorrowFajrTime ? formatTime(tomorrowFajrTime, settings.is24h) : "--:--",
        tomorrowFajrTimestamp,
        rows,
        0,
        settings.widgetStyle,
        tomorrowFajrTimestamp,
        settings.countdownAnchor,
      );
    }
    // FIX: settings.countdownAnchor was missing here, so even a correct
    // row-timestamp fix above would not re-push to the widget when the
    // user toggled start/jamaat in Settings — the effect simply wouldn't
    // re-run until something else in this list changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, viewRow, next?.key, settings.is24h, settings.widgetStyle, settings.countdownAnchor]);

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
              <Text style={styles.quoteText}>"{quote.text}"</Text>
              <Text style={styles.quoteSource}>— {quote.source}</Text>
            </Animated.View>

            <View style={styles.dateBtnRow}>
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
              <Pressable
                testID="home-monthly-view-btn"
                onPress={() => setShowMonthlyView(true)}
                style={styles.monthlyBtn}
                hitSlop={8}
              >
                <Ionicons name="grid-outline" size={14} color="rgba(255,255,255,0.85)" />
                <Text style={styles.monthlyBtnText}>Month</Text>
              </Pressable>
            </View>
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
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
                  {isToday ? "Today's Prayers" : dateStr}
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
                    No timings stored for this date. Import that month's timetable.
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

      <Modal
        visible={showMonthlyView}
        animationType="slide"
        onRequestClose={() => setShowMonthlyView(false)}
      >
        <View style={[styles.monthlyRoot, { backgroundColor: colors.surface }]}>
          <View style={[styles.monthlyHeader, { paddingTop: insets.top + SPACING.md, borderBottomColor: colors.border }]}>
            <Pressable testID="monthly-view-close" onPress={() => setShowMonthlyView(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.onSurface} />
            </Pressable>
            <Text style={[styles.monthlyTitle, { color: colors.onSurface }]}>
              {timetable?.month ? `${timetable.month} ${timetable.year || ""}` : "This Month"}
            </Text>
            <View style={{ width: 26 }} />
          </View>
          {!timetable?.rows?.length ? (
            <View style={styles.empty}>
              <Text style={[styles.emptySub, { color: colors.onSurfaceTertiary }]}>No timetable loaded yet.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xxl }}>
              <View style={[styles.monthlyRow, styles.monthlyHeaderRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.monthlyCellDate, styles.monthlyHeaderText, { color: colors.onSurfaceTertiary }]}>
                  Date
                </Text>
                {keys.map((k) => (
                  <Text
                    key={k}
                    style={[styles.monthlyCell, styles.monthlyHeaderText, { color: colors.onSurfaceTertiary }]}
                  >
                    {PRAYER_LABELS[k]}
                  </Text>
                ))}
              </View>
              {timetable.rows.map((row, i) => {
                // Timetable.rows is already scoped to a single month (the
                // whole app assumes one Timetable = one month), so
                // matching purely on day-of-month is sufficient here —
                // no need to also compare month/year strings, which
                // could be formatted differently depending on whether
                // this timetable came from CSV import or calculation.
                const rowIsToday = row.date === String(now.getDate());
                return (
                  <View
                    key={i}
                    style={[
                      styles.monthlyRow,
                      { borderBottomColor: colors.divider },
                      rowIsToday ? { backgroundColor: colors.brandTertiary } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthlyCellDate,
                        { color: rowIsToday ? colors.onBrandTertiary : colors.onSurface },
                      ]}
                    >
                      {row.day} {row.date}
                    </Text>
                    {keys.map((k) => {
                      const sj = startJamaat(row, k);
                      const timeStr = k === "sunrise" ? row.sunrise : sj.start;
                      return (
                        <Text
                          key={k}
                          style={[
                            styles.monthlyCell,
                            { color: rowIsToday ? colors.onBrandTertiary : colors.onSurfaceTertiary },
                          ]}
                        >
                          {timeStr ? formatTime(timeStr, settings.is24h) : "--:--"}
                        </Text>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
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
  dateBtnRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  monthlyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.3)",
  },
  monthlyBtnText: { fontFamily: FONTS.semibold, fontSize: 11, color: "rgba(255,255,255,0.85)" },
  monthlyRoot: { flex: 1 },
  monthlyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthlyTitle: { fontFamily: FONTS.bold, fontSize: 17 },
  monthlyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthlyHeaderRow: { borderBottomWidth: 1 },
  monthlyHeaderText: { fontFamily: FONTS.bold, fontSize: 10, textTransform: "uppercase" },
  monthlyCellDate: { width: 56, fontFamily: FONTS.semibold, fontSize: 11 },
  monthlyCell: { flex: 1, fontFamily: FONTS.regular, fontSize: 11, textAlign: "center" },
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
