import { useEffect, useRef } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Alert, Platform, View } from "react-native";
import { AdEventType, BannerAd, BannerAdSize, InterstitialAd, TestIds } from "react-native-google-mobile-ads";
import { useNavigationState } from "@react-navigation/native";
import { useApp } from "@/src/context/AppContext";
import { FONTS } from "@/src/theme";
import { settingsGuard } from "@/src/utils/settingsGuard";

export default function TabsLayout() {
  const { colors, isDark } = useApp();
  // Tracks the currently focused tab route name so the tabPress interceptor
  // below can tell whether the user is navigating AWAY from Settings
  // specifically (vs. just re-pressing it, or pressing another tab while
  // already elsewhere).
  const currentRouteName = useNavigationState((state) => {
    if (!state) return undefined;
    return state.routes[state.index]?.name;
  });

  // Interstitial: shown on genuine tab switches (a natural break point,
  // matching Google's own guidance — not an arbitrary background timer),
  // with a cooldown so it doesn't fire on every single switch. Loaded
  // ahead of time and reloaded automatically once dismissed, so there's
  // no visible delay when it's actually time to show one.
  const interstitialRef = useRef<InterstitialAd | null>(null);
  const interstitialLoadedRef = useRef(false);
  const lastShownRef = useRef(0);
  const isFirstRender = useRef(true);
  const INTERSTITIAL_COOLDOWN_MS = 2 * 60 * 1000;

  useEffect(() => {
    const loadInterstitial = () => {
      const interstitial = InterstitialAd.createForAdRequest(TestIds.INTERSTITIAL);
      interstitialLoadedRef.current = false;
      const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        interstitialLoadedRef.current = true;
      });
      const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        // Preload the next one immediately once this one is dismissed.
        loadInterstitial();
      });
      const unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, (e) => {
        console.warn("Interstitial failed to load", e);
      });
      interstitial.load();
      interstitialRef.current = interstitial;
      // Listeners are per-ad-instance and get replaced wholesale by the
      // next loadInterstitial() call, so there's no separate cleanup
      // needed beyond what the component unmount effect below handles.
      void unsubscribeLoaded;
      void unsubscribeClosed;
      void unsubscribeError;
    };
    loadInterstitial();
  }, []);

  useEffect(() => {
    // Skip the very first mount — only real tab SWITCHES should count,
    // not just landing on the initial tab.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastShownRef.current < INTERSTITIAL_COOLDOWN_MS) return;
    if (interstitialLoadedRef.current && interstitialRef.current) {
      interstitialRef.current.show();
      lastShownRef.current = now;
      interstitialLoadedRef.current = false;
    }
  }, [currentRouteName]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
    <Tabs
      style={{ flex: 1 }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: FONTS.medium, fontSize: 10 },
      }}
      screenListeners={({ navigation, route }) => ({
        tabPress: (e) => {
          Haptics.selectionAsync();

          // Only intercept when currently ON settings, navigating to a
          // DIFFERENT tab, with unsaved changes present.
          if (currentRouteName !== "settings" || route.name === "settings") return;
          if (!settingsGuard.isDirty) return;

          e.preventDefault();
          Alert.alert(
            "Unsaved changes",
            "You have unsaved settings changes. Save before leaving?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Discard",
                style: "destructive",
                onPress: () => {
                  settingsGuard.discard();
                  settingsGuard.isDirty = false;
                  navigation.navigate(route.name as never);
                },
              },
              {
                text: "Save",
                onPress: () => {
                  settingsGuard.save();
                  settingsGuard.isDirty = false;
                  navigation.navigate(route.name as never);
                },
              },
            ],
          );
        },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="qibla"
        options={{
          title: "Qibla",
          tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dhikr"
        options={{
          title: "Dhikr",
          tabBarIcon: ({ color, size }) => <Ionicons name="finger-print" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="quran"
        options={{
          title: "Quran",
          tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: "Timetable",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="how-to-pray"
        options={{
          title: "How to Pray",
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
    {/* TEST — banner ad on every page, verifying the tab bar above it
        stays fully clickable. Not a final placement decision; revisit
        once this is confirmed. */}
    <BannerAd
      unitId={TestIds.BANNER}
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      onAdFailedToLoad={(e) => console.warn("Tab bar test banner failed to load", e)}
    />
    </View>
  );
}
