import { getApp, getApps, initializeApp } from "@react-native-firebase/app";
import { Platform } from "react-native";
import { connectAuthEmulator, getAuth } from "@react-native-firebase/auth";
import { connectFirestoreEmulator, getFirestore, serverTimestamp, Timestamp } from "@react-native-firebase/firestore";
import functionsModule from "@react-native-firebase/functions";
import { connectStorageEmulator, getStorage } from "@react-native-firebase/storage";

// Ensure Firebase is initialized and use the app-specific getter to avoid deprecation warnings
const app = getApps().length === 0 ? initializeApp() : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = functionsModule(app);
export const storage = getStorage(app);

if (__DEV__) {
  const hasConnected = (globalThis as any).__FIREBASE_EMULATOR_CONNECTED;
  if (!hasConnected) {
    const emulatorHost = Platform.OS === "android" ? "10.0.2.2" : "localhost";

    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
    functions.useEmulator(emulatorHost, 5001);
    connectStorageEmulator(storage, emulatorHost, 9199);

    (globalThis as any).__FIREBASE_EMULATOR_CONNECTED = true;
  }
}

// Helpers
export const firebaseServerTimestamp = serverTimestamp;
export const timestampFromDate = (date: Date) => Timestamp.fromDate(date);
