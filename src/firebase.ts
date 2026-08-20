import { getApp } from "@react-native-firebase/app";
import { connectAuthEmulator, getAuth } from "@react-native-firebase/auth";
import { connectFirestoreEmulator, getFirestore, serverTimestamp, Timestamp } from "@react-native-firebase/firestore";
import { connectStorageEmulator, getStorage } from "@react-native-firebase/storage";
import { firebaseEmulatorHost, shouldUseFirebaseEmulators } from "./utils/firebaseEmulatorConfig";

// The default native app is initialized from google-services.json at process launch.
const app = getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (__DEV__) {
  const emulatorState = globalThis as typeof globalThis & {
    __FIREBASE_EMULATOR_CONNECTED?: boolean;
  };
  const hasConnected = emulatorState.__FIREBASE_EMULATOR_CONNECTED;
  if (!hasConnected) {
    if (shouldUseFirebaseEmulators) {
      connectAuthEmulator(auth, `http://${firebaseEmulatorHost}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(db, firebaseEmulatorHost, 8080);
      connectStorageEmulator(storage, firebaseEmulatorHost, 9199);

      emulatorState.__FIREBASE_EMULATOR_CONNECTED = true;
    }
  }
}

// Helpers
export const firebaseServerTimestamp = serverTimestamp;
export const timestampFromDate = (date: Date) => Timestamp.fromDate(date);
