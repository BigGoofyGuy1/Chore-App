import { Platform } from "react-native";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const configuredHost = env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?.trim();
const defaultHost = Platform.OS === "android" ? "10.0.2.2" : "localhost";

export const firebaseEmulatorHost = configuredHost || defaultHost;

export const shouldUseFirebaseEmulators =
  __DEV__ &&
  env.EXPO_PUBLIC_DISABLE_EMULATORS !== "1" &&
  (env.EXPO_PUBLIC_FORCE_FIREBASE_EMULATORS === "1" || Boolean(configuredHost));
