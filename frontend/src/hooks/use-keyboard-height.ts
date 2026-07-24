import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

// Tracks the live on-screen keyboard height so screens/modals can add
// exactly enough extra scroll room or lift-up padding to keep a focused
// field visible — without relying on Android's native windowSoftInputMode
// resize behavior, which becomes unreliable once edgeToEdgeEnabled is on
// (a widely-known Expo/RN interaction on Android 14/15+), and without
// reintroducing KeyboardAvoidingView's behavior="height" on Android, which
// this project already found causes a footer-restore bug on this exact
// editor screen (see docs/known-issues.md).
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
