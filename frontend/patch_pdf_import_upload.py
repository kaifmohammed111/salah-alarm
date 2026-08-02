#!/usr/bin/env python3
"""
Patches app/(tabs)/upload.tsx to add an offline PDF-to-CSV converter:
  - New imports (expo-file-system, readFileBase64, HiddenPdfExtractor,
    parseTimetablePdfText).
  - New state for PDF loading/result.
  - pickPdf() / savePdfResultAsCsv() / autoImportPdfResult() functions.
  - Mounts <HiddenPdfExtractor> (invisible) in the tree.
  - New "Import PDF timetable (offline)" button + result card with
    "Save as CSV" / "Auto Import" buttons, placed right after the existing
    "Have a photo or PDF instead?" external-converter link.

Run from the frontend/ directory, AFTER copying in the new files listed in
the setup instructions:
    python3 patch_pdf_import_upload.py
"""
import sys

PATH = "app/(tabs)/upload.tsx"

EDITS = [
    (
        "Import: expo-file-system",
        '''import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";''',
        '''import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";''',
    ),
    (
        "Import: readFileBase64, HiddenPdfExtractor, timetablePdfParser",
        '''import { readFileText } from "@/src/lib/files";''',
        '''import { readFileBase64, readFileText } from "@/src/lib/files";
import HiddenPdfExtractor, { HiddenPdfExtractorHandle } from "@/src/components/HiddenPdfExtractor";
import { parseTimetablePdfText } from "@/src/lib/timetablePdfParser";''',
    ),
    (
        "State: PDF import",
        '''  const [showInstructions, setShowInstructions] = useState(false);''',
        '''  const [showInstructions, setShowInstructions] = useState(false);
  const pdfExtractorRef = useRef<HiddenPdfExtractorHandle>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<{ csv: string; rowCount: number } | null>(null);
  const [pdfSaved, setPdfSaved] = useState(false);''',
    ),
    (
        "Functions: pickPdf / savePdfResultAsCsv / autoImportPdfResult",
        '''  const openConverter = () => {
    Linking.openURL("https://tools.nanonets.com/image-to-csv");
  };''',
        '''  const openConverter = () => {
    Linking.openURL("https://tools.nanonets.com/image-to-csv");
  };

  // Fully offline: PDF bytes never leave the device — extraction runs in a
  // hidden local WebView (see HiddenPdfExtractor), no server/API involved.
  const pickPdf = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setPdfFileName(asset.name || "timetable.pdf");
    setPdfResult(null);
    setPdfSaved(false);
    setError(null);
    setPdfLoading(true);
    try {
      setLoadingLabel("Reading PDF…");
      const base64 = await readFileBase64(asset.uri);
      setLoadingLabel("Extracting text…");
      const rawText = await pdfExtractorRef.current?.extractText(base64);
      if (!rawText) throw new Error("Could not read this PDF's text.");
      setLoadingLabel("Detecting timetable rows…");
      const result = parseTimetablePdfText(rawText);
      if (result.rowCount === 0) {
        throw new Error(
          "Couldn't detect any timetable rows in this PDF. It may use a layout this converter doesn't recognize yet.",
        );
      }
      setPdfResult({ csv: result.csv, rowCount: result.rowCount });
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not convert this PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  const savePdfResultAsCsv = async () => {
    if (!pdfResult) return;
    try {
      const dir = `${FileSystem.documentDirectory}timetables/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const safeName = (pdfFileName || "timetable").replace(/\\.pdf$/i, "").replace(/[^a-zA-Z0-9-_]/g, "_");
      const path = `${dir}${safeName}.csv`;
      await FileSystem.writeAsStringAsync(path, pdfResult.csv, { encoding: FileSystem.EncodingType.UTF8 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPdfSaved(true);
      setTimeout(() => setPdfSaved(false), 2500);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not save the CSV file.");
    }
  };

  const autoImportPdfResult = () => {
    if (!pdfResult) return;
    try {
      const tt = parseTimetableCsv(pdfResult.csv);
      setFileName(pdfFileName ? pdfFileName.replace(/\\.pdf$/i, ".csv") : "timetable.csv");
      setCsvText(pdfResult.csv);
      setOverrides({});
      setCsvHeaders(tt.headers || []);
      setMapping(tt.mapping || null);
      applyDraft(tt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not import the converted timetable.");
    }
  };''',
    ),
    (
        "Mount HiddenPdfExtractor",
        '''      </View>

      <KeyboardAvoidingView''',
        '''      </View>

      <HiddenPdfExtractor ref={pdfExtractorRef} />

      <KeyboardAvoidingView''',
    ),
    (
        "UI: Import PDF button + result card",
        '''          <Pressable testID="have-photo-link" onPress={openConverter} style={styles.convertLink}>
            <Ionicons name="image-outline" size={16} color={colors.brand} />
            <Text style={[styles.convertLinkText, { color: colors.brand }]}>
              Have a photo or PDF instead? Convert it to CSV
            </Text>
          </Pressable>''',
        '''          <Pressable testID="have-photo-link" onPress={openConverter} style={styles.convertLink}>
            <Ionicons name="image-outline" size={16} color={colors.brand} />
            <Text style={[styles.convertLinkText, { color: colors.brand }]}>
              Have a photo or PDF instead? Convert it to CSV
            </Text>
          </Pressable>

          <Pressable
            testID="pick-pdf-btn"
            onPress={pickPdf}
            style={[
              styles.csvBtn,
              { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brand, marginTop: SPACING.sm },
            ]}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.brand} />
            <Text style={[styles.csvBtnText, { color: colors.brand }]}>Import PDF timetable (offline)</Text>
          </Pressable>

          {pdfLoading ? (
            <View style={styles.loadingBox}>
              <Ionicons name="scan-outline" size={22} color={colors.brand} />
              <Text style={[styles.loadingText, { color: colors.onSurface }]}>{loadingLabel}</Text>
            </View>
          ) : null}

          {pdfResult ? (
            <View
              testID="pdf-result-card"
              style={[styles.mappingCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <View style={styles.mappingHead}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.mappingTitle, { color: colors.onSurface }]}>
                  Detected {pdfResult.rowCount} day{pdfResult.rowCount === 1 ? "" : "s"} in {pdfFileName}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                <Pressable
                  testID="pdf-save-csv-btn"
                  onPress={savePdfResultAsCsv}
                  style={[
                    styles.csvBtn,
                    {
                      flex: 1,
                      marginTop: 0,
                      backgroundColor: pdfSaved ? colors.success : colors.surface,
                      borderWidth: 1,
                      borderColor: colors.brand,
                    },
                  ]}
                >
                  <Ionicons name={pdfSaved ? "checkmark" : "save-outline"} size={16} color={pdfSaved ? "#fff" : colors.brand} />
                  <Text style={[styles.csvBtnText, { color: pdfSaved ? "#fff" : colors.brand, fontSize: 13 }]}>
                    {pdfSaved ? "Saved!" : "Save as CSV"}
                  </Text>
                </Pressable>
                <Pressable
                  testID="pdf-auto-import-btn"
                  onPress={autoImportPdfResult}
                  style={[styles.csvBtn, { flex: 1, marginTop: 0, backgroundColor: colors.brand }]}
                >
                  <Ionicons name="download-outline" size={16} color={colors.onBrandPrimary} />
                  <Text style={[styles.csvBtnText, { color: colors.onBrandPrimary, fontSize: 13 }]}>Auto Import</Text>
                </Pressable>
              </View>
            </View>
          ) : null}''',
    ),
]

def main():
    with open(PATH, "r", encoding="utf-8") as f:
        content = f.read()

    for name, old, new in EDITS:
        count = content.count(old)
        if count != 1:
            print(f"MISMATCH on edit '{name}': expected exactly 1 occurrence of the old text, found {count}.")
            print("Aborting. NO changes have been written to the file.")
            sys.exit(1)
        content = content.replace(old, new, 1)
        print(f"OK: applied '{name}'")

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"\nAll edits applied successfully to {PATH}")

if __name__ == "__main__":
    main()
