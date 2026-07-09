import React, { useMemo, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
  SharedValue,
} from "react-native-reanimated";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { DHIKR_LIST } from "@/src/lib/dhikr";

type BeadStyle = {
  id: string;
  name: string;
  colors: [string, string];
  ring: string;
};

const BEAD_STYLES: BeadStyle[] = [
  { id: "wood", name: "Wood", colors: ["#8B5E3C", "#4E3320"], ring: "#3A2416" },
  { id: "pearl", name: "Pearl", colors: ["#E8E8EC", "#8B8D93"], ring: "#6B6D73" },
  { id: "onyx", name: "Onyx", colors: ["#4A4A4E", "#0E0E10"], ring: "#000000" },
  { id: "emerald", name: "Emerald", colors: ["#3FBF8F", "#0B5C41"], ring: "#083D2B" },
  { id: "sapphire", name: "Sapphire", colors: ["#5B8DEF", "#1A3B8C"], ring: "#122A63" },
  { id: "gold", name: "Gold", colors: ["#F5D46B", "#B8860B"], ring: "#8A650A" },
];

const MAX_VISUAL_BEADS = 33;
const SCREEN_WIDTH = Dimensions.get("window").width;
const STRING_HEIGHT = 90;
const STRING_PADDING = SPACING.xl * 2;
const AVAILABLE_WIDTH = SCREEN_WIDTH - STRING_PADDING;
const PATH_SAMPLES = 160;
const OVERSHOOT = 8; // px equivalent along the path

// ---- Cubic Bézier + arc-length lookup table (manual PathMeasure equivalent) ----
// React Native has no native Path/PathMeasure like Compose does, so we sample
// the curve into a distance→point lookup table ourselves. Beads are then
// positioned by DISTANCE ALONG THE PATH (via this table), never by
// interpolating raw x/y directly — matching how a real PathMeasure-driven
// animation works.
function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function buildPathTable(width: number, height: number) {
  // Gentle draped-string arch, matching how a held tasbih naturally curves.
  const P0 = { x: 0, y: height * 0.62 };
  const P1 = { x: width * 0.25, y: height * 0.02 };
  const P2 = { x: width * 0.75, y: height * 0.02 };
  const P3 = { x: width, y: height * 0.62 };

  const samples: { x: number; y: number; dist: number }[] = [];
  let cumulative = 0;
  let prev = { x: P0.x, y: P0.y };
  for (let i = 0; i <= PATH_SAMPLES; i++) {
    const t = i / PATH_SAMPLES;
    const x = bezierPoint(t, P0.x, P1.x, P2.x, P3.x);
    const y = bezierPoint(t, P0.y, P1.y, P2.y, P3.y);
    if (i > 0) cumulative += Math.hypot(x - prev.x, y - prev.y);
    samples.push({ x, y, dist: cumulative });
    prev = { x, y };
  }
  return { samples, totalLength: cumulative };
}

// Worklet-safe: given a distance along the path, find the (x,y) point via
// the lookup table, linearly interpolating between the two nearest samples.
function pointAtDistance(samples: { x: number; y: number; dist: number }[], totalLength: number, distance: number) {
  "worklet";
  let d = distance % totalLength;
  if (d < 0) d += totalLength;

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].dist < d) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.dist - a.dist || 1;
  const f = (d - a.dist) / span;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

// A single bead: perfectly circular, no rotation/stretch, subtle metallic
// sheen via a small specular highlight dot. Position derives purely from
// the shared `offset` distance value — never animated as raw x/y.
function TasbihBead({
  beadIndex,
  spacing,
  offset,
  samples,
  totalLength,
  size,
  colors,
  ring,
}: {
  beadIndex: number;
  spacing: number;
  offset: SharedValue<number>;
  samples: { x: number; y: number; dist: number }[];
  totalLength: number;
  size: number;
  colors: [string, string];
  ring: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const d = beadIndex * spacing - offset.value;
    const p = pointAtDistance(samples, totalLength, d);
    return {
      transform: [{ translateX: p.x - size / 2 }, { translateY: p.y - size / 2 }],
    };
  });

  return (
    <Animated.View style={[{ position: "absolute", width: size, height: size }, animatedStyle]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0.25, y: 0.2 }}
        end={{ x: 0.8, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: ring }}
      />
      {/* Specular highlight for a subtle metallic look */}
      <View
        style={{
          position: "absolute",
          top: size * 0.16,
          left: size * 0.2,
          width: size * 0.28,
          height: size * 0.2,
          borderRadius: size * 0.14,
          backgroundColor: "rgba(255,255,255,0.55)",
        }}
      />
    </Animated.View>
  );
}

export default function DhikrScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [hitTarget, setHitTarget] = useState(false);
  const [vibrationOn, setVibrationOn] = useState(true);
  const [beadStyleIdx, setBeadStyleIdx] = useState(1); // default: Pearl
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [targetOverride, setTargetOverride] = useState<number | null>(null);

  const item = DHIKR_LIST[index];
  const target = targetOverride ?? item.target;
  const beadStyle = BEAD_STYLES[beadStyleIdx];
  const totalBeads = Math.min(target, MAX_VISUAL_BEADS);
  const beadSize = Math.max(16, Math.min(28, Math.floor(AVAILABLE_WIDTH / totalBeads) - 2));

  const progress = Math.min(count / target, 1);

  const { samples, totalLength } = useMemo(
    () => buildPathTable(AVAILABLE_WIDTH, STRING_HEIGHT),
    [],
  );
  const spacing = totalLength / totalBeads;

  // Static thread — the string never moves, only the beads slide along it.
  const threadSegments = useMemo(() => {
    const segs: { x: number; y: number; length: number; angle: number }[] = [];
    const step = Math.max(1, Math.floor(PATH_SAMPLES / 60));
    for (let i = 0; i < samples.length - step; i += step) {
      const a = samples[i];
      const b = samples[i + step] ?? samples[samples.length - 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      segs.push({
        x: a.x,
        y: a.y,
        length: Math.hypot(dx, dy),
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      });
    }
    return segs;
  }, [samples]);

  // The necklace's overall slide distance. Monotonically increases (never
  // snapped back to 0 on lap completion) — the lookup table's modulo
  // wrapping handles the visual cycling automatically, which is also more
  // physically honest: a real tasbih string doesn't "reset," it just keeps
  // moving through your fingers.
  const offset = useSharedValue(0);

  const selectItem = (i: number) => {
    setIndex(i);
    setCount(0);
    setHitTarget(false);
    setTargetOverride(null);
    offset.value = 0;
    Haptics.selectionAsync();
  };

  const increment = () => {
    const next = count + 1;
    setCount(next);

    const base = offset.value;
    const target1 = base + spacing;
    // Overshoot past the target then settle back — imitates the momentum
    // of physically pushed prayer beads rather than a mechanical stop.
    offset.value = withSequence(
      withTiming(target1 + OVERSHOOT, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      }),
      withTiming(target1, {
        duration: 90,
        easing: Easing.inOut(Easing.ease),
      }),
    );

    if (next === target) {
      setHitTarget(true);
      if (vibrationOn) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (vibrationOn) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const reset = () => {
    setCount(0);
    setHitTarget(false);
    offset.value = withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) });
    Haptics.selectionAsync();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceSecondary }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.onSurface }]}>Dhikr Counter</Text>
        <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
          Tap anywhere below to count
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={{ flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
      >
        {DHIKR_LIST.map((d, i) => {
          const active = i === index;
          return (
            <Pressable
              key={d.id}
              testID={`dhikr-chip-${d.id}`}
              onPress={() => selectItem(i)}
              style={[
                styles.chip,
                { backgroundColor: active ? colors.brand : colors.surfaceSecondary },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.onSurfaceSecondary }]}>
                {d.transliteration}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable testID="dhikr-tap-zone" onPress={increment} style={{ flex: 1 }}>
        <View style={styles.body}>
          <View style={styles.countRow}>
            <Text style={[styles.countBig, { color: hitTarget ? colors.success : colors.brand }]} testID="dhikr-count">
              {count}
            </Text>
            <Pressable testID="dhikr-target-btn" onPress={() => setShowTargetPicker((s) => !s)}>
              <Text style={[styles.countTarget, { color: colors.onSurfaceTertiary }]}>/ {target}</Text>
            </Pressable>
          </View>
          <Text style={[styles.totalText, { color: colors.onSurfaceTertiary }]}>Tap anywhere to count</Text>

          {showTargetPicker ? (
            <View style={styles.targetPickerRow} testID="dhikr-target-picker">
              {[33, 99, 100].map((t) => {
                const active = target === t;
                return (
                  <Pressable
                    key={t}
                    testID={`dhikr-target-${t}`}
                    onPress={(e) => {
                      e.stopPropagation();
                      setTargetOverride(t);
                      setCount(0);
                      setHitTarget(false);
                      offset.value = 0;
                      setShowTargetPicker(false);
                      Haptics.selectionAsync();
                    }}
                    style={[styles.targetChip, { backgroundColor: active ? colors.brand : colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={[styles.targetChipText, { color: active ? "#fff" : colors.onSurface }]}>{t}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                testID="dhikr-target-default"
                onPress={(e) => {
                  e.stopPropagation();
                  setTargetOverride(null);
                  setCount(0);
                  setHitTarget(false);
                  offset.value = 0;
                  setShowTargetPicker(false);
                  Haptics.selectionAsync();
                }}
                style={[styles.targetChip, { backgroundColor: targetOverride === null ? colors.brand : colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.targetChipText, { color: targetOverride === null ? "#fff" : colors.onSurface }]}>Default</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Bead string — static thread first, then sliding beads on top */}
          <View style={[styles.beadStringWrap, { width: AVAILABLE_WIDTH, height: STRING_HEIGHT }]} testID="bead-string">
            {threadSegments.map((seg, i) => (
              <View
                key={`thread-${i}`}
                style={[
                  styles.thread,
                  {
                    left: seg.x,
                    top: seg.y,
                    width: seg.length,
                    transform: [{ rotate: `${seg.angle}deg` }],
                    backgroundColor: colors.onSurfaceTertiary,
                  },
                ]}
              />
            ))}
            {Array.from({ length: totalBeads }, (_, i) => (
              <TasbihBead
                key={`bead-${i}`}
                beadIndex={i}
                spacing={spacing}
                offset={offset}
                samples={samples}
                totalLength={totalLength}
                size={beadSize}
                colors={beadStyle.colors}
                ring={beadStyle.ring}
              />
            ))}
          </View>

          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceTertiary }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%`, backgroundColor: hitTarget ? colors.success : colors.brand },
              ]}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.brandTertiary }]}>
            <Text style={[styles.arabic, { color: colors.onBrandTertiary }]} testID="dhikr-arabic">
              {item.arabic}
            </Text>
            <Text style={[styles.translit, { color: colors.onBrandTertiary }]}>{item.transliteration}</Text>
            <Text style={[styles.english, { color: colors.onBrandTertiary }]}>{item.english}</Text>
          </View>
        </View>
      </Pressable>

      <View style={[styles.controlsWrap, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + SPACING.sm }]}>
        {showStylePicker ? (
          <View style={styles.styleSwatchRow}>
            {BEAD_STYLES.map((s, i) => {
              const active = i === beadStyleIdx;
              return (
                <Pressable
                  key={s.id}
                  testID={`bead-style-${s.id}`}
                  onPress={() => {
                    setBeadStyleIdx(i);
                    Haptics.selectionAsync();
                  }}
                  style={styles.swatchWrap}
                >
                  <LinearGradient
                    colors={s.colors}
                    style={[
                      styles.swatch,
                      { borderColor: active ? colors.brand : "transparent", borderWidth: active ? 3 : 0 },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <View style={styles.controlsRow}>
          <Pressable testID="vibration-toggle" onPress={() => setVibrationOn((v) => !v)} style={styles.controlBtn}>
            <Ionicons name={vibrationOn ? "phone-portrait" : "phone-portrait-outline"} size={20} color={colors.brand} />
          </Pressable>
          <Pressable
            testID="dhikr-prev"
            onPress={() => selectItem((index - 1 + DHIKR_LIST.length) % DHIKR_LIST.length)}
            style={styles.controlBtn}
          >
            <Ionicons name="chevron-back" size={20} color={colors.brand} />
          </Pressable>
          <Text style={[styles.navCount, { color: colors.onSurfaceTertiary }]}>
            {index + 1}/{DHIKR_LIST.length}
          </Text>
          <Pressable
            testID="dhikr-next"
            onPress={() => selectItem((index + 1) % DHIKR_LIST.length)}
            style={styles.controlBtn}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.brand} />
          </Pressable>
          <Pressable testID="bead-style-btn" onPress={() => setShowStylePicker((s) => !s)} style={styles.controlBtn}>
            <View style={[styles.styleDot, { backgroundColor: beadStyle.colors[0] }]} />
          </Pressable>
          <Pressable testID="dhikr-reset-btn" onPress={reset} style={styles.controlBtn}>
            <Ionicons name="refresh" size={20} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: FONTS.bold, fontSize: 26 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 2 },
  chipRow: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm },
  chip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, marginRight: SPACING.sm },
  chipText: { fontFamily: FONTS.semibold, fontSize: 13 },
  body: { alignItems: "center", padding: SPACING.xl },
  countRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: SPACING.md },
  countBig: { fontFamily: FONTS.bold, fontSize: 92 },
  countTarget: { fontFamily: FONTS.bold, fontSize: 30, marginBottom: 16 },
  totalText: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2, marginBottom: SPACING.xl },
  targetPickerRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.lg },
  targetChip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth },
  targetChipText: { fontFamily: FONTS.semibold, fontSize: 13 },
  beadStringWrap: { position: "relative" },
  thread: { position: "absolute", height: 2, borderRadius: 1 },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    marginTop: SPACING.xl,
    marginBottom: SPACING.xxl,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  card: {
    width: "100%",
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: "center",
  },
  arabic: { fontSize: 30, lineHeight: 46, textAlign: "center" },
  translit: { fontFamily: FONTS.semibold, fontSize: 15, marginTop: SPACING.sm, fontStyle: "italic" },
  english: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 4, textAlign: "center" },
  controlsWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACING.sm, paddingHorizontal: SPACING.xl },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controlBtn: { padding: SPACING.sm, alignItems: "center", justifyContent: "center" },
  navCount: { fontFamily: FONTS.medium, fontSize: 13 },
  styleDot: { width: 20, height: 20, borderRadius: 10 },
  styleSwatchRow: { flexDirection: "row", justifyContent: "center", gap: SPACING.md, paddingBottom: SPACING.md },
  swatchWrap: { alignItems: "center" },
  swatch: { width: 36, height: 36, borderRadius: 18 },
});
