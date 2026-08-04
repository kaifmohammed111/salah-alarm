#!/usr/bin/env python3
"""
Patches app/(tabs)/upload.tsx:
  - Adds pdfDebugText state, captures whichever raw text (text-layer or
    OCR) actually got parsed into the result.
  - Renders it as selectable (long-press to copy) text inside the result
    card, so it's visible directly in the app — no logcat, no adb, no
    build-config assumptions about whether console.log survives in this
    build profile.

Run from the frontend/ directory:
    python3 patch_ocr_debug_onscreen.py
"""
import sys

PATH = "app/(tabs)/upload.tsx"

EDITS = [
    (
        "State: pdfDebugText",
        '''  const [pdfSaved, setPdfSaved] = useState(false);''',
        '''  const [pdfSaved, setPdfSaved] = useState(false);
  const [pdfDebugText, setPdfDebugText] = useState<string | null>(null);''',
    ),
    (
        "Reset pdfDebugText when starting a new pick",
        '''    setPdfFileName(asset.name || "timetable.pdf");
    setPdfResult(null);
    setPdfSaved(false);''',
        '''    setPdfFileName(asset.name || "timetable.pdf");
    setPdfResult(null);
    setPdfSaved(false);
    setPdfDebugText(null);''',
    ),
    (
        "Track finalRawText starting from the text-layer result",
        '''      setLoadingLabel("Detecting timetable rows…");
      let result = parseTimetablePdfText(rawText);''',
        '''      setLoadingLabel("Detecting timetable rows…");
      let result = parseTimetablePdfText(rawText);
      let finalRawText = rawText;''',
    ),
    (
        "Update finalRawText when OCR fallback runs",
        '''        result = parseTimetablePdfText(ocrText);
        console.log(`[PDF OCR DEBUG] parsed rowCount=${result.rowCount}`);
      }''',
        '''        result = parseTimetablePdfText(ocrText);
        console.log(`[PDF OCR DEBUG] parsed rowCount=${result.rowCount}`);
        finalRawText = ocrText;
      }''',
    ),
    (
        "Store finalRawText before showing the result",
        '''      if (result.rowCount === 0) {
        throw new Error(
          "Couldn't detect any timetable rows in this PDF, even with OCR. It may use a layout this converter doesn't recognize yet.",
        );
      }
      setPdfResult({ csv: result.csv, rowCount: result.rowCount });''',
        '''      if (result.rowCount === 0) {
        throw new Error(
          "Couldn't detect any timetable rows in this PDF, even with OCR. It may use a layout this converter doesn't recognize yet.",
        );
      }
      setPdfDebugText(finalRawText);
      setPdfResult({ csv: result.csv, rowCount: result.rowCount });''',
    ),
    (
        "Render raw text on-screen inside the result card",
        '''              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                <Pressable
                  testID="pdf-save-csv-btn"''',
        '''              {pdfDebugText ? (
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
                      {pdfDebugText}
                    </Text>
                  </ScrollView>
                </View>
              ) : null}

              <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
                <Pressable
                  testID="pdf-save-csv-btn"''',
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
