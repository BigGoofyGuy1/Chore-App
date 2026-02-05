import authModule from "@react-native-firebase/auth";
import firestoreModule from "@react-native-firebase/firestore";
import functionsModule from "@react-native-firebase/functions";
import storageModule from "@react-native-firebase/storage";

export const auth = authModule();
export const db = firestoreModule();
export const storage = storageModule();
export const functions = functionsModule();
export const serverTimestamp = () => firestoreModule.FieldValue.serverTimestamp();
export const timestampFromDate = (date: Date) => firestoreModule.Timestamp.fromDate(date);
