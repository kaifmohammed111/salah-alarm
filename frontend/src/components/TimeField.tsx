import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput } from "react-native";

import { FONTS, RADIUS, SPACING, ThemeColors } from "@/src/theme";

type Props = {
  value: string;
  onChange: (v: string) => void;
  testID: string;
  colors: ThemeColors;
};

// Holds its own text locally so parent re-renders (e.g. the 1s ticking clock)
// never remount or reset the input mid-typing — this keeps the keyboard open
// and prevents the cursor from jumping. External value changes (switching days)
// are synced only while the field is not focused.
export default function TimeField({ value, onChange, testID, colors }: Props) {
  const [text, setText] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current && value !== text) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <TextInput
      testID={testID}
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
      }}
      onChangeText={(v) => {
        setText(v);
        onChange(v);
      }}
      placeholder="--:--"
      placeholderTextColor={colors.muted}
      maxLength={5}
      keyboardType="numbers-and-punctuation"
      style={[
        styles.input,
        { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    width: 76,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    textAlign: "center",
  },
});
