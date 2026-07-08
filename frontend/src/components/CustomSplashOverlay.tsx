import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Image, StyleSheet } from "react-native";

const { width, height } = Dimensions.get("window");
const BG = "#01122D";

type Props = {
  visible: boolean;
  onFinished: () => void;
  minDurationMs?: number;
};

export default function CustomSplashOverlay({ visible, onFinished, minDurationMs = 1800 }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const shownAtRef = useRef(Date.now());

  useEffect(() => {
    shownAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (visible) return;
    const elapsed = Date.now() - shownAtRef.current;
    const wait = Math.max(0, minDurationMs - elapsed);
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => onFinished());
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Animated.View style={[styles.root, { opacity }]} pointerEvents="none">
      <Image
        source={require("../../assets/images/splash-image.png")}
        style={styles.image}
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
