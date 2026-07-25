import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, TextInput, findNodeHandle } from "react-native";
import { FONTS, RADIUS, SPACING, ThemeColors } from "@/src/theme";

type Props = {
  value: string;
  onChange: (v: string) => void;
  testID: string;
  colors: ThemeColors;
  // Optional: the parent screen's ScrollView ref. When provided, focusing
  // this field auto-scrolls it into view — needed because Android's native
  // keyboard-resize behavior (which used to make the OS shift focused
  // fields into view automatically) is unreliable once edgeToEdgeEnabled
  // is on (see the padding fix in editor.tsx/upload.tsx). Without this,
  // a field near the bottom of the list is merely reachable by manually
  // scrolling, not automatically visible on focus.
  scrollViewRef?: React.RefObject<ScrollView | null>;
};

// Holds its own text locally so parent re-renders (e.g. the 1s ticking clock)
// never remount or reset the input mid-typing — this keeps the keyboard open
// and prevents the cursor from jumping. External value changes (switching days)
// are synced only while the field is not focused.
export default function TimeField({ value, onChange, testID, colors, scrollViewRef }: Props) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!focused.current && value !== text) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const scrollIntoView = () => {
    if (!scrollViewRef?.current || !inputRef.current) return;
    const scrollHandle = findNodeHandle(scrollViewRef.current);
    if (!scrollHandle) return;
    // measureLayout gives this field's position relative to the ScrollView's
    // own content — an absolute offset scrollTo can use directly, no need
    // to track current scroll position or compute a delta.
    (inputRef.current as any).measureLayout(
      scrollHandle,
      (_x: number, y: number) => {
        // Leave a little breathing room above the field rather than
        // snapping it to the very top edge of the scroll viewport.
        scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
      },
      () => {},
    );
  };

  return (
    <TextInput
      ref={inputRef}
      testID={testID}
      value={text}
      onFocus={() => {
        focused.current = true;
        // Small delay lets focus/layout settle before measuring — measuring
        // in the same tick as onFocus can occasionally read a stale layout.
        setTimeout(scrollIntoView, 50);
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
