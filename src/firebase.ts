import { getApp, getApps, initializeApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { getFirestore, serverTimestamp, Timestamp } from "@react-native-firebase/firestore";
import { getStorage } from "@react-native-firebase/storage";

// Ensure Firebase is initialized and use the app-specific getter to avoid deprecation warnings
const app = getApps().length === 0 ? initializeApp() : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Helpers
export const firebaseServerTimestamp = serverTimestamp;
export const timestampFromDate = (date: Date) => Timestamp.fromDate(date);
