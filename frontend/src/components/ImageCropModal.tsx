import React, { useEffect, useRef, useState } from "react";
import { Dimensions, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";

const SCREEN_W = Dimensions.get("window").width;
const HANDLE_SIZE = 28;
const MIN_CROP = 60;

export type ImageCropModalProps = {
  visible: boolean;
  imageUri: string | null;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
};

type Rect = { x: number; y: number; width: number; height: number };
type Corner = "tl" | "tr" | "bl" | "br";

// Full-screen crop tool: lets the user drag the crop rectangle's corners
// (to resize) or its interior (to reposition) over the picked image, then
// produces a genuinely cropped image file via expo-image-manipulator —
// this is what actually gets sent to OCR, not just a visual preview.
// Built for exactly one real use case: letting the user crop a
// multi-column poster down to just the timetable region themselves,
// rather than the app trying to auto-detect where the table is.
export default function ImageCropModal({ visible, imageUri, onCancel, onConfirm }: ImageCropModalProps) {
  const insets = useSafeAreaInsets();
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [displayArea, setDisplayArea] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [processing, setProcessing] = useState(false);
  const rectRef = useRef<Rect | null>(null);
  // Each drag (a corner, or moving the whole rect) needs its OWN starting
  // rect snapshot, taken at the moment that specific gesture begins —
  // gesture.dx/dy from PanResponder are relative to that gesture's start,
  // not absolute, so without this a drag would jump/compound incorrectly.
  const dragStartRects = useRef<Record<string, Rect>>({});

  useEffect(() => {
    rectRef.current = rect;
  }, [rect]);

  useEffect(() => {
    if (!visible || !imageUri) {
      setSourceSize(null);
      setDisplayArea(null);
      setRect(null);
      return;
    }
    Image.getSize(
      imageUri,
      (w, h) => {
        setSourceSize({ width: w, height: h });
        const maxW = SCREEN_W - 32;
        const maxH = Dimensions.get("window").height - insets.top - insets.bottom - 220;
        const scale = Math.min(maxW / w, maxH / h);
        const dw = w * scale;
        const dh = h * scale;
        setDisplayArea({ width: dw, height: dh });
        // Default crop starts as the full image — the user narrows it
        // in, rather than guessing a smaller default that might not
        // match this particular photo's layout at all.
        setRect({ x: 0, y: 0, width: dw, height: dh });
      },
      () => {
        setSourceSize(null);
      },
    );
  }, [visible, imageUri, insets.top, insets.bottom]);

  const clampRect = (r: Rect): Rect => {
    if (!displayArea) return r;
    let { x, y, width, height } = r;
    width = Math.max(MIN_CROP, Math.min(width, displayArea.width));
    height = Math.max(MIN_CROP, Math.min(height, displayArea.height));
    x = Math.max(0, Math.min(x, displayArea.width - width));
    y = Math.max(0, Math.min(y, displayArea.height - height));
    return { x, y, width, height };
  };

  const applyCornerDrag = (corner: Corner, start: Rect, dx: number, dy: number): Rect => {
    const next = { ...start };
    if (corner === "tl") {
      next.x = start.x + dx;
      next.y = start.y + dy;
      next.width = start.width - dx;
      next.height = start.height - dy;
    } else if (corner === "tr") {
      next.y = start.y + dy;
      next.width = start.width + dx;
      next.height = start.height - dy;
    } else if (corner === "bl") {
      next.x = start.x + dx;
      next.width = start.width - dx;
      next.height = start.height + dy;
    } else {
      next.width = start.width + dx;
      next.height = start.height + dy;
    }
    return next;
  };

  const makeCornerResponder = (corner: Corner) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (rectRef.current) dragStartRects.current[corner] = rectRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const start = dragStartRects.current[corner];
        if (!start) return;
        setRect(clampRect(applyCornerDrag(corner, start, gesture.dx, gesture.dy)));
      },
    });

  const cornerResponders = useRef({
    tl: makeCornerResponder("tl"),
    tr: makeCornerResponder("tr"),
    bl: makeCornerResponder("bl"),
    br: makeCornerResponder("br"),
  }).current;

  const moveResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (rectRef.current) dragStartRects.current.move = rectRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const start = dragStartRects.current.move;
        if (!start) return;
        setRect(clampRect({ ...start, x: start.x + gesture.dx, y: start.y + gesture.dy }));
      },
    }),
  ).current;

  const handleConfirm = async () => {
    if (!imageUri || !sourceSize || !displayArea || !rect) return;
    setProcessing(true);
    try {
      const scaleX = sourceSize.width / displayArea.width;
      const scaleY = sourceSize.height / displayArea.height;
      const cropRegion = {
        originX: Math.round(rect.x * scaleX),
        originY: Math.round(rect.y * scaleY),
        width: Math.round(rect.width * scaleX),
        height: Math.round(rect.height * scaleY),
      };
      const result = await ImageManipulator.manipulateAsync(imageUri, [{ crop: cropRegion }], {
        compress: 1,
        format: ImageManipulator.SaveFormat.PNG,
      });
      onConfirm(result.uri);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Crop to the timetable</Text>
          <Text style={styles.headerSub}>Drag the corners to select just the table — leave out ads or side text</Text>
        </View>

        <View style={styles.imageWrap}>
          {imageUri && displayArea ? (
            <View style={{ width: displayArea.width, height: displayArea.height }}>
              <Image
                source={{ uri: imageUri }}
                style={{ width: displayArea.width, height: displayArea.height }}
                resizeMode="contain"
              />
              {rect ? (
                <>
                  {/* Darken everything outside the crop rect */}
                  <View style={[styles.dim, { left: 0, top: 0, width: displayArea.width, height: rect.y }]} />
                  <View
                    style={[
                      styles.dim,
                      {
                        left: 0,
                        top: rect.y + rect.height,
                        width: displayArea.width,
                        height: displayArea.height - rect.y - rect.height,
                      },
                    ]}
                  />
                  <View style={[styles.dim, { left: 0, top: rect.y, width: rect.x, height: rect.height }]} />
                  <View
                    style={[
                      styles.dim,
                      {
                        left: rect.x + rect.width,
                        top: rect.y,
                        width: displayArea.width - rect.x - rect.width,
                        height: rect.height,
                      },
                    ]}
                  />

                  <View
                    {...moveResponder.panHandlers}
                    style={[styles.cropBorder, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]}
                  />

                  {(["tl", "tr", "bl", "br"] as const).map((corner) => {
                    const style =
                      corner === "tl"
                        ? { left: rect.x - HANDLE_SIZE / 2, top: rect.y - HANDLE_SIZE / 2 }
                        : corner === "tr"
                        ? { left: rect.x + rect.width - HANDLE_SIZE / 2, top: rect.y - HANDLE_SIZE / 2 }
                        : corner === "bl"
                        ? { left: rect.x - HANDLE_SIZE / 2, top: rect.y + rect.height - HANDLE_SIZE / 2 }
                        : { left: rect.x + rect.width - HANDLE_SIZE / 2, top: rect.y + rect.height - HANDLE_SIZE / 2 };
                    return <View key={corner} {...cornerResponders[corner].panHandlers} style={[styles.handle, style]} />;
                  })}
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable testID="crop-cancel-btn" onPress={onCancel} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Skip Crop</Text>
          </Pressable>
          <Pressable
            testID="crop-confirm-btn"
            onPress={handleConfirm}
            disabled={processing}
            style={[styles.primaryBtn, processing && { opacity: 0.6 }]}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>{processing ? "Cropping…" : "Use This Crop"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  headerSub: { color: "#aaa", fontSize: 12, marginTop: 4 },
  imageWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  cropBorder: { position: "absolute", borderWidth: 2, borderColor: "#fff" },
  handle: {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#2563EB",
  },
  footer: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222",
  },
  secondaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
