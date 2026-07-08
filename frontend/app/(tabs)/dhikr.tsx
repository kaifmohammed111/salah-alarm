import React, { useMemo, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
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
  // Per-phrase target override. null = use that phrase's own default target.
  const [targetOverride, setTargetOverride] = useState<number | null>(null);

  const item = DHIKR_LIST[index];
  const target = targetOverride ?? item.target;
  const beadStyle = BEAD_STYLES[beadStyleIdx];
  const totalBeads = Math.min(target, MAX_VISUAL_BEADS);

  const beadSize = Math.max(16, Math.min(30, Math.floor(AVAILABLE_WIDTH / totalBeads) - 2));

  const progress = Math.min(count / target, 1);
  const filledBeads = count === 0 ? 0 : count % totalBeads === 0 ? totalBeads : count % totalBeads;

  // Precise absolute position for each bead, rising left-to-right along a
  // gentle curve, so we can draw real thread segments connecting their
  // exact centers (not just an approximate visual arc).
  const beadCenters = useMemo(() => {
    const usableWidth = AVAILABLE_WIDTH - beadSize;
    const usableHeight = STRING_HEIGHT - beadSize;
    return Array.from({ length: totalBeads }, (_, i) => {
      const t = totalBeads > 1 ? i / (totalBeads - 1) : 0;
      const eased = Math.pow(t, 1.15); // slight sag near the start
      const x = eased * usableWidth + beadSize / 2;
      const y = STRING_HEIGHT - beadSize / 2 - eased * usableHeight;
      return { x, y };
    });
  }, [totalBeads, beadSize]);

  const threadSegments = useMemo(() => {
    const segs = [];
    for (let i = 0; i < beadCenters.length - 1; i++) {
      const a = beadCenters[i];
      const b = beadCenters[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      segs.push({ x: a.x, y: a.y, length, angle });
    }
    return segs;
  }, [beadCenters]);

  const shiftX = useSharedValue(0);
  const animatedStringStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shiftX.value }],
  }));

  const selectItem = (i: number) => {
    setIndex(i);
    setCount(0);
    setHitTarget(false);
    setTargetOverride(null);
    Haptics.selectionAsync();
  };

  const SLIDE_RANGE = 46;

  const increment = () => {
    const next = count + 1;
    setCount(next);

    const nextFilled = next % totalBeads === 0 ? totalBeads : next % totalBeads;
    const laneProgress = nextFilled / totalBeads;
    // Fluid, continuous slide of the whole string toward the left as beads
    // are counted — rather than a static instant color-fill jump. Wraps
    // back smoothly at the start of each new lap around the string.
    shiftX.value = withTiming(-laneProgress * SLIDE_RANGE, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });

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
                  setShowTargetPicker(false);
                  Haptics.selectionAsync();
                }}
                style={[styles.targetChip, { backgroundColor: targetOverride === null ? colors.brand : colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.targetChipText, { color: targetOverride === null ? "#fff" : colors.onSurface }]}>Default</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Bead string — thread segments drawn first (behind), beads on top */}
          <Animated.View style={[styles.beadStringWrap, { width: AVAILABLE_WIDTH, height: STRING_HEIGHT }, animatedStringStyle]} testID="bead-string">
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
            {beadCenters.map((c, i) => {
              const filled = i < filledBeads;
              const st = filled ? beadStyle : { colors: [colors.surfaceTertiary, colors.surfaceTertiary] as [string, string], ring: colors.border };
              return (
                <LinearGradient
                  key={`bead-${i}`}
                  colors={st.colors}
                  style={[
                    styles.bead,
                    {
                      width: beadSize,
                      height: beadSize,
                      borderRadius: beadSize / 2,
                      left: c.x - beadSize / 2,
                      top: c.y - beadSize / 2,
                      borderColor: st.ring,
                      opacity: filled ? 1 : 0.55,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>

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
  bead: { position: "absolute", borderWidth: 1 },
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
