import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

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

const BEAD_SIZE = 26;
const MAX_VISUAL_BEADS = 33;

export default function DhikrScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [hitTarget, setHitTarget] = useState(false);
  const [vibrationOn, setVibrationOn] = useState(true);
  const [beadStyleIdx, setBeadStyleIdx] = useState(1); // default: Pearl
  const [showStylePicker, setShowStylePicker] = useState(false);

  const item = DHIKR_LIST[index];
  const beadStyle = BEAD_STYLES[beadStyleIdx];
  const totalBeads = Math.min(item.target, MAX_VISUAL_BEADS);
  const progress = Math.min(count / item.target, 1);
  const filledBeads = count === 0 ? 0 : count % totalBeads === 0 ? totalBeads : count % totalBeads;

  const beadPositions = useMemo(() => {
    // Gentle arc: each bead offset vertically along a sine curve.
    return Array.from({ length: totalBeads }, (_, i) => {
      const t = i / Math.max(totalBeads - 1, 1);
      const arcOffset = Math.sin(t * Math.PI) * 26;
      return arcOffset;
    });
  }, [totalBeads]);

  const selectItem = (i: number) => {
    setIndex(i);
    setCount(0);
    setHitTarget(false);
    Haptics.selectionAsync();
  };

  const increment = () => {
    const next = count + 1;
    setCount(next);
    if (!vibrationOn) return;
    if (next === item.target) {
      setHitTarget(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (next === item.target) setHitTarget(true);
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
          Tap to count, switch between phrases below
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

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.countRow]}>
          <Text style={[styles.countBig, { color: hitTarget ? colors.success : colors.brand }]} testID="dhikr-count">
            {count}
          </Text>
          <Text style={[styles.countTarget, { color: colors.onSurfaceTertiary }]}>/ {item.target}</Text>
        </View>
        <Text style={[styles.totalText, { color: colors.onSurfaceTertiary }]}>Total this session: {count}</Text>

        {/* Bead string */}
        <View style={styles.beadStringWrap} testID="bead-string">
          {beadPositions.map((offset, i) => {
            const filled = i < filledBeads;
            const st = filled ? beadStyle : { colors: [colors.surfaceTertiary, colors.surfaceTertiary] as [string, string], ring: colors.border };
            return (
              <LinearGradient
                key={i}
                colors={st.colors}
                style={[
                  styles.bead,
                  {
                    marginTop: -offset,
                    borderColor: st.ring,
                    opacity: filled ? 1 : 0.5,
                  },
                ]}
              />
            );
          })}
        </View>

        <Pressable testID="dhikr-tap-btn" onPress={increment} style={[styles.tapBtn, { backgroundColor: colors.brand }]}>
          <Text style={styles.tapBtnText}>Tap to Count</Text>
        </Pressable>

        {/* Controls row — deliberately placed below, not mirroring a top icon-bar layout */}
        <View style={styles.controlsRow}>
          <Pressable testID="vibration-toggle" onPress={() => setVibrationOn((v) => !v)} style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name={vibrationOn ? "phone-portrait" : "phone-portrait-outline"} size={18} color={colors.brand} />
            <Text style={[styles.controlText, { color: colors.onSurface }]}>{vibrationOn ? "Vibration On" : "Vibration Off"}</Text>
          </Pressable>
          <Pressable testID="bead-style-btn" onPress={() => setShowStylePicker((s) => !s)} style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.styleDot, { backgroundColor: beadStyle.colors[0] }]} />
            <Text style={[styles.controlText, { color: colors.onSurface }]}>{beadStyle.name} Beads</Text>
          </Pressable>
          <Pressable testID="dhikr-reset-btn" onPress={reset} style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="refresh" size={18} color={colors.muted} />
            <Text style={[styles.controlText, { color: colors.onSurface }]}>Reset</Text>
          </Pressable>
        </View>

        {showStylePicker ? (
          <View style={[styles.stylePickerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.stylePickerTitle, { color: colors.onSurfaceTertiary }]}>Bead style</Text>
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
                    <Text style={[styles.swatchLabel, { color: colors.onSurfaceSecondary }]}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.brandTertiary }]}>
          <Text style={[styles.arabic, { color: colors.onBrandTertiary }]} testID="dhikr-arabic">
            {item.arabic}
          </Text>
          <Text style={[styles.translit, { color: colors.onBrandTertiary }]}>{item.transliteration}</Text>
          <Text style={[styles.english, { color: colors.onBrandTertiary }]}>{item.english}</Text>
        </View>

        <View style={styles.navRow}>
          <Pressable
            testID="dhikr-prev"
            onPress={() => selectItem((index - 1 + DHIKR_LIST.length) % DHIKR_LIST.length)}
            style={styles.navBtn}
          >
            <Ionicons name="chevron-back" size={22} color={colors.brand} />
          </Pressable>
          <Text style={[styles.navCount, { color: colors.onSurfaceTertiary }]}>
            {index + 1}/{DHIKR_LIST.length}
          </Text>
          <Pressable
            testID="dhikr-next"
            onPress={() => selectItem((index + 1) % DHIKR_LIST.length)}
            style={styles.navBtn}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.brand} />
          </Pressable>
        </View>
      </ScrollView>
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
  body: { alignItems: "center", padding: SPACING.xl, paddingBottom: SPACING.xxxl },
  countRow: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  countBig: { fontFamily: FONTS.bold, fontSize: 56 },
  countTarget: { fontFamily: FONTS.semibold, fontSize: 20, marginBottom: 10 },
  totalText: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2, marginBottom: SPACING.lg },
  beadStringWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    height: 70,
    marginBottom: SPACING.xl,
  },
  bead: {
    width: BEAD_SIZE,
    height: BEAD_SIZE,
    borderRadius: BEAD_SIZE / 2,
    marginHorizontal: -3,
    borderWidth: 1,
  },
  tapBtn: {
    width: "100%",
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  tapBtnText: { fontFamily: FONTS.bold, fontSize: 17, color: "#fff" },
  controlsRow: { flexDirection: "row", gap: SPACING.sm, width: "100%", marginBottom: SPACING.md },
  controlBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  controlText: { fontFamily: FONTS.medium, fontSize: 11, textAlign: "center" },
  styleDot: { width: 14, height: 14, borderRadius: 7 },
  stylePickerCard: {
    width: "100%",
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  stylePickerTitle: { fontFamily: FONTS.semibold, fontSize: 12, marginBottom: SPACING.sm, letterSpacing: 0.5 },
  styleSwatchRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md },
  swatchWrap: { alignItems: "center", width: 64 },
  swatch: { width: 40, height: 40, borderRadius: 20, marginBottom: 4 },
  swatchLabel: { fontFamily: FONTS.medium, fontSize: 11 },
  card: {
    width: "100%",
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  arabic: { fontSize: 30, lineHeight: 46, textAlign: "center" },
  translit: { fontFamily: FONTS.semibold, fontSize: 15, marginTop: SPACING.sm, fontStyle: "italic" },
  english: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 4, textAlign: "center" },
  navRow: { flexDirection: "row", alignItems: "center", gap: SPACING.lg },
  navBtn: { padding: SPACING.sm },
  navCount: { fontFamily: FONTS.medium, fontSize: 13 },
});
