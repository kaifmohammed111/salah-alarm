#!/usr/bin/env python3
"""
Patches app/(tabs)/upload.tsx:
  - Imports ImageCropModal.
  - Adds state to hold the picked (pre-crop) image URI and show the crop
    modal.
  - Splits pickImage() into two steps: picking a file just opens the crop
    modal now; the actual OCR run happens in a new runOcrOnImage(uri)
    function, called either after the user confirms a crop or cancels
    cropping (using the original uncropped image in that case).
  - Mounts <ImageCropModal> in the tree.

Run from the frontend/ directory:
    python3 patch_image_crop.py
"""
import sys

PATH = "app/(tabs)/upload.tsx"

EDITS = [
    (
        "Import ImageCropModal",
        '''import HiddenPdfExtractor, { HiddenPdfExtractorHandle } from "@/src/components/HiddenPdfExtractor";''',
        '''import HiddenPdfExtractor, { HiddenPdfExtractorHandle } from "@/src/components/HiddenPdfExtractor";
import ImageCropModal from "@/src/components/ImageCropModal";''',
    ),
    (
        "State: crop modal",
        '''  const [imgDebugText, setImgDebugText] = useState<string | null>(null);''',
        '''  const [imgDebugText, setImgDebugText] = useState<string | null>(null);
  const [cropModalUri, setCropModalUri] = useState<string | null>(null);''',
    ),
    (
        "Split pickImage into pick+crop / runOcrOnImage",
        '''  const pickImage = async () => {
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
      const base64 = await readFileBase64(asset.uri);''',
        '''  const pickImage = async () => {
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
    // Open the crop tool first — OCR only runs once the user confirms a
    // crop (or explicitly skips cropping), not immediately on pick.
    setCropModalUri(asset.uri);
  };

  const runOcrOnImage = async (uri: string) => {
    setError(null);
    setImgLoading(true);
    try {
      setLoadingLabel("Reading photo…");
      const base64 = await readFileBase64(uri);''',
    ),
    (
        "Mount ImageCropModal + wire confirm/cancel",
        '''      <HiddenPdfExtractor ref={pdfExtractorRef} />''',
        '''      <HiddenPdfExtractor ref={pdfExtractorRef} />

      <ImageCropModal
        visible={!!cropModalUri}
        imageUri={cropModalUri}
        onCancel={() => {
          const uri = cropModalUri;
          setCropModalUri(null);
          // "Cancel" skips cropping rather than aborting the import —
          // falls back to running OCR on the original, uncropped photo.
          if (uri) runOcrOnImage(uri);
        }}
        onConfirm={(croppedUri) => {
          setCropModalUri(null);
          runOcrOnImage(croppedUri);
        }}
      />''',
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
