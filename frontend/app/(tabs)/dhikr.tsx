import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
import { DHIKR_LIST, DhikrItem } from "@/src/lib/dhikr";
import { storage } from "@/src/utils/storage";
import { useKeyboardHeight } from "@/src/hooks/use-keyboard-height";

const K_DHIKR_TOTALS = "dhikr.totals";
const K_CUSTOM_DHIKR = "dhikr.custom";
const K_SESSION_COUNTS = "dhikr.sessionCounts";

type BeadStyle = {
  id: string;
  name: string;
  colors: [string, string, string];
  ring: string;
};

// Three-stop gradients (light → mid → dark) for a richer glossy 3D look.
const BEAD_STYLES: BeadStyle[] = [
  { id: "wood", name: "Wood", colors: ["#B9895B", "#8B5E3C", "#3E2A16"], ring: "#2A1B0E" },
  { id: "pearl", name: "Pearl", colors: ["#FFFFFF", "#D7D9DE", "#84878E"], ring: "#5C5F66" },
  { id: "onyx", name: "Onyx", colors: ["#6E6E73", "#3A3A3E", "#050505"], ring: "#000000" },
  { id: "emerald", name: "Emerald", colors: ["#6EE0B0", "#3FBF8F", "#0A4632"], ring: "#062E20" },
  { id: "sapphire", name: "Sapphire", colors: ["#8CADF5", "#5B8DEF", "#132C6B"], ring: "#0D1E49" },
  { id: "gold", name: "Gold", colors: ["#FCE9A8", "#F5D46B", "#8A650A"], ring: "#6B4E06" },
];

const MAX_VISUAL_BEADS = 33;
const SCREEN_WIDTH = Dimensions.get("window").width;
const LOOP_WIDTH = SCREEN_WIDTH - SPACING.xl * 2;
const LOOP_HEIGHT = 170;
const PATH_SAMPLES = 240;
const OVERSHOOT_FRACTION = 0.05; // 5% overshoot before settling
const BEAD_SIZE_MAX = 26;
const BEAD_SIZE_MIN = 16;
const GAP_FRACTION = 0.11; // fraction of the oval's perimeter left open at the bottom

// ---- Oval loop with a bottom gap, sampled into a distance→point table ----
// (manual PathMeasure equivalent — React Native has no native Path API).
// The loop is an ellipse traced from just past the gap, all the way around,
// stopping just before the gap on the other side — beads only ever occupy
// the traced portion, never the gap itself.
function buildLoopTable(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - BEAD_SIZE_MAX / 2;
  const ry = height / 2 - BEAD_SIZE_MAX / 2;

  // Angle 90° (straight down) is the bottom center, where the gap sits.
  const gapAngle = (GAP_FRACTION * Math.PI * 2) / 2; // half-gap, in radians
  const startAngle = Math.PI / 2 + gapAngle;
  const endAngle = Math.PI / 2 + Math.PI * 2 - gapAngle;

  const samples: { x: number; y: number; dist: number }[] = [];
  let cumulative = 0;
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i <= PATH_SAMPLES; i++) {
    const t = i / PATH_SAMPLES;
    const angle = startAngle + (endAngle - startAngle) * t;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    if (prev) cumulative += Math.hypot(x - prev.x, y - prev.y);
    samples.push({ x, y, dist: cumulative });
    prev = { x, y };
  }
  return { samples, totalLength: cumulative };
}

// Worklet-safe distance→point lookup. Unlike the closed-loop wraparound
// used for a straight string, this path is OPEN (the gap never gets
// traced), so distance simply clamps at the ends rather than wrapping —
// beads slide up to the gap and no beads ever appear inside it.
function pointAtDistance(samples: { x: number; y: number; dist: number }[], totalLength: number, distance: number) {
  "worklet";
  const d = Math.max(0, Math.min(totalLength, distance));

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

// A single bead: large, glossy, layered shading for a premium 3D look —
// drop shadow, base gradient (light upper-left → dark lower-right), and a
// specular highlight. No rotation/stretch, ever.
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
  colors: [string, string, string];
  ring: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const d = beadIndex * spacing + offset.value;
    const p = pointAtDistance(samples, totalLength, d);
    return {
      transform: [{ translateX: p.x - size / 2 }, { translateY: p.y - size / 2 }],
    };
  });

  return (
    <Animated.View style={[{ position: "absolute", width: size, height: size }, animatedStyle]}>
      {/* Drop shadow beneath the bead */}
      <View
        style={{
          position: "absolute",
          top: size * 0.18,
          left: size * 0.06,
          width: size * 0.94,
          height: size * 0.94,
          borderRadius: size / 2,
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
      />
      {/* Base gradient: light upper-left to dark lower-right */}
      <LinearGradient
        colors={colors}
        start={{ x: 0.18, y: 0.15 }}
        end={{ x: 0.9, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: ring }}
      />
      {/* Glossy specular highlight, upper-left */}
      <View
        style={{
          position: "absolute",
          top: size * 0.14,
          left: size * 0.18,
          width: size * 0.32,
          height: size * 0.22,
          borderRadius: size * 0.16,
          backgroundColor: "rgba(255,255,255,0.65)",
        }}
      />
    </Animated.View>
  );
}

export default function DhikrScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [hitTarget, setHitTarget] = useState(false);
  const [vibrationOn, setVibrationOn] = useState(true);
  const [beadStyleIdx, setBeadStyleIdx] = useState(1); // default: Pearl
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [targetOverride, setTargetOverride] = useState<number | null>(null);

  // Custom user-added phrases, merged with the built-in list. Persisted
  // under a separate storage key so built-ins never need to be rewritten.
  const [customItems, setCustomItems] = useState<DhikrItem[]>([]);
  const fullList = useMemo(() => [...DHIKR_LIST, ...customItems], [customItems]);

  // Per-phrase session counts, keyed by phrase id — switching phrases
  // (chips or prev/next) no longer resets progress the way a single shared
  // `count` did before. Only the Reset button clears the count for
  // whichever phrase is currently selected.
  //
  // Persisted to storage (not just in-memory React state) so progress also
  // survives switching to a different tab and back, or closing the app
  // entirely and reopening it later — "come back to it" covers both cases.
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const sessionCountsLoaded = useRef(false);

  const [showAddDhikr, setShowAddDhikr] = useState(false);
  // FIX: RN's <Modal> renders in its own separate native window on
  // Android, which does not inherit whatever keyboard-resize behavior the
  // main Activity is configured with — so the Add Custom Dhikr sheet below
  // needs its own explicit keyboard handling, distinct from how the rest
  // of the app avoids the keyboard. Lifting the sheet by the real keyboard
  // height keeps every field (including the last one) visible above it.
  const keyboardHeight = useKeyboardHeight();
  const [newArabic, setNewArabic] = useState("");
  const [newTranslit, setNewTranslit] = useState("");
  const [newEnglish, setNewEnglish] = useState("");
  const [newTarget, setNewTarget] = useState("33");

  // If custom items are deleted out from under the currently-selected
  // index, clamp back into range rather than pointing past the end.
  useEffect(() => {
    if (index > fullList.length - 1) {
      setIndex(Math.max(0, fullList.length - 1));
    }
  }, [fullList.length, index]);

  const item = fullList[Math.min(index, fullList.length - 1)];
  const target = targetOverride ?? item.target;
  const count = sessionCounts[item.id] ?? 0;
  const beadStyle = BEAD_STYLES[beadStyleIdx];
  const totalBeads = Math.min(target, MAX_VISUAL_BEADS);

  const { samples, totalLength } = useMemo(() => buildLoopTable(LOOP_WIDTH, LOOP_HEIGHT), []);
  // Beads are sized so the full set fits along the traced (non-gap) length
  // with a touch of breathing room, clamped to a sensible large/premium range.
  const beadSize = Math.max(
    BEAD_SIZE_MIN,
    Math.min(BEAD_SIZE_MAX, Math.floor(totalLength / totalBeads) - 4),
  );
  const spacing = totalLength / totalBeads;
  const maxOffset = totalLength - (totalBeads - 1) * spacing; // clamps sliding at the far end

  const progressPct = Math.min(count / target, 1);

  // Static thread — traced from the same samples, so it always matches the
  // beads' path exactly and never covers the gap.
  const threadSegments = useMemo(() => {
    const segs: { x: number; y: number; length: number; angle: number }[] = [];
    const step = Math.max(1, Math.floor(PATH_SAMPLES / 90));
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

  // Slide distance along the (open, gapped) loop. Clamps at both ends rather
  // than wrapping, since the gap means this isn't a true closed circuit —
  // beads travel up to the gap and stop, matching a real Tasbih's two ends.
  const offset = useSharedValue(0);
  const isAnimating = useRef(false);

  // Lifetime totals per phrase — persisted, and deliberately NEVER touched
  // by the session Reset button. Only ever increases.
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [showTotals, setShowTotals] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem(K_DHIKR_TOTALS, "");
      if (raw) {
        try {
          setTotals(JSON.parse(raw));
        } catch {}
      }
    })();
    (async () => {
      const raw = await storage.getItem(K_CUSTOM_DHIKR, "");
      if (raw) {
        try {
          setCustomItems(JSON.parse(raw));
        } catch {}
      }
    })();
    (async () => {
      const raw = await storage.getItem(K_SESSION_COUNTS, "");
      if (raw) {
        try {
          setSessionCounts(JSON.parse(raw));
        } catch {}
      }
      // Only start persisting writes after the initial load completes —
      // otherwise the empty {} the state starts with would get written
      // straight back to storage before the real saved value loads,
      // wiping out a previous session's progress on every cold start.
      sessionCountsLoaded.current = true;
    })();
  }, []);

  // Persist sessionCounts on every change, once the initial load above has
  // completed. This is what actually makes progress survive a tab switch
  // or the app being closed and reopened — plain React state alone only
  // survives while this screen component stays mounted.
  useEffect(() => {
    if (!sessionCountsLoaded.current) return;
    storage.setItem(K_SESSION_COUNTS, JSON.stringify(sessionCounts));
  }, [sessionCounts]);

  // Snap the bead visual (no animation) to match whichever phrase's
  // already-stored session count when switching phrases, instead of
  // resetting to zero. Runs after `index` changes, by which point `item`/
  // `spacing`/`totalBeads` above already reflect the newly-selected phrase.
  useEffect(() => {
    const storedCount = sessionCounts[item.id] ?? 0;
    setHitTarget(storedCount >= target);
    const clampedBeads = Math.min(storedCount, totalBeads);
    offset.value = clampedBeads * spacing;
    isAnimating.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const selectItem = (i: number) => {
    setIndex(i);
    Haptics.selectionAsync();
  };

  const advanceOneBead = () => {
    // Guards against overlapping animations from rapid taps/swipes.
    if (isAnimating.current) return;
    isAnimating.current = true;

    const next = count + 1;
    setSessionCounts((prev) => ({ ...prev, [item.id]: next }));

    setTotals((prev) => {
      const updated = { ...prev, [item.id]: (prev[item.id] ?? 0) + 1 };
      storage.setItem(K_DHIKR_TOTALS, JSON.stringify(updated));
      return updated;
    });

    const base = offset.value;
    const targetOffset = Math.min(maxOffset, base + spacing);
    const overshoot = spacing * OVERSHOOT_FRACTION;

    offset.value = withSequence(
      withTiming(Math.min(maxOffset, targetOffset + overshoot), {
        duration: 240,
        easing: Easing.out(Easing.cubic), // FastOutSlowIn equivalent
      }),
      withTiming(targetOffset, {
        duration: 80,
        easing: Easing.inOut(Easing.ease),
      }),
    );
    // Release the guard once the settle animation should be done.
    setTimeout(() => {
      isAnimating.current = false;
    }, 340);

    if (next === target) {
      setHitTarget(true);
      if (vibrationOn) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (vibrationOn) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Once the loop is exhausted (reached the far end at the gap), reset
    // for the next lap after the current animation settles.
    if (base + spacing >= maxOffset - 0.01) {
      setTimeout(() => {
        offset.value = 0;
      }, 360);
    }
  };

  const reset = () => {
    // Only clears the currently-selected phrase's session count — other
    // phrases' progress is untouched, and lifetime totals are never
    // touched by this button at all.
    setSessionCounts((prev) => ({ ...prev, [item.id]: 0 }));
    setHitTarget(false);
    isAnimating.current = false;
    offset.value = withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) });
    Haptics.selectionAsync();
  };

  const addCustomDhikr = () => {
    if (!newArabic.trim() || !newTranslit.trim()) return;
    const targetNum = parseInt(newTarget, 10) || 33;
    const newItem: DhikrItem = {
      id: `custom-${Date.now()}`,
      arabic: newArabic.trim(),
      transliteration: newTranslit.trim(),
      english: newEnglish.trim(),
      target: targetNum,
    };
    setCustomItems((prev) => {
      const updated = [...prev, newItem];
      storage.setItem(K_CUSTOM_DHIKR, JSON.stringify(updated));
      return updated;
    });
    setNewArabic("");
    setNewTranslit("");
    setNewEnglish("");
    setNewTarget("33");
    Haptics.selectionAsync();
  };

  const deleteCustomDhikr = (id: string) => {
    setCustomItems((prev) => {
      const updated = prev.filter((d) => d.id !== id);
      storage.setItem(K_CUSTOM_DHIKR, JSON.stringify(updated));
      return updated;
    });
    setSessionCounts((prev) => {
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
    setTotals((prev) => {
      const rest = { ...prev };
      delete rest[id];
      storage.setItem(K_DHIKR_TOTALS, JSON.stringify(rest));
      return rest;
    });
    Haptics.selectionAsync();
  };

  // PanResponder's callbacks are created once (via useRef) and would
  // otherwise always see stale state — using a ref that's kept current via
  // effect lets the swipe gesture correctly check "is any overlay open
  // right now" without recreating the responder every render.
  const overlayOpenRef = useRef(false);
  useEffect(() => {
    overlayOpenRef.current = showTotals || showStylePicker || showTargetPicker || showAddDhikr;
  }, [showTotals, showStylePicker, showTargetPicker, showAddDhikr]);

  // Swipe-up gesture, in addition to tap, also advances one bead. Disabled
  // while any modal/picker is open — otherwise it can compete with (and
  // sometimes win over) a slow scroll drag inside those overlays, making
  // the scroll feel unresponsive to anything but fast flicks.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        !overlayOpenRef.current && Math.abs(gesture.dy) > 12 && gesture.dy < 0,
      onPanResponderRelease: (_evt, gesture) => {
        if (!overlayOpenRef.current && gesture.dy < -12) advanceOneBead();
      },
    }),
  ).current;

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
          Tap or swipe up to count
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={{ flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
      >
        {fullList.map((d, i) => {
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
        <Pressable
          testID="dhikr-add-chip"
          onPress={() => setShowAddDhikr(true)}
          style={[styles.chip, styles.addChip, { backgroundColor: colors.surfaceSecondary }]}
        >
          <Ionicons name="add" size={16} color={colors.brand} />
        </Pressable>
      </ScrollView>

      <Pressable testID="dhikr-tap-zone" onPress={advanceOneBead} style={{ flex: 1 }} {...panResponder.panHandlers}>
        <View style={styles.body}>
          <View style={styles.countRow}>
            <Text style={[styles.countBig, { color: hitTarget ? colors.success : colors.brand }]} testID="dhikr-count">
              {count}
            </Text>
            <Pressable testID="dhikr-target-btn" onPress={() => setShowTargetPicker((s) => !s)}>
              <Text style={[styles.countTarget, { color: colors.onSurfaceTertiary }]}>/ {target}</Text>
            </Pressable>
          </View>
          <Text style={[styles.totalText, { color: colors.onSurfaceTertiary }]}>Tap or swipe up to count</Text>

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
                      setSessionCounts((prev) => ({ ...prev, [item.id]: 0 }));
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
                  setSessionCounts((prev) => ({ ...prev, [item.id]: 0 }));
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

          {/* Oval Tasbih loop — thread first (with a gap), beads on top */}
          <View style={[styles.loopWrap, { width: LOOP_WIDTH, height: LOOP_HEIGHT }]} testID="bead-string">
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
                { width: `${progressPct * 100}%`, backgroundColor: hitTarget ? colors.success : colors.brand },
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
            onPress={() => selectItem((index - 1 + fullList.length) % fullList.length)}
            style={styles.controlBtn}
          >
            <Ionicons name="chevron-back" size={20} color={colors.brand} />
          </Pressable>
          <Text style={[styles.navCount, { color: colors.onSurfaceTertiary }]}>
            {index + 1}/{fullList.length}
          </Text>
          <Pressable
            testID="dhikr-next"
            onPress={() => selectItem((index + 1) % fullList.length)}
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
          <Pressable testID="dhikr-totals-btn" onPress={() => setShowTotals(true)} style={styles.controlBtn}>
            <Ionicons name="stats-chart-outline" size={20} color={colors.brand} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={showTotals}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTotals(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowTotals(false)}>
          {/* FIX: no onStartShouldSetResponder / onResponderTerminationRequest
              here. Claiming the touch responder at this parent level and
              refusing to release it was blocking the child ScrollView below
              from ever claiming its own scroll gesture on a slow drag — a
              plain View with no special touch handling lets the outer
              Pressable's onPress still handle tap-to-dismiss while the
              ScrollView scrolls normally as a child. */}
          <View
            style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + SPACING.lg }]}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Lifetime Totals</Text>
            <Text style={[styles.modalSub, { color: colors.onSurfaceTertiary }]}>
              All-time counts, unaffected by the session Reset button
            </Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {fullList.map((d) => (
                <View key={d.id} testID={`totals-row-${d.id}`} style={[styles.totalsRow, { borderBottomColor: colors.divider }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.totalsArabic, { color: colors.onSurface }]}>{d.arabic}</Text>
                    <Text style={[styles.totalsLabel, { color: colors.onSurfaceTertiary }]}>{d.transliteration}</Text>
                  </View>
                  <Text style={[styles.totalsCount, { color: colors.brand }]}>
                    {(totals[d.id] ?? 0).toLocaleString()}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showAddDhikr}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddDhikr(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAddDhikr(false)}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: insets.bottom + SPACING.lg,
                // Lift the whole sheet above the keyboard — Modal doesn't
                // get this from the OS on Android the way a normal screen
                // does, so it's handled explicitly here via the real
                // measured keyboard height instead.
                marginBottom: keyboardHeight,
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Add Custom Dhikr</Text>

            <TextInput
              testID="add-dhikr-arabic"
              placeholder="Arabic text"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={newArabic}
              onChangeText={setNewArabic}
              style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]}
            />
            <TextInput
              testID="add-dhikr-translit"
              placeholder="Transliteration"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={newTranslit}
              onChangeText={setNewTranslit}
              style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]}
            />
            <TextInput
              testID="add-dhikr-english"
              placeholder="English meaning"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={newEnglish}
              onChangeText={setNewEnglish}
              style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]}
            />
            <TextInput
              testID="add-dhikr-target"
              placeholder="Target count"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={newTarget}
              onChangeText={setNewTarget}
              keyboardType="number-pad"
              style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]}
            />
            <Pressable
              testID="add-dhikr-save"
              onPress={() => {
                addCustomDhikr();
                setShowAddDhikr(false);
              }}
              style={[styles.saveBtn, { backgroundColor: colors.brand }]}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>

            {customItems.length > 0 ? (
              <>
                <Text style={[styles.modalSub, { color: colors.onSurfaceTertiary, marginTop: SPACING.lg }]}>
                  Your custom phrases
                </Text>
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                  {customItems.map((d) => (
                    <View key={d.id} style={[styles.totalsRow, { borderBottomColor: colors.divider }]}>
                      <Text style={{ flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: colors.onSurface }}>
                        {d.transliteration}
                      </Text>
                      <Pressable testID={`delete-${d.id}`} onPress={() => deleteCustomDhikr(d.id)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors.muted} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
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
  addChip: { paddingHorizontal: SPACING.md, alignItems: "center", justifyContent: "center" },
  chipText: { fontFamily: FONTS.semibold, fontSize: 13 },
  body: { alignItems: "center", padding: SPACING.xl },
  countRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: SPACING.md },
  countBig: { fontFamily: FONTS.bold, fontSize: 80 },
  countTarget: { fontFamily: FONTS.bold, fontSize: 28, marginBottom: 14 },
  totalText: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2, marginBottom: SPACING.lg },
  targetPickerRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.lg },
  targetChip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth },
  targetChipText: { fontFamily: FONTS.semibold, fontSize: 13 },
  loopWrap: { position: "relative" },
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(120,120,120,0.4)",
    alignSelf: "center",
    marginBottom: SPACING.md,
  },
  modalTitle: { fontFamily: FONTS.bold, fontSize: 18 },
  modalSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2, marginBottom: SPACING.md },
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  totalsArabic: { fontSize: 20, textAlign: "right" },
  totalsLabel: { fontFamily: FONTS.medium, fontSize: 13, marginTop: 2 },
  totalsCount: { fontFamily: FONTS.bold, fontSize: 20, marginLeft: SPACING.md },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  saveBtn: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    marginTop: SPACING.xs,
  },
  saveBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: "#fff" },
});
