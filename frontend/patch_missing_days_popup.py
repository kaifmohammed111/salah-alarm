#!/usr/bin/env python3
"""
Patches app/(tabs)/upload.tsx:
  - Adds shared missingDaysModal state.
  - After a successful PDF or photo parse, if result.missingDays has
    entries, opens the popup instead of (or alongside) the normal result
    card.
  - Adds applyMissingDaysFix(): auto-imports the timetable (reusing the
    existing autoImportPdfResult/autoImportImageResult functions) and
    jumps rowIdx straight to the first missing day, so the existing
    per-day edit screen opens right where it's needed.
  - Adds the popup Modal UI listing the missing day numbers.

Run from the frontend/ directory:
    python3 patch_missing_days_popup.py
"""
import sys

PATH = "app/(tabs)/upload.tsx"

EDITS = [
    (
        "State: missingDaysModal",
        '''  const [imgResult, setImgResult] = useState<{ csv: string; rowCount: number } | null>(null);''',
        '''  const [imgResult, setImgResult] = useState<{ csv: string; rowCount: number } | null>(null);
  const [missingDaysModal, setMissingDaysModal] = useState<{ source: "pdf" | "img"; days: number[] } | null>(null);''',
    ),
    (
        "Trigger popup after PDF result",
        '''      setPdfDebugText(finalRawText);
      setPdfResult({ csv: result.csv, rowCount: result.rowCount });''',
        '''      setPdfDebugText(finalRawText);
      setPdfResult({ csv: result.csv, rowCount: result.rowCount });
      if (result.missingDays.length > 0) {
        setMissingDaysModal({ source: "pdf", days: result.missingDays });
      }''',
    ),
    (
        "Trigger popup after photo result",
        '''      setImgDebugText(ocrText);
      setImgResult({ csv: result.csv, rowCount: result.rowCount });''',
        '''      setImgDebugText(ocrText);
      setImgResult({ csv: result.csv, rowCount: result.rowCount });
      if (result.missingDays.length > 0) {
        setMissingDaysModal({ source: "img", days: result.missingDays });
      }''',
    ),
    (
        "Add applyMissingDaysFix handler, right before savePdfResultAsCsv",
        '''  const savePdfResultAsCsv = async () => {''',
        '''  const applyMissingDaysFix = () => {
    if (!missingDaysModal) return;
    if (missingDaysModal.source === "pdf") {
      autoImportPdfResult();
    } else {
      autoImportImageResult();
    }
    setRowIdx(Math.max(0, missingDaysModal.days[0] - 1));
    setMissingDaysModal(null);
  };

  const savePdfResultAsCsv = async () => {''',
    ),
    (
        "Popup Modal UI, placed alongside the other modals",
        '''      {/* Column re-assignment picker */}
      <Modal
        visible={showLocationPermModal}''',
        '''      {/* Missing days popup */}
      <Modal
        visible={!!missingDaysModal}
        transparent
        animationType="slide"
        onRequestClose={() => setMissingDaysModal(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setMissingDaysModal(null)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + SPACING.lg }]}
            onPress={() => {}}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Some days need review</Text>
            <Text style={[styles.modalSub, { color: colors.onSurfaceTertiary }]}>
              {missingDaysModal
                ? `We couldn't confidently read every time for ${missingDaysModal.days.length} day${
                    missingDaysModal.days.length === 1 ? "" : "s"
                  }: ${missingDaysModal.days.join(", ")}. These are still included, just with blanks where
              something couldn't be read. You can fill them in now, or come back to it later using the manual editor.`
                : ""}
            </Text>
            <Pressable
              testID="missing-days-fix-now-btn"
              onPress={applyMissingDaysFix}
              style={[styles.saveBtn, { backgroundColor: colors.brand, marginTop: SPACING.lg }]}
            >
              <Text style={styles.saveText}>Add Times Now</Text>
            </Pressable>
            <Pressable
              testID="missing-days-later-btn"
              onPress={() => setMissingDaysModal(null)}
              style={{ alignItems: "center", paddingVertical: SPACING.md }}
            >
              <Text style={{ color: colors.muted, fontFamily: FONTS.semibold, fontSize: 14 }}>I'll do this later</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Column re-assignment picker */}
      <Modal
        visible={showLocationPermModal}''',
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
