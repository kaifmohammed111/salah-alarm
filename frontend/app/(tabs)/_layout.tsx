import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Alert, Platform } from "react-native";
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

  return (
    <Tabs
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
        name="alarms"
        options={{
          title: "Alarms",
          tabBarIcon: ({ color, size }) => <Ionicons name="alarm" size={size} color={color} />,
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
        name="upload"
        options={{
          title: "Timetable",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
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
  );
}
