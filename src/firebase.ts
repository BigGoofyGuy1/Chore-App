import { getApp, getApps, initializeApp } from "@react-native-firebase/app";
import { Platform } from "react-native";
import { connectAuthEmulator, getAuth } from "@react-native-firebase/auth";
import { connectFirestoreEmulator, getFirestore, serverTimestamp, Timestamp } from "@react-native-firebase/firestore";
import { connectStorageEmulator, getStorage } from "@react-native-firebase/storage";
import * as Device from "expo-device";

// Ensure Firebase is initialized and use the app-specific getter to avoid deprecation warnings
const app = getApps().length === 0 ? initializeApp() : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (__DEV__) {
  const hasConnected = (globalThis as any).__FIREBASE_EMULATOR_CONNECTED;
  if (!hasConnected) {
    const disableEmulators = process.env.EXPO_PUBLIC_DISABLE_EMULATORS === "1";
    const emulatorHostEnv = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
    const emulatorHostDefault = Platform.OS === "android" ? "10.0.2.2" : "localhost";
    const emulatorHost = emulatorHostEnv?.length ? emulatorHostEnv : emulatorHostDefault;
    const forceEmulators = process.env.EXPO_PUBLIC_FORCE_FIREBASE_EMULATORS === "1";
    const shouldUseEmulators =
      !disableEmulators && (!Device.isDevice || forceEmulators || Boolean(emulatorHostEnv?.length));

    if (shouldUseEmulators) {
      connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(db, emulatorHost, 8080);
      connectStorageEmulator(storage, emulatorHost, 9199);

      (globalThis as any).__FIREBASE_EMULATOR_CONNECTED = true;
    }
  }
}

// Helpers
export const firebaseServerTimestamp = serverTimestamp;
export const timestampFromDate = (date: Date) => Timestamp.fromDate(date);
