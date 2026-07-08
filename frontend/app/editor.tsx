import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { useApp } from "@/src/context/AppContext";
import { useNow } from "@/src/context/NowContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { DayRow, PRAYER_LABELS, Timetable, findTodayRow } from "@/src/lib/prayer";
import TimeField from "@/src/components/TimeField";

const EDIT_KEYS: (keyof DayRow)[] = ["fajr", "sunrise", "zuhr", "asr", "maghrib", "isha"];

function blankRow(date: number): DayRow {
  const empty = { start: "", jamaat: "" };
  return {
    date: String(date),
    day: "",
    hijri: "",
    fajr: { ...empty },
    sunrise: "",
    zuhr: { ...empty },
    asr: { ...empty },
    maghrib: { ...empty },
    isha: { ...empty },
  };
}

function blankMonth(days: number): Timetable {
  return { rows: Array.from({ length: days }, (_, i) => blankRow(i + 1)) };
}

export default function EditorScreen() {
  const { colors, timetable, saveTimetable } = useApp();
  const now = useNow();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [draft, setDraft] = useState<Timetable | null>(timetable);
  const [rowIdx, setRowIdx] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (timetable) {
      setDraft(timetable);
      const t = findTodayRow(timetable, now);
      const idx = t ? timetable.rows.indexOf(t) : 0;
      setRowIdx(Math.max(0, idx));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRow = (mut: (r: DayRow) => DayRow) => {
    setSaved(false);
    setDraft((prev) => {
      if (!prev) return prev;
      const rows = [...prev.rows];
      rows[rowIdx] = mut({ ...rows[rowIdx] });
      return { ...prev, rows };
    });
  };

  const onSave = async () => {
    if (!draft) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveTimetable(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const row = draft?.rows?.[rowIdx];
  const isRamadan = !!draft?.isRamadan || (!!row && (row.sehriEnd != null || row.iftar != null));

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, borderBottomColor: colors.border }]}>
        <Pressable testID="editor-back" onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.title, { color: colors.onSurface }]}>Edit Timetable</Text>
        <View style={{ width: 26 }} />
      </View>

      {!draft ? (
        <View style={styles.createWrap}>
          <View style={[styles.createIcon, { backgroundColor: colors.brandTertiary }]}>
            <Ionicons name="create-outline" size={40} color={colors.brand} />
          </View>
          <Text style={[styles.createTitle, { color: colors.onSurface }]}>Create a blank month</Text>
          <Text style={[styles.createSub, { color: colors.onSurfaceTertiary }]}>
            Choose the number of days, then enter each day's prayer times manually.
          </Text>
          <View style={styles.dayChoices}>
            {[28, 29, 30, 31].map((d) => (
              <Pressable
                key={d}
                testID={`create-days-${d}`}
                onPress={() => {
                  setDraft(blankMonth(d));
                  setRowIdx(0);
                }}
                style={[styles.dayChoice, { backgroundColor: colors.brandTertiary }]}
              >
                <Text style={[styles.dayChoiceText, { color: colors.onBrandTertiary }]}>{d} days</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={insets.top + 60}
        >
          {/* Day chip row */}
          <View style={styles.chipRowWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {draft.rows.map((r, i) => {
                const active = i === rowIdx;
                return (
                  <Pressable
                    key={i}
                    testID={`day-chip-${r.date}`}
                    onPress={() => setRowIdx(i)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.brand : colors.surfaceSecondary,
                        borderColor: active ? colors.brand : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? "#fff" : colors.onSurfaceSecondary }]}>
                      {r.date}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
          >
            {row ? (
              <>
                <View style={styles.metaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.metaLabel, { color: colors.onSurfaceTertiary }]}>Day</Text>
                    <TextInput
                      testID="edit-day"
                      value={row.day || ""}
                      onChangeText={(v) => updateRow((r) => ({ ...r, day: v }))}
                      placeholder="e.g. MON"
                      placeholderTextColor={colors.muted}
                      style={[styles.metaInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.metaLabel, { color: colors.onSurfaceTertiary }]}>Hijri</Text>
                    <TextInput
                      testID="edit-hijri"
                      value={row.hijri || ""}
                      onChangeText={(v) => updateRow((r) => ({ ...r, hijri: v }))}
                      placeholder="e.g. 15 Muharram"
                      placeholderTextColor={colors.muted}
                      style={[styles.metaInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                    />
                  </View>
                </View>

                {isRamadan ? (
                  <View style={styles.ramFields}>
                    <View style={styles.fieldRow}>
                      <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Sehri Ends</Text>
                      <View style={styles.fieldInputs}>
                        <TimeField
                          testID="med-sehri"
                          colors={colors}
                          value={row.sehriEnd || ""}
                          onChange={(v) => updateRow((rr) => ({ ...rr, sehriEnd: v }))}
                        />
                      </View>
                    </View>
                    <View style={styles.fieldRow}>
                      <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Iftar</Text>
                      <View style={styles.fieldInputs}>
                        <TimeField
                          testID="med-iftar"
                          colors={colors}
                          value={row.iftar || ""}
                          onChange={(v) => updateRow((rr) => ({ ...rr, iftar: v, maghrib: { start: v, jamaat: v } }))}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}

                <View style={styles.colHeader}>
                  <Text style={[styles.colHeaderLabel, { color: colors.muted }]}>Prayer</Text>
                  <View style={styles.colHeaderRight}>
                    <Text style={[styles.colHeaderText, { color: colors.muted }]}>Start</Text>
                    <Text style={[styles.colHeaderText, { color: colors.muted }]}>Jamaat</Text>
                  </View>
                </View>

                {EDIT_KEYS.map((k) => {
                  if (k === "sunrise") {
                    return (
                      <View key={k} style={styles.fieldRow}>
                        <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Sunrise</Text>
                        <View style={styles.fieldInputs}>
                          <TimeField
                            testID="med-sunrise"
                            colors={colors}
                            value={(row.sunrise as string) || ""}
                            onChange={(v) => updateRow((r) => ({ ...r, sunrise: v }))}
                          />
                        </View>
                      </View>
                    );
                  }
                  const pair = (row[k] as any) || { start: "", jamaat: "" };
                  return (
                    <View key={k} style={styles.fieldRow}>
                      <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>
                        {PRAYER_LABELS[k as keyof typeof PRAYER_LABELS]}
                      </Text>
                      <View style={styles.fieldInputs}>
                        <TimeField
                          testID={`med-${k}-start`}
                          colors={colors}
                          value={pair.start || ""}
                          onChange={(v) => updateRow((r) => ({ ...r, [k]: { ...(r[k] as any), start: v } }))}
                        />
                        <TimeField
                          testID={`med-${k}-jamaat`}
                          colors={colors}
                          value={pair.jamaat || ""}
                          onChange={(v) => updateRow((r) => ({ ...r, [k]: { ...(r[k] as any), jamaat: v } }))}
                        />
                      </View>
                    </View>
                  );
                })}
                <Text style={[styles.hint, { color: colors.muted }]}>Use 24-hour HH:MM. Sunrise has no alarm.</Text>
              </>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Pressable
              testID="editor-save-btn"
              onPress={onSave}
              style={[styles.saveBtn, { backgroundColor: saved ? colors.success : colors.brand }]}
            >
              <Ionicons name={saved ? "checkmark" : "save-outline"} size={18} color="#fff" />
              <Text style={styles.saveText}>{saved ? "Saved!" : "Save Timetable"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 26 },
  title: { fontFamily: FONTS.bold, fontSize: 18 },
  createWrap: { alignItems: "center", padding: SPACING.xl, paddingTop: SPACING.xxxl },
  createIcon: { width: 88, height: 88, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg },
  createTitle: { fontFamily: FONTS.bold, fontSize: 20 },
  createSub: { fontFamily: FONTS.regular, fontSize: 14, textAlign: "center", marginTop: SPACING.sm, lineHeight: 20 },
  dayChoices: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md, justifyContent: "center", marginTop: SPACING.xl },
  dayChoice: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  dayChoiceText: { fontFamily: FONTS.semibold, fontSize: 15 },
  chipRowWrap: { height: 56, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "transparent" },
  chipRow: { paddingHorizontal: SPACING.lg, gap: SPACING.sm, alignItems: "center" },
  chip: {
    width: 44,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  chipText: { fontFamily: FONTS.semibold, fontSize: 14 },
  metaRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.lg },
  metaLabel: { fontFamily: FONTS.medium, fontSize: 12, marginBottom: 4 },
  metaInput: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: FONTS.medium,
    fontSize: 14,
  },
  colHeader: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm },
  ramFields: { marginBottom: SPACING.xs },
  colHeaderLabel: { fontFamily: FONTS.semibold, fontSize: 12, flex: 1, letterSpacing: 0.5 },
  colHeaderRight: { flexDirection: "row", gap: SPACING.sm },
  colHeaderText: { fontFamily: FONTS.semibold, fontSize: 12, width: 76, textAlign: "center", letterSpacing: 0.5 },
  fieldRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md },
  fieldLabel: { fontFamily: FONTS.semibold, fontSize: 15, flex: 1 },
  fieldInputs: { flexDirection: "row", gap: SPACING.sm },
  hint: { fontFamily: FONTS.regular, fontSize: 12, marginTop: SPACING.sm },
  footer: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  saveText: { fontFamily: FONTS.bold, fontSize: 16, color: "#fff" },
});
