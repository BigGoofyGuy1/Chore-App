const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();

const db = getFirestore();
const publicHttps = functions.runWith({ invoker: "public" });

// firebase-functions v1 does not serialize an `invoker` option for callable
// triggers. Wrap the callable protocol in a public HTTPS trigger so Firebase
// deploys the required allUsers invoker binding while auth is still verified
// by the callable handler below.
function publicOnCall(handler) {
  const callable = functions.https.onCall(handler);
  return publicHttps.https.onRequest((request, response) => callable(request, response));
}

const INVITE_TTL_HOURS_DEFAULT = 168; // 7 days
const INVITE_USES_DEFAULT = 1;
const DEFAULT_TIMEZONE = "America/Chicago";
const TEMPLATE_LOOKAHEAD_HOURS = 30;

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((s) => {
    const text = String(s);
    return text.startsWith("✓ ") ? text.slice(2) : text;
  });
}

function getTimeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function zonedDateTimeToDate(year, month, day, hour, minute, timeZone) {
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = desiredUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getTimeZoneParts(new Date(guess), timeZone);
    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
      0
    );
    guess -= representedUtc - desiredUtc;
  }

  return new Date(guess);
}

function nextTemplateDueAt(schedule, afterDate) {
  const weekdays = new Set(Array.isArray(schedule?.weekdays) ? schedule.weekdays : []);
  if (!weekdays.size) return null;

  const timeZone = schedule.timezone || DEFAULT_TIMEZONE;
  const localParts = getTimeZoneParts(afterDate, timeZone);
  const localDay = new Date(Date.UTC(localParts.year, localParts.month - 1, localParts.day));

  for (let offset = 0; offset < 14; offset += 1) {
    const candidateDay = new Date(localDay.getTime());
    candidateDay.setUTCDate(candidateDay.getUTCDate() + offset);
    if (!weekdays.has(candidateDay.getUTCDay())) continue;
    const candidate = zonedDateTimeToDate(
      candidateDay.getUTCFullYear(),
      candidateDay.getUTCMonth() + 1,
      candidateDay.getUTCDate(),
      Number(schedule.hour) || 0,
      Number(schedule.minute) || 0,
      timeZone
    );
    if (candidate.getTime() > afterDate.getTime()) return candidate;
  }

  return null;
}

function templateDateKey(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone || DEFAULT_TIMEZONE);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

async function materializeActiveChoreTemplates() {
  const templatesSnap = await db.collection("choreTemplates").where("active", "==", true).get();
  if (templatesSnap.empty) return null;

  const now = new Date();
  const horizon = new Date(now.getTime() + TEMPLATE_LOOKAHEAD_HOURS * 60 * 60 * 1000);

  for (const templateSnap of templatesSnap.docs) {
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(templateSnap.ref);
      if (!freshSnap.exists) return;
      const template = freshSnap.data();
      if (template.active !== true) return;

      let dueAt = template.nextDueAt?.toDate ? template.nextDueAt.toDate() : null;
      if (!dueAt) {
        dueAt = nextTemplateDueAt(template.schedule, new Date(now.getTime() - 60 * 1000));
      }
      let generated = 0;

      while (dueAt && dueAt.getTime() <= horizon.getTime() && generated < 14) {
        const scheduledDate = templateDateKey(dueAt, template.schedule?.timezone);
        const occurrenceRef = db.collection("chores").doc(`${freshSnap.id}_${scheduledDate}`);
        tx.create(occurrenceRef, {
          title: template.title || "",
          description: template.description || "",
          points: Number(template.points) || 0,
          assignedTo: template.assignedTo || "",
          assignedToUid: template.assignedToUid || null,
          familyCode: template.familyCode,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          repeat: "none",
          dueAt: Timestamp.fromDate(dueAt),
          steps: normalizeSteps(template.steps),
          photoUrls: [],
          completedBy: null,
          completedByUid: null,
          completedAt: null,
          feedback: null,
          archived: false,
          archivedAt: null,
          isBounty: template.isBounty === true,
          required: template.required !== false,
          templateId: freshSnap.id,
          scheduledDate,
        });
        dueAt = nextTemplateDueAt(template.schedule, dueAt);
        generated += 1;
      }

      if (dueAt) {
        tx.update(freshSnap.ref, {
          nextDueAt: Timestamp.fromDate(dueAt),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  }

  return null;
}

async function rollRepeatingChores(repeat, computeNextDueAt) {
  const snap = await db
    .collection("chores")
    .where("status", "==", "approved")
    .where("repeat", "==", repeat)
    .where("archivedAt", "==", null)
    .get();

  if (snap.empty) return null;

  const docs = snap.docs;
  const chunkSize = 200; // 2 writes per chore => 400 ops per batch
  const now = FieldValue.serverTimestamp();

  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = db.batch();
    const slice = docs.slice(i, i + chunkSize);

    slice.forEach((docSnap) => {
      const data = docSnap.data();
      const dueAt = data?.dueAt?.toDate ? data.dueAt.toDate() : null;
      const nextDueAt = computeNextDueAt(dueAt);

      const newRef = db.collection("chores").doc();
      batch.set(newRef, {
        title: data.title || "",
        description: data.description || "",
        points: Number(data.points) || 0,
        assignedTo: data.assignedTo || "",
        assignedToUid: data.assignedToUid || null,
        familyCode: data.familyCode,
        status: "pending",
        createdAt: now,
        repeat: data.repeat || repeat,
        dueAt: nextDueAt,
        steps: normalizeSteps(data.steps),
        photoUrls: [],
        completedBy: null,
        completedAt: null,
        feedback: null,
        archived: false,
        archivedAt: null,
        sourceChoreId: docSnap.id,
        isBounty: data.isBounty === true,
        required: data.required !== false && data.isBounty !== true,
      });

      batch.update(docSnap.ref, { archivedAt: now, archived: true });
    });

    await batch.commit();
  }

  return null;
}

function normalizeName(name) {
  return String(name || "").trim();
}

function normalizeDisplayName(name) {
  const displayName = normalizeName(name);
  if (!displayName || displayName.length > 80) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "displayName must be between 1 and 80 characters."
    );
  }
  return displayName;
}

function normalizePushToken(value) {
  const pushToken = normalizeName(value);
  if (!pushToken) return null;
  if (
    pushToken.length > 256 ||
    !/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(pushToken)
  ) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid Expo push token.");
  }
  return pushToken;
}

function hasVerifiedEmail(context) {
  return context.auth?.token?.email_verified === true && Boolean(context.auth.token.email);
}

function requireVerifiedEmail(context, message = "A verified email account is required.") {
  if (!hasVerifiedEmail(context)) {
    throw new functions.https.HttpsError("permission-denied", message);
  }
}

function generateCode(length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

async function getMember(uid) {
  const snap = await db.collection("members").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

async function getParentMembership(uid, requestedFamilyCode) {
  const member = await getMember(uid);
  const familyCode = normalizeName(requestedFamilyCode).toUpperCase();

  if (
    member?.role === "parent" &&
    (!familyCode || normalizeName(member.familyCode).toUpperCase() === familyCode)
  ) {
    return member;
  }

  // The family owner record is an independent server-written source of truth.
  // This supports older parent records without allowing the client to assert a role.
  if (familyCode) {
    const familySnap = await db.collection("families").doc(familyCode).get();
    const family = familySnap.exists ? familySnap.data() : null;
    if (family?.ownerUid === uid) {
      return {
        ...(member || {}),
        familyCode,
        role: "parent",
      };
    }
  }

  return null;
}

const createFamilyHandler = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  requireVerifiedEmail(context, "A verified parent email is required to create a family.");

  const displayName = normalizeDisplayName(data?.displayName);
  const pushToken = normalizePushToken(data?.pushToken);

  const uid = context.auth.uid;

  // Prevent creating multiple families for the same user.
  const existingMember = await getMember(uid);
  if (existingMember) {
    throw new functions.https.HttpsError("failed-precondition", "Member already exists.");
  }

  let familyCode = null;
  for (let i = 0; i < 5; i += 1) {
    const candidate = generateCode(8);
    const familyRef = db.collection("families").doc(candidate);

    try {
      await db.runTransaction(async (tx) => {
        const familySnap = await tx.get(familyRef);
        if (familySnap.exists) {
          throw new Error("code-exists");
        }

        const now = FieldValue.serverTimestamp();
        tx.set(familyRef, {
          familyCode: candidate,
          ownerUid: uid,
          createdAt: now,
        });

        const memberData = {
          uid,
          displayName,
          familyCode: candidate,
          role: "parent",
          points: 0,
        };
        tx.set(db.collection("members").doc(uid), memberData);
        tx.set(db.collection("memberPrivate").doc(uid), {
          familyCode: candidate,
          pushToken,
          updatedAt: now,
        });
        tx.set(db.collection("membersPublic").doc(uid), {
          displayName,
          role: "parent",
          familyCode: candidate,
        });
      });

      familyCode = candidate;
      break;
    } catch (err) {
      if (err && err.message === "code-exists") {
        continue;
      }
      throw new functions.https.HttpsError("internal", "Failed to create family.");
    }
  }

  if (!familyCode) {
    throw new functions.https.HttpsError("internal", "Unable to allocate family code.");
  }

  return { familyCode };
};

exports.createFamily = functions.https.onCall(createFamilyHandler);
exports.createFamilyApi = publicOnCall(createFamilyHandler);

const createInviteHandler = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const requestedFamilyCode = normalizeName(data?.familyCode).toUpperCase();
  const member = await getParentMembership(context.auth.uid, requestedFamilyCode);
  if (!member) {
    console.warn("Invite creation denied: parent membership not found", {
      uid: context.auth.uid,
      requestedFamilyCode: requestedFamilyCode || null,
    });
    throw new functions.https.HttpsError("permission-denied", "Parent access required.");
  }
  requireVerifiedEmail(context, "A verified parent email is required to create invites.");

  const role = data?.role === "parent" ? "parent" : "child";
  const ttlHours = Number.isFinite(data?.ttlHours) ? data.ttlHours : INVITE_TTL_HOURS_DEFAULT;
  const uses = Number.isFinite(data?.uses) ? data.uses : INVITE_USES_DEFAULT;
  if (ttlHours <= 0 || uses <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "ttlHours and uses must be positive.");
  }

  let inviteCode = null;
  for (let i = 0; i < 5; i += 1) {
    const candidate = generateCode(7);
    const inviteRef = db.collection("invites").doc(candidate);
    try {
      await db.runTransaction(async (tx) => {
        const inviteSnap = await tx.get(inviteRef);
        if (inviteSnap.exists) {
          throw new Error("code-exists");
        }

        const expiresAt = Timestamp.fromDate(
          new Date(Date.now() + ttlHours * 60 * 60 * 1000)
        );

        tx.set(inviteRef, {
          code: candidate,
          familyCode: member.familyCode,
          role,
          usesRemaining: uses,
          createdBy: context.auth.uid,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt,
        });
      });

      inviteCode = candidate;
      break;
    } catch (err) {
      if (err && err.message === "code-exists") {
        continue;
      }
      throw new functions.https.HttpsError("internal", "Failed to create invite.");
    }
  }

  if (!inviteCode) {
    throw new functions.https.HttpsError("internal", "Unable to allocate invite code.");
  }

  return { code: inviteCode };
};

exports.createInvite = functions.https.onCall(createInviteHandler);
exports.createInviteApi = publicOnCall(createInviteHandler);

const joinWithInviteHandler = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const displayName = normalizeDisplayName(data?.displayName);
  const code = normalizeName(data?.code).toUpperCase();
  if (!code) {
    throw new functions.https.HttpsError("invalid-argument", "code is required.");
  }
  const pushToken = normalizePushToken(data?.pushToken);

  const uid = context.auth.uid;
  const existingMember = await getMember(uid);
  if (existingMember) {
    throw new functions.https.HttpsError("failed-precondition", "Member already exists.");
  }

  const inviteRef = db.collection("invites").doc(code);

  const result = await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Invite not found.");
    }

    const invite = inviteSnap.data();
    if (!invite || invite.usesRemaining <= 0) {
      throw new functions.https.HttpsError("failed-precondition", "Invite exhausted.");
    }
    if (invite.expiresAt && invite.expiresAt.toMillis() < Date.now()) {
      throw new functions.https.HttpsError("failed-precondition", "Invite expired.");
    }
    if (invite.role === "parent" && !hasVerifiedEmail(context)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Parent invites require a verified email account."
      );
    }

    const memberData = {
      uid,
      displayName,
      familyCode: invite.familyCode,
      role: invite.role,
      points: 0,
    };

    tx.set(db.collection("members").doc(uid), memberData);
    tx.set(db.collection("memberPrivate").doc(uid), {
      familyCode: invite.familyCode,
      pushToken,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection("membersPublic").doc(uid), {
      displayName,
      role: invite.role,
      familyCode: invite.familyCode,
    });

    if (invite.usesRemaining === 1) {
      tx.delete(inviteRef);
    } else {
      tx.update(inviteRef, { usesRemaining: invite.usesRemaining - 1 });
    }

    return { familyCode: invite.familyCode, role: invite.role };
  });

  return result;
};

exports.joinWithInvite = functions.https.onCall(joinWithInviteHandler);
exports.joinWithInviteApi = publicOnCall(joinWithInviteHandler);

const migrateFamilyPrivateDataHandler = async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const member = await getMember(context.auth.uid);
  if (!member || member.role !== "parent") {
    throw new functions.https.HttpsError("permission-denied", "Parent access required.");
  }

  const membersSnap = await db
    .collection("members")
    .where("familyCode", "==", member.familyCode)
    .get();

  let migrated = 0;
  const candidates = membersSnap.docs.filter((docSnap) => Boolean(docSnap.data()?.pushToken));
  const chunkSize = 200;

  for (let i = 0; i < candidates.length; i += chunkSize) {
    const batch = db.batch();
    const slice = candidates.slice(i, i + chunkSize);

    slice.forEach((docSnap) => {
      const memberData = docSnap.data();
      batch.set(
        db.collection("memberPrivate").doc(docSnap.id),
        {
          familyCode: member.familyCode,
          pushToken: memberData.pushToken,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      batch.update(docSnap.ref, { pushToken: FieldValue.delete() });
      migrated += 1;
    });

    await batch.commit();
  }

  return { migrated };
};

exports.migrateFamilyPrivateData = functions.https.onCall(migrateFamilyPrivateDataHandler);
exports.migrateFamilyPrivateDataApi = publicOnCall(migrateFamilyPrivateDataHandler);

async function sendExpoPushNotifications(tokens, title, body) {
  const messages = Array.from(new Set(tokens))
    .filter((token) => typeof token === "string")
    .filter((token) => /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(token))
    .map((to) => ({ to, sound: "default", title, body }));

  if (!messages.length) return 0;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new functions.https.HttpsError("unavailable", "Push notification service unavailable.");
  }

  return messages.length;
}

const notifyChoreSubmittedHandler = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const choreId = String(data?.choreId ?? "").trim();
  if (!choreId || choreId.length > 128) {
    throw new functions.https.HttpsError("invalid-argument", "A valid choreId is required.");
  }

  const [member, choreSnap] = await Promise.all([
    getMember(context.auth.uid),
    db.collection("chores").doc(choreId).get(),
  ]);
  if (!member || !choreSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Member or chore not found.");
  }

  const chore = choreSnap.data();
  if (
    chore.familyCode !== member.familyCode ||
    chore.status !== "submitted" ||
    chore.completedByUid !== context.auth.uid
  ) {
    throw new functions.https.HttpsError("permission-denied", "Only the submitter can send this notification.");
  }

  const parentsSnap = await db
    .collection("members")
    .where("familyCode", "==", member.familyCode)
    .where("role", "==", "parent")
    .get();
  const privateRefs = parentsSnap.docs.map((parentDoc) =>
    db.collection("memberPrivate").doc(parentDoc.id)
  );
  const privateDocs = privateRefs.length ? await db.getAll(...privateRefs) : [];
  const tokens = privateDocs.map((privateDoc) => privateDoc.data()?.pushToken);
  const sent = await sendExpoPushNotifications(
    tokens,
    "Chore Submitted! 📸",
    `${member.displayName} finished ${chore.title}. Review it now!`
  );

  return { sent };
};

exports.notifyChoreSubmitted = functions.https.onCall(notifyChoreSubmittedHandler);
exports.notifyChoreSubmittedApi = publicOnCall(notifyChoreSubmittedHandler);

exports.rollDailyChores = functions.pubsub
  .schedule("0 0 * * *")
  .timeZone(DEFAULT_TIMEZONE)
  .onRun(async () => {
    return rollRepeatingChores("daily", (dueAt) => {
      if (!(dueAt instanceof Date) || Number.isNaN(dueAt.getTime())) return null;
      const next = new Date(dueAt.getTime());
      next.setDate(next.getDate() + 1);
      return Timestamp.fromDate(next);
    });
  });

exports.rollWeeklyChores = functions.pubsub
  .schedule("0 0 * * 0")
  .timeZone(DEFAULT_TIMEZONE)
  .onRun(async () => {
    return rollRepeatingChores("weekly", (dueAt) => {
      if (!(dueAt instanceof Date) || Number.isNaN(dueAt.getTime())) return null;
      const next = new Date(dueAt.getTime());
      next.setDate(next.getDate() + 7);
      return Timestamp.fromDate(next);
    });
  });

exports.rollMonthlyChores = functions.pubsub
  .schedule("0 0 1 * *")
  .timeZone(DEFAULT_TIMEZONE)
  .onRun(async () => {
    return rollRepeatingChores("monthly", (dueAt) => {
      if (!(dueAt instanceof Date) || Number.isNaN(dueAt.getTime())) return null;
      const next = new Date(dueAt.getTime());
      next.setMonth(next.getMonth() + 1);
      return Timestamp.fromDate(next);
    });
  });

exports.materializeChoreTemplates = functions.pubsub
  .schedule("every 30 minutes")
  .timeZone(DEFAULT_TIMEZONE)
  .onRun(async () => materializeActiveChoreTemplates());

exports.backfillApprovalLogs = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const member = await getMember(context.auth.uid);
  if (!member || member.role !== "parent") {
    throw new functions.https.HttpsError("permission-denied", "Parent access required.");
  }

  const targetFamilyCode = normalizeName(data?.familyCode || member.familyCode).toLowerCase();
  if (!targetFamilyCode) {
    throw new functions.https.HttpsError("invalid-argument", "familyCode is required.");
  }

  const approvedSnap = await db.collection("chores")
    .where("status", "==", "approved")
    .get();

  if (approvedSnap.empty) {
    return { scanned: 0, created: 0, skipped: 0 };
  }

  const memberSnap = await db.collection("members")
    .where("familyCode", "==", targetFamilyCode)
    .get();

  const memberByUid = new Map();
  const memberByName = new Map();
  memberSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    memberByUid.set(doc.id, { uid: doc.id, ...data });
    if (data.displayName) {
      memberByName.set(data.displayName, { uid: doc.id, ...data });
    }
  });

  const logsSnap = await db.collection("pointsLogs")
    .where("familyCode", "==", targetFamilyCode)
    .get();

  const existingChoreIds = new Set();
  logsSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (data.source === "chore_approved" && data.choreId) {
      existingChoreIds.add(data.choreId);
    }
  });

  let scanned = 0;
  let created = 0;
  let skipped = 0;

  const docs = approvedSnap.docs.filter((doc) => doc.data()?.familyCode === targetFamilyCode);
  const chunkSize = 400;

  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = db.batch();
    const slice = docs.slice(i, i + chunkSize);

    slice.forEach((docSnap) => {
      scanned += 1;
      const data = docSnap.data() || {};
      if (existingChoreIds.has(docSnap.id)) {
        skipped += 1;
        return;
      }

      const assignedUid = data.assignedToUid || memberByName.get(data.assignedTo)?.uid;
      const memberRecord = assignedUid ? memberByUid.get(assignedUid) : null;
      if (!assignedUid || !memberRecord) {
        skipped += 1;
        return;
      }

      const logRef = db.collection("pointsLogs").doc();
      batch.set(logRef, {
        familyCode: targetFamilyCode,
        memberUid: assignedUid,
        memberName: memberRecord.displayName || data.assignedTo || "Unknown",
        pointsDelta: Number(data.points) || 0,
        note: `Chore approved: ${data.title || "Untitled"}`,
        createdAt: data.completedAt || FieldValue.serverTimestamp(),
        createdByUid: null,
        createdByName: "System",
        source: "chore_approved",
        choreId: docSnap.id,
      });

      existingChoreIds.add(docSnap.id);
      created += 1;
    });

    if (created > 0) {
      await batch.commit();
    }
  }

  return { scanned, created, skipped };
});
