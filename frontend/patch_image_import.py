#!/usr/bin/env python3
"""
Patches app/(tabs)/upload.tsx:
  - Adds pickImage(): lets the user pick a JPG/PNG photo of a timetable
    and runs it straight through the same on-device OCR + row-alignment
    parser already used for image-only PDFs — no PDF/WebView step needed
    since there's no page to render, just the picked image itself.
  - Adds state for the image import (separate from the PDF state, since
    it's a distinct button/flow).
  - Adds a new "Import photo timetable (offline)" button below the
    existing PDF one, with its own result card (Save as CSV / Auto
    Import) and debug text box, mirroring the PDF flow.

Run from the frontend/ directory:
    python3 patch_image_import.py
"""
import sys

PATH = "app/(tabs)/upload.tsx"

EDITS = [
    (
        "State: image import",
        '''  const [pdfDebugText, setPdfDebugText] = useState<string | null>(null);''',
        '''  const [pdfDebugText, setPdfDebugText] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgFileName, setImgFileName] = useState<string | null>(null);
  const [imgResult, setImgResult] = useState<{ csv: string; rowCount: number } | null>(null);
  const [imgSaved, setImgSaved] = useState(false);
  const [imgDebugText, setImgDebugText] = useState<string | null>(null);''',
    ),
    (
        "Add pickImage / saveImageResultAsCsv / autoImportImageResult functions",
        '''  const savePdfResultAsCsv = async () => {''',
        '''  // Fully offline: same on-device OCR + row-alignment parser used for
  // image-only PDFs, applied directly to a picked photo — no PDF/WebView
  // rendering step needed since there's no page to render.
  const pickImage = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/jpg", "image/png"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setImgFileName(asset.name || "timetable.jpg");
    setImgResult(null);
    setImgSaved(false);
    setImgDebugText(null);
    setError(null);
    setImgLoading(true);
    try {
      setLoadingLabel("Reading photo…");
      const base64 = await readFileBase64(asset.uri);
      setLoadingLabel("Reading text with on-device OCR…");
      const ocrText = await recognizePageImage(base64);
      setLoadingLabel("Detecting timetable rows…");
      const result = parseTimetablePdfText(ocrText);
      if (result.rowCount === 0) {
        throw new Error(
          "Couldn't detect any timetable rows in this photo. Try a clearer, more evenly-lit photo taken straight-on.",
        );
      }
      setImgDebugText(ocrText);
      setImgResult({ csv: result.csv, rowCount: result.rowCount });
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not convert this photo.");
    } finally {
      setImgLoading(false);
    }
  };

  const saveImageResultAsCsv = async () => {
    if (!imgResult) return;
    try {
      const dir = `${FileSystem.documentDirectory}timetables/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const safeName = (imgFileName || "timetable").replace(/\\.(jpe?g|png)$/i, "").replace(/[^a-zA-Z0-9-_]/g, "_");
      const path = `${dir}${safeName}.csv`;
      await FileSystem.writeAsStringAsync(path, imgResult.csv, { encoding: FileSystem.EncodingType.UTF8 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setImgSaved(true);
      setTimeout(() => setImgSaved(false), 2500);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not save the CSV file.");
    }
  };

  const autoImportImageResult = () => {
    if (!imgResult) return;
    try {
      const tt = parseTimetableCsv(imgResult.csv);
      setFileName(imgFileName ? imgFileName.replace(/\\.(jpe?g|png)$/i, ".csv") : "timetable.csv");
      setCsvText(imgResult.csv);
      setOverrides({});
      setCsvHeaders(tt.headers || []);
      setMapping(tt.mapping || null);
      applyDraft(tt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not import the converted timetable.");
    }
  };

  const savePdfResultAsCsv = async () => {''',
    ),
    (
        "UI: Import photo button + result card, after the PDF button",
        '''            <Ionicons name="document-text-outline" size={18} color={colors.brand} />
            <Text style={[styles.csvBtnText, { color: colors.brand }]}>Import PDF timetable (offline)</Text>
          </Pressable>
''',
        '''            <Ionicons name="document-text-outline" size={18} color={colors.brand} />
            <Text style={[styles.csvBtnText, { color: colors.brand }]}>Import PDF timetable (offline)</Text>
          </Pressable>

          <Pressable
            testID="pick-image-btn"
            onPress={pickImage}
            style={[
              styles.csvBtn,
              { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brand, marginTop: SPACING.sm },
            ]}
          >
            <Ionicons name="camera-outline" size={18} color={colors.brand} />
            <Text style={[styles.csvBtnText, { color: colors.brand }]}>Import photo timetable (offline)</Text>
          </Pressable>

          {imgLoading ? (
            <View style={styles.loadingBox}>
              <Ionicons name="scan-outline" size={22} color={colors.brand} />
              <Text style={[styles.loadingText, { color: colors.onSurface }]}>{loadingLabel}</Text>
            </View>
          ) : null}

          {imgResult ? (
            <View
              testID="img-result-card"
              style={[styles.mappingCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <View style={styles.mappingHead}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.mappingTitle, { color: colors.onSurface }]}>
                  Detected {imgResult.rowCount} day{imgResult.rowCount === 1 ? "" : "s"} in {imgFileName}
                </Text>
              </View>
              {imgDebugText ? (
                <View style={{ marginTop: SPACING.md, maxHeight: 220 }}>
                  <Text style={[styles.mappingHint, { color: colors.onSurfaceTertiary, marginBottom: 4 }]}>
                    Raw text used (debug — long-press to select/copy):
                  </Text>
                  <ScrollView
                    style={{
                      maxHeight: 180,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: colors.border,
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <Text selectable style={{ fontSize: 11, color: colors.onSurfaceSecondary, fontFamily: "monospace" as any }}>
                      {imgDebugText}
                    </Text>
                  </ScrollView>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                <Pressable
                  testID="img-save-csv-btn"
                  onPress={saveImageResultAsCsv}
                  style={[
                    styles.csvBtn,
                    {
                      flex: 1,
                      marginTop: 0,
                      backgroundColor: imgSaved ? colors.success : colors.surface,
                      borderWidth: 1,
                      borderColor: colors.brand,
                    },
                  ]}
                >
                  <Ionicons name={imgSaved ? "checkmark" : "save-outline"} size={16} color={imgSaved ? "#fff" : colors.brand} />
                  <Text style={[styles.csvBtnText, { color: imgSaved ? "#fff" : colors.brand, fontSize: 13 }]}>
                    {imgSaved ? "Saved!" : "Save as CSV"}
                  </Text>
                </Pressable>
                <Pressable
                  testID="img-auto-import-btn"
                  onPress={autoImportImageResult}
                  style={[styles.csvBtn, { flex: 1, marginTop: 0, backgroundColor: colors.brand }]}
                >
                  <Ionicons name="download-outline" size={16} color={colors.onBrandPrimary} />
                  <Text style={[styles.csvBtnText, { color: colors.onBrandPrimary, fontSize: 13 }]}>Auto Import</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
''',
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
