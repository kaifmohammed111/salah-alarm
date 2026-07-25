import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { Magnetometer } from "expo-sensors";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { distanceToKaabaKm, qiblaBearing } from "@/src/lib/qibla";

const COMPASS = 300;

// How much each new sensor sample nudges the smoothed heading, as a
// fraction of the shortest angular distance to it (0-1). Lower = smoother
// but slightly laggier; higher = snappier but noisier.
// The two sensor sources have very different noise characteristics: the
// OS-fused compass (Location.watchHeadingAsync) is usually already fairly
// clean, so it can use a lighter touch; the raw magnetometer fallback is
// genuinely noisy (unlike the fused compass, it doesn't correct for how
// flat/tilted the phone is held) and needs much heavier smoothing.
// Base smoothing strength for each source when the phone is nearly still
// (small sample-to-sample changes) — heavy smoothing here kills sensor
// jitter. During an actual fast rotation, adaptiveAlpha() below opens
// this up toward near-1:1 tracking so a genuine full turn doesn't lag
// behind and then visibly "catch up" (which looked like the dial skipping
// over sections instead of sweeping through them continuously).
const SMOOTHING_ALPHA_FUSED = 0.35;
const SMOOTHING_ALPHA_RAW = 0.12;
// Once a sample-to-sample change reaches this many degrees, treat it as
// deliberate fast motion and track it almost immediately rather than
// smoothing it — a fixed low alpha applied uniformly to genuinely large,
// fast changes is what caused the lag/catch-up "skipping" behavior.
const FAST_MOTION_THRESHOLD_DEG = 12;

function adaptiveAlpha(baseAlpha: number, rawDeltaAbsDeg: number): number {
  const t = Math.min(rawDeltaAbsDeg / FAST_MOTION_THRESHOLD_DEG, 1);
  return baseAlpha + (0.9 - baseAlpha) * t;
}
// How long the dial/marker take to visually glide to each new smoothed
// sample. Short enough to feel responsive, long enough to eliminate the
// frame-to-frame "stepping" that a raw un-animated transform has.
const ROTATION_ANIM_MS = 180;
// FIX: the animated rotation itself runs entirely on the UI thread via
// Reanimated and doesn't need React state at all — but the previous
// version called setHeading() (a React state update) on every single
// sensor sample, which forces a full component re-render each time
// (recalculating qiblaRelative/aligned, re-running the alignment effect,
// reconciling ~28 child views). That JS-thread work competing with the
// sensor callback's own cadence was a real, separate source of visible
// stutter, independent of the animation quality itself. Throttling how
// often the DISPLAY state updates (while still feeding the animation at
// full raw sample rate) removes that contention — the alignment/haptic
// logic and the on-screen degree readout don't need 100Hz updates to feel
// responsive; a few times a second is already imperceptibly fast for those.
const DISPLAY_STATE_THROTTLE_MS = 200;

type PermState = "undetermined" | "granted" | "denied";

// Shortest signed angular distance from `current` to `target`, in the
// range (-180, 180]. Used both for the exponential smoothing filter and
// to keep the animated rotation always taking the shortest path — without
// this, crossing the 0°/360° boundary would otherwise make the dial spin
// almost all the way around instead of a couple of degrees.
function angularDelta(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

export default function QiblaScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();

  const [perm, setPerm] = useState<PermState>("undetermined");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [heading, setHeading] = useState(0);
  const [qibla, setQibla] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingSub = useRef<Location.LocationSubscription | null>(null);
  const magSub = useRef<{ remove: () => void } | null>(null);
  const headingReceived = useRef(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasAligned = useRef(false);

  // Continuous (never-wrapping) accumulated heading — this is what
  // actually drives the animated rotation. Using a value that just keeps
  // accumulating rather than resetting to 0-360 means a `rotate` transform
  // can always animate smoothly through it with no special-casing, since
  // e.g. "725deg" renders identically to "5deg".
  const unwrappedHeadingRef = useRef(0);
  // The wrapped (0-360), smoothed heading — used for the on-screen degree
  // readouts and the alignment/haptic logic, unchanged from before other
  // than now being smoothed rather than raw.
  const smoothedHeadingRef = useRef(0);
  const headingInitializedRef = useRef(false);

  // Drives both the dial and the Kaaba marker's rotation. Negative of the
  // continuous heading, matching the original `-heading` convention.
  const rotation = useSharedValue(0);

  const stopHeading = useCallback(() => {
    headingSub.current?.remove();
    headingSub.current = null;
    magSub.current?.remove();
    magSub.current = null;
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    // Reset alignment tracking so re-entering the screen doesn't immediately
    // fire a stale haptic based on the last known heading before we left.
    wasAligned.current = false;
    // Force the next sample after re-focusing to snap directly rather than
    // animating from a now-stale accumulated value.
    headingInitializedRef.current = false;
  }, []);

  const lastStateUpdateAtRef = useRef(0);
  const sampleCountRef = useRef(0);
  const lastSampleAtRef = useRef(0);

  // Single entry point for every incoming heading sample, regardless of
  // which sensor source it came from. Applies the smoothing filter, then
  // updates the continuous accumulator that drives the animated rotation
  // (every sample, full rate) — but only pushes a React state update
  // (used for the degree readout + alignment/haptic logic) at most every
  // DISPLAY_STATE_THROTTLE_MS, so frequent sensor samples don't force a
  // full component re-render each time.
  const handleHeadingSample = useCallback((raw: number, source: "fused" | "raw") => {
    const now = Date.now();
    // DIAGNOSTIC: logs actual sample cadence + source once a second, so if
    // this still feels rough we have real data (how often samples truly
    // arrive, and from which source) instead of guessing at settings again.
    sampleCountRef.current += 1;
    if (now - lastSampleAtRef.current > 1000) {
      console.log(
        "Qibla heading sample:",
        source,
        "raw=",
        Math.round(raw),
        "samplesInLastSecond=",
        sampleCountRef.current,
      );
      sampleCountRef.current = 0;
      lastSampleAtRef.current = now;
    }

    if (!headingInitializedRef.current) {
      // First sample after (re)starting — snap directly, nothing to smooth
      // or animate from yet.
      unwrappedHeadingRef.current = raw;
      smoothedHeadingRef.current = raw;
      rotation.value = -raw;
      headingInitializedRef.current = true;
      setHeading(raw);
      lastStateUpdateAtRef.current = now;
      return;
    }
    const rawDelta = angularDelta(raw, smoothedHeadingRef.current);
    const alpha = adaptiveAlpha(
      source === "fused" ? SMOOTHING_ALPHA_FUSED : SMOOTHING_ALPHA_RAW,
      Math.abs(rawDelta),
    );
    const smoothedDelta = rawDelta * alpha;
    smoothedHeadingRef.current = ((smoothedHeadingRef.current + smoothedDelta) % 360 + 360) % 360;
    unwrappedHeadingRef.current += smoothedDelta;
    // Always feed the animation, every sample — this runs on the UI thread
    // and is what actually needs to be buttery-smooth.
    rotation.value = withTiming(-unwrappedHeadingRef.current, {
      duration: ROTATION_ANIM_MS,
      easing: Easing.out(Easing.quad),
    });
    // Only update React state (display readout + alignment/haptics) at a
    // throttled rate — this does NOT affect the visual rotation above.
    if (now - lastStateUpdateAtRef.current >= DISPLAY_STATE_THROTTLE_MS) {
      setHeading(smoothedHeadingRef.current);
      lastStateUpdateAtRef.current = now;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Direct magnetometer hardware reading (fallback / continuous updates).
  const startMagnetometer = useCallback(() => {
    if (magSub.current) return;
    Magnetometer.setUpdateInterval(120);
    magSub.current = Magnetometer.addListener(({ x, y }) => {
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      angle = (angle + 360) % 360;
      handleHeadingSample(angle, "raw");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { status, canAskAgain: cAsk } = await Location.requestForegroundPermissionsAsync();
      setCanAskAgain(cAsk);
      if (status !== "granted") {
        setPerm("denied");
        return;
      }
      setPerm("granted");

      // GPS position: try a fast last-known fix first, then a precise reading.
      let pos = await Location.getLastKnownPositionAsync();
      if (!pos) {
        pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }
      if (pos) {
        const { latitude, longitude } = pos.coords;
        setQibla(qiblaBearing(latitude, longitude));
        setDistance(distanceToKaabaKm(latitude, longitude));
      }

      if (Platform.OS === "web") {
        setError("Live compass needs your phone's sensors. Open in Expo Go or a build on your device.");
        return;
      }

      // Heading: prefer the OS-calibrated compass; fall back to the raw
      // magnetometer hardware if the compass API doesn't emit.
      headingReceived.current = false;
      try {
        headingSub.current = await Location.watchHeadingAsync((h) => {
          const val = h.trueHeading != null && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (val != null && !isNaN(val)) {
            headingReceived.current = true;
            // FIX: if watchHeadingAsync took long enough to start emitting
            // that the 1.5s fallback timer below already kicked in, the
            // raw magnetometer could still be running here too — two
            // independent, un-coordinated sensor sources both calling into
            // the same heading handler was a real source of roughness
            // (competing raw + fused readings fighting each other). Now
            // that the OS-fused compass is confirmed live, stop the
            // fallback so only one source drives the heading at a time.
            if (magSub.current) {
              magSub.current.remove();
              magSub.current = null;
            }
            handleHeadingSample(val, "fused");
          }
        });
      } catch {
        startMagnetometer();
      }
      fallbackTimer.current = setTimeout(() => {
        if (!headingReceived.current) startMagnetometer();
      }, 1500);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not get your location.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMagnetometer]);

  // Start sensors only while this tab is actually focused, and stop them the
  // instant it loses focus (tab switch) — not just on true unmount. Expo
  // Router keeps tab screens mounted in the background, so a plain useEffect
  // cleanup on unmount alone would leave the compass/magnetometer running
  // (and vibrating) while the user is on a different tab entirely.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const { status, canAskAgain: cAsk } = await Location.getForegroundPermissionsAsync();
        setCanAskAgain(cAsk);
        if (status === "granted") {
          start();
        } else {
          setPerm(status === "denied" ? "denied" : "undetermined");
        }
      })();
      return () => stopHeading();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [start, stopHeading]),
  );

  const qiblaRelative = qibla != null ? (qibla - heading + 360) % 360 : 0;
  const aligned = qibla != null && (qiblaRelative < 6 || qiblaRelative > 354);

  useEffect(() => {
    if (aligned && !wasAligned.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      wasAligned.current = true;
    } else if (!aligned) {
      wasAligned.current = false;
    }
  }, [aligned]);

  // Dial rotation: directly the (continuous, smoothed) heading accumulator.
  const dialAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // Kaaba marker rotation: since rotation.value === -unwrappedHeading, and
  // the marker needs (qibla - heading), this is just qibla + rotation.value
  // — deriving it directly from the same shared value keeps the two
  // perfectly in sync with no extra bookkeeping or separate wraparound
  // handling needed.
  const kaabaAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(qibla ?? 0) + rotation.value}deg` }],
  }));

  const cardinals = [
    { label: "N", angle: 0 },
    { label: "E", angle: 90 },
    { label: "S", angle: 180 },
    { label: "W", angle: 270 },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Qibla</Text>
        <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
          Face the Kaaba direction using your compass
        </Text>
      </View>

      <View style={styles.body}>
        {perm !== "granted" ? (
          <View style={styles.permWrap}>
            <View style={[styles.permIcon, { backgroundColor: colors.brandTertiary }]}>
              <MaterialCommunityIcons name="compass-outline" size={44} color={colors.brand} />
            </View>
            <Text style={[styles.permTitle, { color: colors.onSurface }]}>Find the Qibla</Text>
            <Text style={[styles.permSub, { color: colors.onSurfaceTertiary }]}>
              We use your location to calculate the exact direction to the Kaaba, and your compass to guide you.
            </Text>
            {perm === "denied" && !canAskAgain ? (
              <Pressable testID="qibla-open-settings" onPress={() => Linking.openSettings()} style={[styles.permBtn, { backgroundColor: colors.brand }]}>
                <Text style={[styles.permBtnText, { color: colors.onBrandPrimary }]}>Open Settings</Text>
              </Pressable>
            ) : (
              <Pressable testID="qibla-enable-btn" onPress={start} style={[styles.permBtn, { backgroundColor: colors.brand }]}>
                <Text style={[styles.permBtnText, { color: colors.onBrandPrimary }]}>Enable Location</Text>
              </Pressable>
            )}
            {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
          </View>
        ) : (
          <>
            <View
              testID="qibla-status"
              style={[
                styles.statusPill,
                { backgroundColor: aligned ? colors.success : colors.surfaceTertiary },
              ]}
            >
              <Ionicons name={aligned ? "checkmark-circle" : "navigate"} size={16} color={aligned ? "#fff" : colors.onSurfaceTertiary} />
              <Text style={[styles.statusText, { color: aligned ? "#fff" : colors.onSurfaceTertiary }]}>
                {aligned ? "Facing the Qibla" : "Turn to align with the Qibla"}
              </Text>
            </View>

            {/* Compass */}
            <View style={[styles.compass, { borderColor: aligned ? colors.success : colors.borderStrong, backgroundColor: colors.surface }]}>
              {/* fixed top indicator (device facing) */}
              <View style={[styles.topPointer, { borderBottomColor: aligned ? colors.success : colors.brand }]} />

              {/* rotating dial with cardinals — animated via Reanimated for
                  smooth motion, rather than snapping instantly to every raw
                  sensor sample. */}
              <Animated.View style={[styles.fill, dialAnimatedStyle]}>
                {cardinals.map((c) => (
                  <View
                    key={c.label}
                    style={[styles.cardinalWrap, { transform: [{ rotate: `${c.angle}deg` }] }]}
                  >
                    <Text
                      style={[
                        styles.cardinal,
                        { color: c.label === "N" ? colors.error : colors.onSurfaceTertiary },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </View>
                ))}
                {Array.from({ length: 24 }).map((_, i) => (
                  <View key={i} style={[styles.tickWrap, { transform: [{ rotate: `${i * 15}deg` }] }]}>
                    <View style={[styles.tick, { backgroundColor: colors.border, height: i % 6 === 0 ? 14 : 8 }]} />
                  </View>
                ))}
              </Animated.View>

              {/* Kaaba marker at the qibla bearing relative to device —
                  same animated approach, derived from the same shared
                  rotation value so it always stays perfectly in sync with
                  the dial. */}
              <Animated.View style={[styles.fill, kaabaAnimatedStyle]} pointerEvents="none">
                <View style={styles.kaabaWrap}>
                  <View style={[styles.kaabaBadge, aligned && { backgroundColor: colors.success }]}>
                    <Image source={require("../../assets/images/kaaba.png")} style={styles.kaabaImg} contentFit="contain" />
                  </View>
                </View>
              </Animated.View>

              {/* center readout */}
              <View style={styles.center}>
                <Text style={[styles.centerDeg, { color: colors.onSurface }]} testID="qibla-degrees">
                  {qibla != null ? `${Math.round(qibla)}°` : "--"}
                </Text>
                <Text style={[styles.centerLabel, { color: colors.onSurfaceTertiary }]}>to Qibla</Text>
              </View>
            </View>

            <View style={styles.readRow}>
              <View style={styles.readItem}>
                <Text style={[styles.readValue, { color: colors.onSurface }]}>{Math.round(heading)}°</Text>
                <Text style={[styles.readLabel, { color: colors.onSurfaceTertiary }]}>Heading</Text>
              </View>
              <View style={[styles.readDivider, { backgroundColor: colors.border }]} />
              <View style={styles.readItem}>
                <Text style={[styles.readValue, { color: colors.onSurface }]}>
                  {distance != null ? `${distance.toLocaleString()} km` : "--"}
                </Text>
                <Text style={[styles.readLabel, { color: colors.onSurfaceTertiary }]}>to Mecca</Text>
              </View>
            </View>

            {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: FONTS.bold, fontSize: 26 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 2 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  permWrap: { alignItems: "center" },
  permIcon: { width: 96, height: 96, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg },
  permTitle: { fontFamily: FONTS.bold, fontSize: 20 },
  permSub: { fontFamily: FONTS.regular, fontSize: 14, textAlign: "center", marginTop: SPACING.sm, lineHeight: 20 },
  permBtn: { marginTop: SPACING.xl, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  permBtnText: { fontFamily: FONTS.bold, fontSize: 15 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    marginBottom: SPACING.xl,
  },
  statusText: { fontFamily: FONTS.semibold, fontSize: 14 },
  compass: {
    width: COMPASS,
    height: COMPASS,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  fill: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  topPointer: {
    position: "absolute",
    top: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 16,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 5,
  },
  cardinalWrap: { position: "absolute", width: COMPASS, height: COMPASS, alignItems: "center" },
  cardinal: { fontFamily: FONTS.bold, fontSize: 16, marginTop: 12 },
  tickWrap: { position: "absolute", width: COMPASS, height: COMPASS, alignItems: "center" },
  tick: { width: 2, borderRadius: 1, marginTop: 6 },
  kaabaWrap: { position: "absolute", width: COMPASS, height: COMPASS, alignItems: "center" },
  kaabaBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  kaabaImg: { width: 40, height: 40 },
  center: { alignItems: "center" },
  centerDeg: { fontFamily: FONTS.bold, fontSize: 40 },
  centerLabel: { fontFamily: FONTS.medium, fontSize: 13, marginTop: -2 },
  readRow: { flexDirection: "row", alignItems: "center", marginTop: SPACING.xxl },
  readItem: { alignItems: "center", paddingHorizontal: SPACING.xl },
  readValue: { fontFamily: FONTS.bold, fontSize: 20 },
  readLabel: { fontFamily: FONTS.medium, fontSize: 12, marginTop: 2 },
  readDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  errorText: { fontFamily: FONTS.medium, fontSize: 13, textAlign: "center", marginTop: SPACING.lg },
});
