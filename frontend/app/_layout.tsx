import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { AppState, LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AppProvider } from "@/src/context/AppContext";
import { NowProvider } from "@/src/context/NowContext";
import CustomSplashOverlay from "@/src/components/CustomSplashOverlay";
import {
  getLaunchAlarm,
  registerBackgroundAlarmHandler,
  registerForegroundAlarmHandler,
} from "@/src/lib/alarm";
// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);
// Register Notifee's background handler once at module load.
registerBackgroundAlarmHandler();

// Hide the 3-button/gesture navigation bar so it doesn't overlap the app's own
// bottom UI. "overlay-swipe" keeps it hidden by default; swiping up from the
// bottom edge briefly reveals it, matching standard Android immersive apps.
function setupImmersiveNavBar() {
  if (Platform.OS !== "android") return;
  try {
    const NavigationBar = require("expo-navigation-bar");
    NavigationBar.setPositionAsync("absolute");
    NavigationBar.setBehaviorAsync("overlay-swipe");
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBackgroundColorAsync("#00000000");
  } catch (e) {
    console.log("setupImmersiveNavBar failed", e);
  }
}

// Routes to the full-screen ring screen when an alarm launches or is delivered.
function AlarmGate() {
  const router = useRouter();
  const checkingRef = useRef(false);

  const checkForAlarm = async (source: string) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const d = await getLaunchAlarm();
      console.log(`GET LAUNCH ALARM RESULT (${source}):`, JSON.stringify(d, null, 2));
      if (d) router.replace({ pathname: "/alarm-ring", params: d as any });
    } finally {
      checkingRef.current = false;
    }
  };

  useEffect(() => {
    let unsub = () => {};

    setupImmersiveNavBar();

    (async () => {
      try {
        const notifee = require("@notifee/react-native").default;
        const settings = await notifee.getNotificationSettings();
        console.log("NOTIFEE SETTINGS:", JSON.stringify(settings, null, 2));
      } catch (e) {
        console.log("NOTIFEE SETTINGS CHECK FAILED:", e);
      }
      await checkForAlarm("mount");
    })();

    unsub = registerForegroundAlarmHandler((d) => {
      console.log("FOREGROUND ALARM EVENT:", JSON.stringify(d, null, 2));
      router.replace({ pathname: "/alarm-ring", params: d as any });
    });

    // The app may be resumed (not freshly mounted) when an alarm's full-screen
    // intent brings an already-running process back to the foreground. In that
    // case the initial mount check above never re-runs, so we also re-check
    // whenever the app transitions to "active".
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkForAlarm("resume");
        setupImmersiveNavBar();
      }
    });

    return () => {
      try {
        unsub();
      } catch {}
      appStateSub.remove();
    };
  }, []);
  return null;
}
// Keep the native splash visible from cold start until icon fonts register.
SplashScreen.preventAutoHideAsync();
export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "Jakarta-Regular": require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "Jakarta-Medium": require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    "Jakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    "Jakarta-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
  });
  const ready = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {ready ? (
        <SafeAreaProvider>
          <NowProvider>
            <AppProvider>
              <BottomSheetModalProvider>
                <StatusBar style="auto" />
                <AlarmGate />
                <Stack screenOptions={{ headerShown: false }} />
              </BottomSheetModalProvider>
            </AppProvider>
          </NowProvider>
        </SafeAreaProvider>
      ) : null}
      {showCustomSplash ? (
        <CustomSplashOverlay
          visible={!ready}
          onFinished={() => setShowCustomSplash(false)}
        />
      ) : null}
    </GestureHandlerRootView>
  );
}
