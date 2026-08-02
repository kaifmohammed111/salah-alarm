import React from "react";
import { Image, StyleSheet } from "react-native";

// Real illustrated figures (transparent PNGs, Hanafi hand positions)
// replacing the earlier simple SVG line-art placeholders. Each pose is a
// separate image rather than one parameterized drawing — these are
// specific illustrations, not geometric shapes that can be redrawn with
// different parameters.
export type PrayerPose =
  | "niyyah"
  | "takbir"
  | "standing-navel"
  | "standing-chest"
  | "ruku"
  | "qaumah"
  | "sajdah"
  | "sitting"
  | "salaam-right"
  | "salaam-left";

const POSE_IMAGES: Record<PrayerPose, any> = {
  niyyah: require("@/assets/images/prayer-pose-niyyah.png"),
  takbir: require("@/assets/images/prayer-pose-takbir.png"),
  "standing-navel": require("@/assets/images/prayer-pose-standing-navel.png"),
  "standing-chest": require("@/assets/images/prayer-pose-standing-chest.png"),
  ruku: require("@/assets/images/prayer-pose-ruku.png"),
  qaumah: require("@/assets/images/prayer-pose-qaumah.png"),
  sajdah: require("@/assets/images/prayer-pose-sajdah.png"),
  sitting: require("@/assets/images/prayer-pose-sitting.png"),
  "salaam-right": require("@/assets/images/prayer-pose-salaam-right.png"),
  "salaam-left": require("@/assets/images/prayer-pose-salaam-left.png"),
};

export default function PrayerPostureIllustration({
  pose,
  size = 90,
}: {
  pose: PrayerPose;
  // Kept for API compatibility with earlier callers that pass a size
  // prop — the height matches, width scales proportionally via
  // resizeMode="contain" rather than being forced square, since these
  // are real photos/illustrations with their own natural aspect ratio
  // (unlike the old geometric SVG figures, which were drawn square).
  size?: number;
}) {
  return (
    <Image
      source={POSE_IMAGES[pose]}
      style={[styles.image, { height: size }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  image: { width: "100%" },
});
