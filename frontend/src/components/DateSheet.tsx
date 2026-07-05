import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { useApp } from "@/src/context/AppContext";
import { formatHijri } from "@/src/lib/hijri";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type DateSheetRef = { present: (d: Date) => void };

type Props = { selected: Date; onSelect: (d: Date) => void };

function sameYMD(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DateSheet = forwardRef<DateSheetRef, Props>(({ selected, onSelect }, ref) => {
  const { colors } = useApp();
  const modalRef = useRef<BottomSheetModal>(null);
  const [viewMonth, setViewMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const snapPoints = useMemo(() => ["62%"], []);
  const today = new Date();

  useImperativeHandle(ref, () => ({
    present: (d: Date) => {
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      modalRef.current?.present();
    },
  }));

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  );

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const shiftMonth = (delta: number) => {
    Haptics.selectionAsync();
    setViewMonth(new Date(year, month + delta, 1));
  };

  const pick = (d: number) => {
    Haptics.selectionAsync();
    const chosen = new Date(year, month, d);
    onSelect(chosen);
    modalRef.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      backgroundStyle={{ backgroundColor: colors.surface }}
      enablePanDownToClose
    >
      <BottomSheetView style={[styles.container, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Choose a date</Text>

        <View style={styles.navRow}>
          <Pressable testID="cal-prev" onPress={() => shiftMonth(-1)} hitSlop={10} style={[styles.navBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.onSurface }]}>
            {MONTH_NAMES[month]} {year}
          </Text>
          <Pressable testID="cal-next" onPress={() => shiftMonth(1)} hitSlop={10} style={[styles.navBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text key={i} style={[styles.weekday, { color: colors.muted }]}>{w}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (d === null) return <View key={`b${i}`} style={styles.cell} />;
            const cellDate = new Date(year, month, d);
            const isSel = sameYMD(cellDate, selected);
            const isToday = sameYMD(cellDate, today);
            return (
              <Pressable
                key={d}
                testID={`cal-day-${d}`}
                onPress={() => pick(d)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.dayInner,
                    isSel && { backgroundColor: colors.brand },
                    !isSel && isToday && { borderWidth: 1.5, borderColor: colors.brand },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: isSel ? "#fff" : colors.onSurface },
                    ]}
                  >
                    {d}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.hijriPreview, { color: colors.onSurfaceTertiary }]}>
          {formatHijri(selected)}
        </Text>

        <Pressable
          testID="cal-today-btn"
          onPress={() => {
            const t = new Date();
            onSelect(t);
            modalRef.current?.dismiss();
          }}
          style={[styles.todayBtn, { backgroundColor: colors.brandTertiary }]}
        >
          <Ionicons name="today-outline" size={16} color={colors.brand} />
          <Text style={[styles.todayText, { color: colors.onBrandTertiary }]}>Jump to today</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

DateSheet.displayName = "DateSheet";
export default DateSheet;

const styles = StyleSheet.create({
  container: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl },
  title: { fontFamily: FONTS.bold, fontSize: 20, marginBottom: SPACING.lg },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.md },
  navBtn: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  monthLabel: { fontFamily: FONTS.bold, fontSize: 17 },
  weekRow: { flexDirection: "row", marginBottom: SPACING.sm },
  weekday: { flex: 1, textAlign: "center", fontFamily: FONTS.semibold, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayInner: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dayText: { fontFamily: FONTS.medium, fontSize: 15 },
  hijriPreview: { fontFamily: FONTS.medium, fontSize: 13, textAlign: "center", marginTop: SPACING.md },
  todayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
    marginTop: SPACING.lg,
  },
  todayText: { fontFamily: FONTS.semibold, fontSize: 14 },
});
