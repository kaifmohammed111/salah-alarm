import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import type { ColumnMap, CsvFieldKey } from "@/src/lib/prayer";
import { parseTimetableCsv } from "@/src/lib/csv";
import { readFileText } from "@/src/lib/files";
import { storage } from "@/src/utils/storage";
import TimeField from "@/src/components/TimeField";

const EDIT_KEYS: (keyof DayRow)[] = ["fajr", "sunrise", "zuhr", "asr", "maghrib", "isha"];
const K_SEEN_INSTRUCTIONS = "upload.seenInstructions";

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
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Partial<Record<CsvFieldKey, number>>>({});
  const [pickerFor, setPickerFor] = useState<ColumnMap | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (timetable && !draft) {
      setDraft(timetable);
      const t = findTodayRow(timetable, now);
      const idx = t ? timetable.rows.indexOf(t) : 0;
      setRowIdx(Math.max(0, idx));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetable]);

  // Show the instructions the first time this screen is ever opened.
  useEffect(() => {
    (async () => {
      const seen = await storage.getItem(K_SEEN_INSTRUCTIONS, "");
      if (!seen) {
        setShowInstructions(true);
        await storage.setItem(K_SEEN_INSTRUCTIONS, "1");
      }
    })();
  }, []);

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
      setCsvText(text);
      setOverrides({});
      setCsvHeaders(tt.headers || []);
      setMapping(tt.mapping || null);
      applyDraft(tt);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not parse the CSV file.");
    } finally {
      setLoading(false);
    }
  };

  const reassign = (key: CsvFieldKey, index: number | null) => {
    if (!csvText) return;
    const next = { ...overrides };
    if (index === null) delete next[key];
    else next[key] = index;
    setOverrides(next);
    setPickerFor(null);
    try {
      const tt = parseTimetableCsv(csvText, next);
      setCsvHeaders(tt.headers || []);
      setMapping(tt.mapping || null);
      applyDraft(tt);
      Haptics.selectionAsync();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not re-map the CSV file.");
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

  const openConverter = () => {
    Linking.openURL("https://tools.nanonets.com/image-to-csv");
  };

  const row = draft?.rows?.[rowIdx];

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.onSurface }]}>Timetable</Text>
            <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
              Import your monthly timetable as a CSV file
            </Text>
          </View>
          <Pressable
            testID="upload-help-btn"
            onPress={() => setShowInstructions(true)}
            hitSlop={10}
            style={styles.helpBtn}
          >
            <Ionicons name="help-circle-outline" size={26} color={colors.brand} />
          </Pressable>
        </View>
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

          <Pressable testID="have-photo-link" onPress={openConverter} style={styles.convertLink}>
            <Ionicons name="image-outline" size={16} color={colors.brand} />
            <Text style={[styles.convertLinkText, { color: colors.brand }]}>
              Have a photo or PDF instead? Convert it to CSV
            </Text>
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
                Confirm each prayer picked up the right column. Tap a row to change it.
              </Text>
              {mapping.map((m) => {
                const found = !!m.column;
                return (
                  <Pressable
                    key={m.label}
                    testID={`mapping-row-${m.key}`}
                    onPress={() => setPickerFor(m)}
                    style={[styles.mappingRow, { borderBottomColor: colors.divider }]}
                  >
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
                      <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                    </View>
                  </Pressable>
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
                    <Text style={[styles.fieldLabel, { color: colors.onSurfaceSecondary }]}>
                      {PRAYER_LABELS[k as keyof typeof PRAYER_LABELS]}
                    </Text>
                    <View style={styles.fieldInputs}>
                      <TimeField
                        testID={`edit-${k}-start`}
                        colors={colors}
                        value={pair.start || ""}
                        onChange={(v) => updateRow((r) => ({ ...r, [k]: { ...(r[k] as any), start: v } }))}
                      />
                      <TimeField
                        testID={`edit-${k}-jamaat`}
                        colors={colors}
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

      {/* Column re-assignment picker */}
      <Modal
        visible={!!pickerFor}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerFor(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerFor(null)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + SPACING.lg }]}
            onPress={() => {}}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
              Column for “{pickerFor?.label}”
            </Text>
            <Text style={[styles.modalSub, { color: colors.onSurfaceTertiary }]}>
              Choose which CSV column feeds this field.
            </Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              <Pressable
                testID="picker-autodetect"
                onPress={() => pickerFor && reassign(pickerFor.key, null)}
                style={[styles.modalOpt, { borderBottomColor: colors.divider }]}
              >
                <Ionicons name="sparkles-outline" size={16} color={colors.brand} />
                <Text style={[styles.modalOptText, { color: colors.brand }]}>Auto-detect</Text>
              </Pressable>
              {csvHeaders.map((h, i) => {
                const active = pickerFor?.index === i;
                return (
                  <Pressable
                    key={`${i}-${h}`}
                    testID={`picker-col-${i}`}
                    onPress={() => pickerFor && reassign(pickerFor.key, i)}
                    style={[styles.modalOpt, { borderBottomColor: colors.divider }]}
                  >
                    <Ionicons
                      name={active ? "radio-button-on" : "radio-button-off"}
                      size={16}
                      color={active ? colors.brand : colors.muted}
                    />
                    <Text style={[styles.modalOptText, { color: colors.onSurface }]} numberOfLines={1}>
                      {h || `(column ${i + 1})`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Instructions modal */}
      <Modal
        visible={showInstructions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInstructions(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowInstructions(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + SPACING.lg }]}
            onPress={() => {}}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>How to import your timetable</Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={styles.stepRow}>
                <View style={[styles.stepBadge, { backgroundColor: colors.brand }]}>
                  <Text style={styles.stepBadgeText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Get your timetable as a CSV</Text>
                  <Text style={[styles.stepText, { color: colors.onSurfaceTertiary }]}>
                    If your mosque already provides a CSV or spreadsheet file, you're set — skip to step 3.
                  </Text>
                </View>
              </View>
              <View style={styles.stepRow}>
                <View style={[styles.stepBadge, { backgroundColor: colors.brand }]}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Have a photo or PDF instead?</Text>
                  <Text style={[styles.stepText, { color: colors.onSurfaceTertiary }]}>
                    Use a free online converter to turn it into a CSV file first.
                  </Text>
                  <Pressable testID="instructions-convert-link" onPress={openConverter} style={styles.stepLinkBtn}>
                    <Ionicons name="open-outline" size={14} color={colors.brand} />
                    <Text style={[styles.stepLinkText, { color: colors.brand }]}>Open converter tool</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.stepRow}>
                <View style={[styles.stepBadge, { backgroundColor: colors.brand }]}>
                  <Text style={styles.stepBadgeText}>3</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Import it here</Text>
                  <Text style={[styles.stepText, { color: colors.onSurfaceTertiary }]}>
                    Tap “Import CSV file” below and select the file from your device.
                  </Text>
                </View>
              </View>
              <View style={styles.stepRow}>
                <View style={[styles.stepBadge, { backgroundColor: colors.brand }]}>
                  <Text style={styles.stepBadgeText}>4</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Check the detected columns</Text>
                  <Text style={[styles.stepText, { color: colors.onSurfaceTertiary }]}>
                    We'll show which column feeds each prayer time — tap any row to fix it if something
                    looks off, then confirm and save.
                  </Text>
                </View>
              </View>
            </ScrollView>
            <Pressable
              testID="instructions-close-btn"
              onPress={() => setShowInstructions(false)}
              style={[styles.saveBtn, { backgroundColor: colors.brand, marginTop: SPACING.lg }]}
            >
              <Text style={styles.saveText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  helpBtn: { padding: 2, marginTop: 2 },
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
  convertLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  convertLinkText: { fontFamily: FONTS.semibold, fontSize: 13 },
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(120,120,120,0.4)",
    alignSelf: "center",
    marginBottom: SPACING.md,
  },
  modalTitle: { fontFamily: FONTS.bold, fontSize: 18, marginBottom: SPACING.md },
  modalSub: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 2, marginBottom: SPACING.sm },
  modalOpt: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalOptText: { fontFamily: FONTS.medium, fontSize: 15, flex: 1 },
  stepRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.lg },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: { fontFamily: FONTS.bold, fontSize: 13, color: "#fff" },
  stepTitle: { fontFamily: FONTS.bold, fontSize: 15 },
  stepText: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 2, lineHeight: 18 },
  stepLinkBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: SPACING.sm },
  stepLinkText: { fontFamily: FONTS.semibold, fontSize: 13 },
});
