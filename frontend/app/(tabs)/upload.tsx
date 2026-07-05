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
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { DayRow, PRAYER_LABELS, Timetable, findTodayRow } from "@/src/lib/prayer";
import type { ColumnMap } from "@/src/lib/prayer";
import { parseTimetableCsv } from "@/src/lib/csv";
import { readFileText } from "@/src/lib/files";

const EDIT_KEYS: (keyof DayRow)[] = ["fajr", "sunrise", "zuhr", "asr", "maghrib", "isha"];

export default function UploadScreen() {
  const { colors, timetable, saveTimetable, now } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Parsing CSV…");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Timetable | null>(null);
  const [rowIdx, setRowIdx] = useState(0);
  const [saved, setSaved] = useState(false);
  const [mapping, setMapping] = useState<ColumnMap[] | null>(null);

  useEffect(() => {
    if (timetable && !draft) {
      setDraft(timetable);
      const t = findTodayRow(timetable, now);
      const idx = t ? timetable.rows.indexOf(t) : 0;
      setRowIdx(Math.max(0, idx));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetable]);

  const applyDraft = (tt: Timetable) => {
    setDraft(tt);
    const t = findTodayRow(tt, now);
    const idx = t ? tt.rows.indexOf(t) : 0;
    setRowIdx(Math.max(0, idx));
  };

  const pickCsv = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "text/plain", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setFileName(asset.name || "timetable.csv");
    setLoading(true);
    setLoadingLabel("Parsing CSV…");
    setError(null);
    setSaved(false);
    try {
      const text = await readFileText(asset.uri);
      const tt = parseTimetableCsv(text);
      setMapping(tt.mapping || null);
      applyDraft(tt);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not parse the CSV file.");
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (mut: (r: DayRow) => DayRow) => {
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
    setTimeout(() => router.push("/"), 600);
  };

  const row = draft?.rows?.[rowIdx];

  const TimeField = ({
    value,
    onChange,
    testID,
  }: {
    value: string;
    onChange: (v: string) => void;
    testID: string;
  }) => (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChange}
      placeholder="--:--"
      placeholderTextColor={colors.muted}
      maxLength={5}
      keyboardType="numbers-and-punctuation"
      style={[
        styles.input,
        { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border },
      ]}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Timetable</Text>
        <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
          Import your monthly timetable as a CSV file
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
        >
          {/* CSV import */}
          {fileName ? (
            <View style={[styles.placeholder, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Ionicons name="grid-outline" size={40} color={colors.brand} />
              <Text style={[styles.placeholderText, { color: colors.onSurface }]}>{fileName}</Text>
            </View>
          ) : (
            <View style={[styles.placeholder, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Ionicons name="document-attach-outline" size={40} color={colors.muted} />
              <Text style={[styles.placeholderText, { color: colors.onSurfaceTertiary }]}>
                No CSV file selected
              </Text>
            </View>
          )}

          <Pressable
            testID="pick-csv-btn"
            onPress={pickCsv}
            style={[styles.csvBtn, { backgroundColor: colors.brand }]}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={colors.onBrandPrimary} />
            <Text style={[styles.csvBtnText, { color: colors.onBrandPrimary }]}>Import CSV file</Text>
          </Pressable>

          <View style={[styles.formatBox, { backgroundColor: colors.brandTertiary }]}>
            <Text style={[styles.formatTitle, { color: colors.onBrandTertiary }]}>Expected CSV columns</Text>
            <Text style={[styles.formatText, { color: colors.onBrandTertiary }]}>
              Day, Date, Hijri, Fajr Start, Fajr Jamaat, Sunrise, Zuhr Start, Zuhr Jamaat, Asr Start, Asr Jamaat, Maghrib, Isha Start, Isha Jamaat
            </Text>
            <Text style={[styles.formatText, { color: colors.onBrandTertiary, marginTop: SPACING.sm }]}>
              Ramadan timetables are detected automatically — just add “Sehri End” and “Iftari” columns.
            </Text>
          </View>

          <Pressable
            testID="manual-editor-link"
            onPress={() => router.push("/editor")}
            style={styles.manualLink}
          >
            <Ionicons name="create-outline" size={16} color={colors.brand} />
            <Text style={[styles.manualLinkText, { color: colors.brand }]}>Or enter times manually</Text>
          </Pressable>

          {loading ? (
            <View style={styles.loadingBox}>
              <Ionicons name="scan-outline" size={22} color={colors.brand} />
              <Text style={[styles.loadingText, { color: colors.onSurface }]}>{loadingLabel}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: "#FEE2E2" }]} testID="ocr-error">
              <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          {/* Detected column mapping — sanity-check for non-standard CSVs */}
          {mapping && !error ? (
            <View
              testID="mapping-card"
              style={[styles.mappingCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <View style={styles.mappingHead}>
                <Ionicons name="git-compare-outline" size={16} color={colors.brand} />
                <Text style={[styles.mappingTitle, { color: colors.onSurface }]}>Detected columns</Text>
              </View>
              <Text style={[styles.mappingHint, { color: colors.onSurfaceTertiary }]}>
                Confirm each prayer picked up the right column from your file.
              </Text>
              {mapping.map((m) => {
                const found = !!m.column;
                return (
                  <View key={m.label} style={[styles.mappingRow, { borderBottomColor: colors.divider }]}>
                    <Text style={[styles.mappingLabel, { color: colors.onSurfaceSecondary }]}>{m.label}</Text>
                    <View style={styles.mappingRight}>
                      <Ionicons
                        name={found ? "checkmark-circle" : "remove-circle-outline"}
                        size={15}
                        color={found ? colors.success : colors.muted}
                      />
                      <Text
                        style={[
                          styles.mappingCol,
                          { color: found ? colors.onSurface : colors.muted },
                        ]}
                        numberOfLines={1}
                      >
                        {m.column || "Not found"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Edit form */}
          {row ? (
            <View style={styles.form}>
              <Text style={[styles.formTitle, { color: colors.onSurface }]}>
                Review times {row.date ? `· Day ${row.date}` : ""} {row.hijri ? `· ${row.hijri}` : ""}
              </Text>
              {EDIT_KEYS.map((k) => {
                if (k === "sunrise") {
                  return (
                    <View key={k} style={styles.fieldRow}>
                      <Text style={[styles.fieldLabel, { color: colors.onSurfaceSecondary }]}>Sunrise</Text>
                      <View style={styles.fieldInputs}>
                        <TimeField
                          testID="edit-sunrise"
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
                    <Text style={[styles.fieldLabel, { color: colors.onSurfaceSecondary }]}>
                      {PRAYER_LABELS[k as keyof typeof PRAYER_LABELS]}
                    </Text>
                    <View style={styles.fieldInputs}>
                      <TimeField
                        testID={`edit-${k}-start`}
                        value={pair.start || ""}
                        onChange={(v) => updateRow((r) => ({ ...r, [k]: { ...(r[k] as any), start: v } }))}
                      />
                      <TimeField
                        testID={`edit-${k}-jamaat`}
                        value={pair.jamaat || ""}
                        onChange={(v) => updateRow((r) => ({ ...r, [k]: { ...(r[k] as any), jamaat: v } }))}
                      />
                    </View>
                  </View>
                );
              })}
              <Text style={[styles.hint, { color: colors.muted }]}>
                Left = Start · Right = Jamaat. Use 24-hour HH:MM.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {row ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Pressable
              testID="confirm-save-btn"
              onPress={onSave}
              style={[styles.saveBtn, { backgroundColor: saved ? colors.success : colors.brand }]}
            >
              <Ionicons name={saved ? "checkmark" : "save-outline"} size={18} color="#fff" />
              <Text style={styles.saveText}>{saved ? "Saved!" : "Confirm & Save"}</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: FONTS.bold, fontSize: 26 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 2 },
  preview: { width: "100%", height: 180, borderRadius: RADIUS.lg },
  placeholder: {
    width: "100%",
    height: 160,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  placeholderText: { fontFamily: FONTS.medium, fontSize: 13 },
  csvBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    marginTop: SPACING.md,
  },
  csvBtnText: { fontFamily: FONTS.bold, fontSize: 15 },
  formatBox: { padding: SPACING.lg, borderRadius: RADIUS.md, marginTop: SPACING.lg },
  formatTitle: { fontFamily: FONTS.bold, fontSize: 13, marginBottom: SPACING.xs },
  formatText: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 18 },
  manualLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    marginTop: SPACING.lg,
  },
  manualLinkText: { fontFamily: FONTS.semibold, fontSize: 14 },
  loadingBox: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.lg },
  loadingText: { fontFamily: FONTS.medium, fontSize: 14 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
  },
  errorText: { fontFamily: FONTS.medium, fontSize: 13, flex: 1 },
  mappingCard: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  mappingHead: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  mappingTitle: { fontFamily: FONTS.bold, fontSize: 14 },
  mappingHint: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2, marginBottom: SPACING.sm },
  mappingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.md,
  },
  mappingLabel: { fontFamily: FONTS.semibold, fontSize: 13, flexShrink: 0 },
  mappingRight: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, flexShrink: 1, maxWidth: "60%" },
  mappingCol: { fontFamily: FONTS.medium, fontSize: 13 },
  form: { marginTop: SPACING.xl },
  formTitle: { fontFamily: FONTS.bold, fontSize: 16, marginBottom: SPACING.md },
  fieldRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md },
  fieldLabel: { fontFamily: FONTS.semibold, fontSize: 15, flex: 1 },
  fieldInputs: { flexDirection: "row", gap: SPACING.sm },
  input: {
    width: 76,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    textAlign: "center",
  },
  hint: { fontFamily: FONTS.regular, fontSize: 12, marginTop: SPACING.sm },
  footer: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
