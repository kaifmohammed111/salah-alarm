import notifee from "@notifee/react-native";

notifee.onBackgroundEvent(async ({ type, detail }) => {
  // Full-screen intent handles launching the ring activity directly;
  // this just needs to exist so Android's headless task lookup succeeds.
});

import "expo-router/entry";
