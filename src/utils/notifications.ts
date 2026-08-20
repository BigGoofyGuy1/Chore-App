import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "@react-native-firebase/firestore";
import { db } from "../firebase";
import { Profile } from "../types";

const DEFAULT_CHANNEL_ID = "default";

function getProjectId() {
  const expoConfigExtra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string }; projectId?: string }
    | undefined;

  return (
    Constants.easConfig?.projectId ??
    expoConfigExtra?.eas?.projectId ??
    expoConfigExtra?.projectId ??
    null
  );
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "web") return null;

  // Android 13 does not display the notification permission prompt until a
  // channel exists. This must also complete before requesting an Expo token.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: "Chore reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Missing EAS project ID for push notifications.");
  }

  return (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;
}

export async function savePrivatePushToken(profile: Profile, pushToken: string) {
  await setDoc(
    doc(collection(db, "memberPrivate"), profile.uid),
    {
      familyCode: profile.familyCode,
      pushToken,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function syncPrivatePushToken(profile: Profile) {
  const pushToken = await registerForPushNotificationsAsync();
  if (!pushToken) return null;
  await savePrivatePushToken(profile, pushToken);
  return pushToken;
}
