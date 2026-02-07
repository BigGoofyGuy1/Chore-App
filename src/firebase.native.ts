import { getApp, getApps, initializeApp } from "@react-native-firebase/app";
import { getAuth, connectAuthEmulator } from "@react-native-firebase/auth";
import { getFirestore, connectFirestoreEmulator, serverTimestamp, Timestamp } from "@react-native-firebase/firestore";
import functionsModule from "@react-native-firebase/functions";
import { getStorage, connectStorageEmulator } from "@react-native-firebase/storage";
import { Platform } from "react-native";

// Ensure Firebase is initialized
const app = getApps().length === 0 ? initializeApp() : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = functionsModule(app);
export const storage = getStorage(app);

// Use Emulators in development mode
if (__DEV__) {
  const emulatorHost = Platform.OS === "android" ? "10.0.2.2" : "localhost";
  
  try {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
    functions.useEmulator(emulatorHost, 5001);
    connectStorageEmulator(storage, emulatorHost, 9199);
    console.log(`Connected to Firebase Emulators at ${emulatorHost}`);
  } catch (e) {
    console.log("Failed to connect to emulators:", e);
  }
}

// Helpers
export const firebaseServerTimestamp = serverTimestamp;
export const timestampFromDate = (date: Date) => Timestamp.fromDate(date);
