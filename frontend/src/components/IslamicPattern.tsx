import React from "react";
import { StyleSheet, View } from "react-native";

// A classic Islamic geometric motif (8-pointed star / Rub el Hizb), built
// from two square outlines, one rotated 45° relative to the other, both
// centered at the same point. Deliberately simple: this project's own
// known-issues.md documents hand-derived curved/arc path math as a
// repeated source of hard-to-debug rendering bugs elsewhere in the app —
// plain rotated rectangles are easy to verify correct and render
// consistently everywhere.
function EightPointStar({
  x,
  y,
  size,
  opacity,
  color,
}: {
  x: number;
  y: number;
  size: number;
  opacity: number;
  color: string;
}) {
  return (
    <View style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size }} pointerEvents="none">
      <View style={{ position: "absolute", width: size, height: size, borderWidth: 1, borderColor: color, opacity }} />
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderWidth: 1,
          borderColor: color,
          opacity,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </View>
  );
}

export default function IslamicPattern({
  width,
  height,
  color = "#E8B84B",
  opacity = 0.05,
  cellSize = 70,
}: {
  width: number;
  height: number;
  color?: string;
  opacity?: number;
  cellSize?: number;
}) {
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  const stars: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      stars.push({ x: c * cellSize, y: r * cellSize });
    }
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <EightPointStar key={i} x={s.x} y={s.y} size={cellSize * 0.55} opacity={opacity} color={color} />
      ))}
    </View>
  );
}
