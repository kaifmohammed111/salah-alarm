import React, { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";

type StarConfig = {
  id: number;
  xPct: number;
  yPct: number;
  size: number;
  delay: number;
  duration: number;
  baseOpacity: number;
};

// Simple deterministic-ish random generator seeded once per mount, not on
// every render — this is only for visual placement (not anything that
// needs true reproducibility), so Math.random() at module-scope-per-mount
// via useMemo(..., []) is fine: it runs once and stays stable for the
// lifetime of this component instance.
function buildStars(count: number): StarConfig[] {
  const stars: StarConfig[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      id: i,
      xPct: Math.random() * 100,
      yPct: Math.random() * 100,
      // A handful of slightly larger "feature" stars stand out among many
      // small ones, closer to how a real night sky reads.
      size: Math.random() < 0.12 ? 2.5 + Math.random() * 1.5 : 1 + Math.random() * 1.3,
      delay: Math.random() * 4000,
      duration: 1500 + Math.random() * 2500,
      baseOpacity: 0.35 + Math.random() * 0.35,
    });
  }
  return stars;
}

function Star({ xPct, yPct, size, delay, duration, baseOpacity }: StarConfig) {
  const opacity = useSharedValue(baseOpacity);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
          withTiming(baseOpacity, { duration, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: `${xPct}%`,
          top: `${yPct}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#FFFFFF",
        },
        animatedStyle,
      ]}
    />
  );
}

// Soft glowing moon: a small filled core with a couple of larger, dimmer,
// semi-transparent rings behind it to fake a glow — avoids needing any
// blur library, and avoids hand-derived curved path data (this project's
// known-issues.md flags that as a repeated source of bugs elsewhere) since
// it's just concentric circles via plain Views.
function Moon() {
  return (
    <View style={styles.moonWrap} pointerEvents="none">
      <View style={[styles.moonGlowOuter]} />
      <View style={[styles.moonGlowInner]} />
      <View style={styles.moonCore} />
      {/* Subtle crescent shading: an offset darker circle clipped by the
          core's own bounds via overflow hidden on a wrapping view, giving
          a soft terminator line without any arc path math. */}
      <View style={styles.moonShadeClip} pointerEvents="none">
        <View style={styles.moonShade} />
      </View>
    </View>
  );
}

export default function Starfield({ starCount = 90 }: { starCount?: number }) {
  const stars = useMemo(() => buildStars(starCount), [starCount]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Moon />
      {stars.map((s) => (
        <Star key={s.id} {...s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  moonWrap: {
    position: "absolute",
    top: "12%",
    right: "14%",
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  moonGlowOuter: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(226,232,255,0.08)",
  },
  moonGlowInner: {
    position: "absolute",
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "rgba(226,232,255,0.16)",
  },
  moonCore: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F4F1E8",
  },
  moonShadeClip: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
  },
  moonShade: {
    position: "absolute",
    width: 34,
    height: 40,
    borderRadius: 20,
    left: 14,
    backgroundColor: "rgba(11,30,61,0.55)",
  },
});
