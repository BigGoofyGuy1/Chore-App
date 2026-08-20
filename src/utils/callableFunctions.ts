import { getApp } from "@react-native-firebase/app";
import { auth } from "../firebase";
import { firebaseEmulatorHost, shouldUseFirebaseEmulators } from "./firebaseEmulatorConfig";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const DEFAULT_REGION = env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1";

type CallableErrorPayload = {
  error?: {
    status?: string;
    message?: string;
    details?: unknown;
  };
};

type CreateFamilyParams = {
  displayName: string;
  pushToken?: string | null;
};

type CreateFamilyResult = {
  familyCode: string;
};

type CreateInviteParams = {
  role?: "parent" | "child";
  ttlHours?: number;
  uses?: number;
};

type CreateInviteResult = {
  code: string;
};

type JoinWithInviteParams = {
  displayName: string;
  code: string;
  pushToken?: string | null;
};

type JoinWithInviteResult = {
  familyCode: string;
  role: "parent" | "child";
};

type MigrateFamilyPrivateDataResult = {
  migrated: number;
};

type NotifyChoreSubmittedResult = {
  sent: number;
};

function getCallableUrl(functionName: string) {
  const projectId = getApp().options.projectId;
  if (!projectId) {
    throw new Error("Missing Firebase projectId.");
  }

  if (shouldUseFirebaseEmulators) {
    return `http://${firebaseEmulatorHost}:5001/${projectId}/${DEFAULT_REGION}/${functionName}`;
  }

  return `https://${DEFAULT_REGION}-${projectId}.cloudfunctions.net/${functionName}`;
}

async function callPublicCallable<T>(functionName: string, data?: Record<string, unknown>): Promise<T> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in.");
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch(getCallableUrl(functionName), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: data || {} }),
  });

  const responseText = await response.text();
  let payload: CallableErrorPayload & { result?: T; data?: T };

  try {
    payload = JSON.parse(responseText) as CallableErrorPayload & {
      result?: T;
      data?: T;
    };
  } catch {
    const error = new Error(
      `Callable ${functionName} returned a non-JSON response (${response.status}). ` +
        "Check the Firebase Functions emulator or deployment configuration."
    ) as Error & { code?: string; details?: unknown };
    error.code = String(response.status);
    error.details = {
      contentType: response.headers.get("content-type") || "unknown",
    };
    throw error;
  }

  if (!response.ok || payload.error) {
    const message =
      payload.error?.message ||
      `Callable ${functionName} failed with status ${response.status}.`;
    const error = new Error(message) as Error & {
      code?: string;
      details?: unknown;
    };
    error.code = payload.error?.status || String(response.status);
    error.details = payload.error?.details;
    throw error;
  }

  if (payload.result !== undefined) {
    return payload.result;
  }

  if (payload.data !== undefined) {
    return payload.data;
  }

  throw new Error(`Callable ${functionName} returned no result.`);
}

export function createFamily(params: CreateFamilyParams) {
  return callPublicCallable<CreateFamilyResult>("createFamilyApi", params);
}

export function createInvite(params: CreateInviteParams = {}) {
  return callPublicCallable<CreateInviteResult>("createInviteApi", params);
}

export function joinWithInvite(params: JoinWithInviteParams) {
  return callPublicCallable<JoinWithInviteResult>("joinWithInviteApi", params);
}

export function migrateFamilyPrivateData() {
  return callPublicCallable<MigrateFamilyPrivateDataResult>("migrateFamilyPrivateDataApi");
}

export function notifyChoreSubmitted(choreId: string) {
  return callPublicCallable<NotifyChoreSubmittedResult>("notifyChoreSubmittedApi", { choreId });
}
