import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, Image, StyleSheet } from "react-native";

const { width, height } = Dimensions.get("window");
const BG = "#01122D";

type Props = {
  visible: boolean;
  onFinished: () => void;
  minDurationMs?: number;
};

export default function CustomSplashOverlay({ visible, onFinished, minDurationMs = 1800 }: Props) {
  // FIX: previously started at opacity 1 with no entrance at all, and
  // exited with a flat fade. Now: fade+scale IN on mount, a slow subtle
  // "breathing" pulse while waiting for the app to be ready, and an
  // expanding-dissolve exit (fade + slight scale-up together) rather than
  // a plain fade — reads as noticeably more polished/intentional.
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const shownAtRef = useRef(Date.now());
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    shownAtRef.current = Date.now();

    // Entrance: fade + scale up to rest, then start the idle pulse once
    // settled.
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.03,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseAnimRef.current = pulse;
      pulse.start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (visible) return;
    const elapsed = Date.now() - shownAtRef.current;
    const wait = Math.max(0, minDurationMs - elapsed);
    const t = setTimeout(() => {
      // Stop the idle pulse before starting the exit animation, so they
      // don't fight over the same `scale` value mid-flight.
      pulseAnimRef.current?.stop();
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 420,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 420,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => onFinished());
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Animated.View style={[styles.root, { opacity }]} pointerEvents="none">
      <Animated.Image
        source={require("../../assets/images/splash-image.png")}
        style={[styles.image, { transform: [{ scale }] }]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  image: {
    width: width,
    height: height,
  },
});
