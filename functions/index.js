const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");

admin.initializeApp();

const db = admin.firestore();
const publicCallable = functions.runWith({ invoker: "public" });

const INVITE_TTL_HOURS_DEFAULT = 168; // 7 days
const INVITE_USES_DEFAULT = 1;
const DEFAULT_TIMEZONE = "America/Chicago";

function normalizeName(name) {
  return String(name || "").trim();
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

exports.createFamily = publicCallable.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const displayName = normalizeName(data?.displayName);
  if (!displayName) {
    throw new functions.https.HttpsError("invalid-argument", "displayName is required.");
  }

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
          pushToken: data?.pushToken || null,
        };
        tx.set(db.collection("members").doc(uid), memberData);
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
});

exports.createInvite = publicCallable.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const member = await getMember(context.auth.uid);
  if (!member || member.role !== "parent") {
    throw new functions.https.HttpsError("permission-denied", "Parent access required.");
  }

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
});

exports.joinWithInvite = publicCallable.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const displayName = normalizeName(data?.displayName);
  const code = normalizeName(data?.code).toUpperCase();
  if (!displayName || !code) {
    throw new functions.https.HttpsError("invalid-argument", "displayName and code are required.");
  }

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

    const memberData = {
      uid,
      displayName,
      familyCode: invite.familyCode,
      role: invite.role,
      points: 0,
      pushToken: data?.pushToken || null,
    };

    tx.set(db.collection("members").doc(uid), memberData);
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
});

exports.resolveMemberByName = publicCallable.https.onCall(async (data) => {
  const displayName = normalizeName(data?.displayName);
  const familyCode = normalizeName(data?.familyCode).toLowerCase();
  if (!displayName || !familyCode) {
    throw new functions.https.HttpsError("invalid-argument", "displayName and familyCode are required.");
  }

  const requestedRole = data?.role === "parent" ? "parent" : "child";
  const pushToken = data?.pushToken || null;

  const existingSnap = await db.collection("members")
    .where("familyCode", "==", familyCode)
    .where("displayName", "==", displayName)
    .limit(1)
    .get();

  let profile = null;

  if (!existingSnap.empty) {
    const doc = existingSnap.docs[0];
    const data = doc.data();
    profile = { uid: doc.id, ...data };

    if (pushToken && pushToken !== data.pushToken) {
      await doc.ref.update({ pushToken });
      profile.pushToken = pushToken;
    }
  } else {
    const memberRef = db.collection("members").doc();
    profile = {
      uid: memberRef.id,
      displayName,
      familyCode,
      role: requestedRole,
      points: 0,
      pushToken,
    };
    await memberRef.set(profile);
  }

  const customToken = await admin.auth().createCustomToken(profile.uid);
  return { token: customToken, profile };
});

exports.rollDailyChores = functions.pubsub
  .schedule("0 0 * * *")
  .timeZone(DEFAULT_TIMEZONE)
  .onRun(async () => {
    const snap = await db.collection("chores")
      .where("status", "==", "approved")
      .where("repeat", "==", "daily")
      .where("archivedAt", "==", null)
      .get();

    if (snap.empty) return null;

    const docs = snap.docs;
    const chunkSize = 200; // 2 writes per chore => 400 ops per batch
    const now = FieldValue.serverTimestamp();

    const normalizeSteps = (steps) => {
      if (!Array.isArray(steps)) return [];
      return steps.map((s) => {
        const text = String(s);
        return text.startsWith("✓ ") ? text.slice(2) : text;
      });
    };

    for (let i = 0; i < docs.length; i += chunkSize) {
      const batch = db.batch();
      const slice = docs.slice(i, i + chunkSize);

      slice.forEach((docSnap) => {
        const data = docSnap.data();
        const dueAt = data?.dueAt?.toDate ? data.dueAt.toDate() : null;
        let nextDueAt = null;
        if (dueAt instanceof Date && !Number.isNaN(dueAt.getTime())) {
          const next = new Date(dueAt.getTime());
          next.setDate(next.getDate() + 1);
          nextDueAt = Timestamp.fromDate(next);
        }

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
          repeat: data.repeat || "daily",
          dueAt: nextDueAt,
          steps: normalizeSteps(data.steps),
          photoUrls: [],
          completedBy: null,
          completedAt: null,
          feedback: null,
          archived: false,
          archivedAt: null,
          sourceChoreId: docSnap.id,
        });

        batch.update(docSnap.ref, { archivedAt: now, archived: true });
      });

      await batch.commit();
    }

    return null;
  });

exports.backfillApprovalLogs = publicCallable.https.onCall(async (data, context) => {
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
