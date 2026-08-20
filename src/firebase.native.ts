import { getApp } from "@react-native-firebase/app";
import { getAuth, connectAuthEmulator } from "@react-native-firebase/auth";
import { getFirestore, connectFirestoreEmulator, serverTimestamp, Timestamp } from "@react-native-firebase/firestore";
import { getStorage, connectStorageEmulator } from "@react-native-firebase/storage";
import { firebaseEmulatorHost, shouldUseFirebaseEmulators } from "./utils/firebaseEmulatorConfig";

// The default native app is initialized from google-services.json at process launch.
const app = getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Firebase emulators are opt-in so a normal Android Studio debug run uses the
// deployed backend. Set EXPO_PUBLIC_FIREBASE_EMULATOR_HOST (or FORCE) to opt in.
if (__DEV__) {
  const emulatorState = globalThis as typeof globalThis & {
    __FIREBASE_EMULATOR_CONNECTED?: boolean;
  };
  const hasConnected = emulatorState.__FIREBASE_EMULATOR_CONNECTED;
  if (!hasConnected) {
    if (shouldUseFirebaseEmulators) {
      try {
        connectAuthEmulator(auth, `http://${firebaseEmulatorHost}:9099`, { disableWarnings: true });
        connectFirestoreEmulator(db, firebaseEmulatorHost, 8080);
        connectStorageEmulator(storage, firebaseEmulatorHost, 9199);
        console.log(`Connected to Firebase Emulators at ${firebaseEmulatorHost}`);
        emulatorState.__FIREBASE_EMULATOR_CONNECTED = true;
      } catch (e) {
        console.log("Failed to connect to emulators:", e);
      }
    }
  }
}

// Helpers
export const firebaseServerTimestamp = serverTimestamp;
export const timestampFromDate = (date: Date) => Timestamp.fromDate(date);
