import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiBase } from "./api";

/**
 * Native push registration (docs/domain/app.md): the device's Expo push token
 * is stored server-side (kind "expo") and announcement fan-out reaches it via
 * Expo's push API. Requires a physical device; in Expo Go some SDKs limit
 * remote push — errors surface in the toggle rather than crashing.
 */

const enabledKey = (publicAppId: string) => `cms.pushEnabled.${publicAppId}`;

// Show notifications while the app is foregrounded too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getExpoToken(): Promise<string> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Announcements",
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Notifications were not allowed.");

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const result = await Notifications.getExpoPushTokenAsync(
    typeof projectId === "string" && projectId ? { projectId } : undefined,
  );
  return result.data;
}

export async function isPushEnabled(publicAppId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(enabledKey(publicAppId))) === "1";
}

export async function enablePush(publicAppId: string, authToken: string): Promise<void> {
  const expoToken = await getExpoToken();
  const res = await fetch(`${apiBase()}/api/app/v1/apps/${encodeURIComponent(publicAppId)}/push/register`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ expo_push_token: expoToken }),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(json.message ?? "Could not enable notifications.");
  await AsyncStorage.setItem(enabledKey(publicAppId), "1");
}

export async function disablePush(publicAppId: string, authToken: string): Promise<void> {
  try {
    const expoToken = await getExpoToken();
    await fetch(`${apiBase()}/api/app/v1/apps/${encodeURIComponent(publicAppId)}/push/unregister`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ expo_push_token: expoToken }),
    });
  } catch {
    /* token unavailable (permissions revoked) — local flag still clears */
  }
  await AsyncStorage.removeItem(enabledKey(publicAppId));
}
