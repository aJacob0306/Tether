import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getErrorMessage } from "./errors";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getExpoProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    throw new Error("Missing EAS project ID in app.json (extra.eas.projectId).");
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResult.data;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return token;
}

export async function savePushTokenToSupabase(token: string): Promise<void> {
  const platform = Platform.OS === "ios" ? "ios" : Platform.OS;

  const { error } = await supabase.rpc("register_push_token", {
    p_token: token,
    p_platform: platform,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to save push token."));
  }
}

export async function setupPushNotificationsForUser(): Promise<string | null> {
  const token = await registerForPushNotifications();
  if (!token) return null;

  await savePushTokenToSupabase(token);
  return token;
}
