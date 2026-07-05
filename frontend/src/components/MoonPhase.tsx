import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { getMoonInfo } from "@/src/lib/moon";

type Props = {
  size: number;
  now: Date;
  backgroundColor: string; // used for the shadow so it blends with the hero bg
};

const MOON_LIGHT = "#D8E4EA";
const CRATER = "rgba(90,120,130,0.28)";
const HIGHLIGHT = "rgba(255,255,255,0.18)";

// Live moon-phase disc. The lit moon is a circle; an identical background-coloured
// circle is offset horizontally to carve out the current illuminated fraction,
// producing a real crescent/gibbous terminator that shifts as time passes.
export default function MoonPhase({ size, now, backgroundColor }: Props) {
  const { illumination, waxing } = getMoonInfo(now);

  // Reveal 0 (new) -> size (full). Direction depends on waxing/waning.
  const reveal = illumination * size;
  const shadowTranslate = waxing ? -reveal : reveal;

  // Gentle floating so the moon feels alive.
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [bob]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value * 8 - 4 }, { rotate: `${bob.value * 2 - 1}deg` }],
  }));

  const r = size / 2;

  return (
    <Animated.View style={[{ width: size, height: size }, floatStyle]}>
      <View style={[styles.disc, { width: size, height: size, borderRadius: r, backgroundColor: MOON_LIGHT }]}>
        {/* craters */}
        <View style={[styles.crater, { width: size * 0.16, height: size * 0.16, borderRadius: size * 0.08, left: size * 0.2, top: size * 0.28 }]} />
        <View style={[styles.crater, { width: size * 0.1, height: size * 0.1, borderRadius: size * 0.05, left: size * 0.28, top: size * 0.55 }]} />
        <View style={[styles.crater, { width: size * 0.13, height: size * 0.13, borderRadius: size * 0.065, left: size * 0.58, top: size * 0.62 }]} />
        <View style={[styles.highlight, { width: size * 0.12, height: size * 0.12, borderRadius: size * 0.06, left: size * 0.15, top: size * 0.5 }]} />

        {/* shadow that carves the phase */}
        <View
          style={[
            styles.shadow,
            {
              width: size,
              height: size,
              borderRadius: r,
              backgroundColor,
              transform: [{ translateX: shadowTranslate }],
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  disc: { overflow: "hidden" },
  crater: { position: "absolute", backgroundColor: CRATER },
  highlight: { position: "absolute", backgroundColor: HIGHLIGHT },
  shadow: { position: "absolute", left: 0, top: 0 },
});
