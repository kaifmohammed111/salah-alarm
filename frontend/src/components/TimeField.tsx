import React from "react";
import { StyleSheet, TextInput } from "react-native";

import { FONTS, RADIUS, SPACING, ThemeColors } from "@/src/theme";

type Props = {
  value: string;
  onChange: (v: string) => void;
  testID: string;
  colors: ThemeColors;
};

export default function TimeField({ value, onChange, testID, colors }: Props) {
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChange}
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
