import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AppProvider } from "@/src/context/AppContext";
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
// Routes to the full-screen ring screen when an alarm launches or is delivered.
function AlarmGate() {
  const router = useRouter();
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        const notifee = require("@notifee/react-native").default;
        const settings = await notifee.getNotificationSettings();
        console.log("NOTIFEE SETTINGS:", JSON.stringify(settings, null, 2));
      } catch (e) {
        console.log("NOTIFEE SETTINGS CHECK FAILED:", e);
      }
      const d = await getLaunchAlarm();
      console.log("GET LAUNCH ALARM RESULT:", JSON.stringify(d, null, 2));
      if (d) router.replace({ pathname: "/alarm-ring", params: d as any });
    })();
    unsub = registerForegroundAlarmHandler((d) => {
      console.log("FOREGROUND ALARM EVENT:", JSON.stringify(d, null, 2));
      router.replace({ pathname: "/alarm-ring", params: d as any });
    });
    return () => {
      try {
        unsub();
      } catch {}
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
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <BottomSheetModalProvider>
            <StatusBar style="auto" />
            <AlarmGate />
            <Stack screenOptions={{ headerShown: false }} />
          </BottomSheetModalProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
