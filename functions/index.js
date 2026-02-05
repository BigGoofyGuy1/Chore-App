const admin = require("firebase-admin");
const functions = require("firebase-functions");
const crypto = require("crypto");

admin.initializeApp();

const db = admin.firestore();
const publicCallable = functions.runWith({ invoker: "public" });

const INVITE_TTL_HOURS_DEFAULT = 168; // 7 days
const INVITE_USES_DEFAULT = 1;

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

        const now = admin.firestore.FieldValue.serverTimestamp();
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

        const expiresAt = admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + ttlHours * 60 * 60 * 1000)
        );

        tx.set(inviteRef, {
          code: candidate,
          familyCode: member.familyCode,
          role,
          usesRemaining: uses,
          createdBy: context.auth.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
