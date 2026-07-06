import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { FONTS, RADIUS } from "@/src/theme";

const KNOB = 60;

type Props = {
  label?: string;
  onDismiss: () => void;
};

// Slide the knob to the right to dismiss (like a native alarm).
export default function SwipeToDismiss({ label = "Slide to dismiss", onDismiss }: Props) {
  const [trackW, setTrackW] = useState(0);
  const x = useSharedValue(0);
  const maxX = Math.max(0, trackW - KNOB - 8);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const nx = Math.min(Math.max(0, e.translationX), maxX);
      x.value = nx;
    })
    .onEnd(() => {
      if (maxX > 0 && x.value >= maxX * 0.7) {
        x.value = withTiming(maxX, { duration: 120 }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        });
      } else {
        x.value = withSpring(0);
      }
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + KNOB }));

  return (
    <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.fill, fillStyle]} />
      <Text style={styles.label}>{label}</Text>
      <GestureDetector gesture={pan}>
        <Animated.View testID="alarm-dismiss-knob" style={[styles.knob, knobStyle]}>
          <Ionicons name="chevron-forward" size={26} color="#20403B" />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: KNOB + 8,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: RADIUS.pill,
  },
  label: {
    textAlign: "center",
    color: "rgba(255,255,255,0.9)",
    fontFamily: FONTS.semibold,
    fontSize: 15,
  },
  knob: {
    position: "absolute",
    left: 4,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
