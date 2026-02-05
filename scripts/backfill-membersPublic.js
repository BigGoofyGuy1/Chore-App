const admin = require("firebase-admin");

const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credsPath) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();
const { FieldPath } = admin.firestore;

async function backfillMembersPublic() {
  const batchLimit = 400;
  let lastDoc = null;
  let total = 0;

  while (true) {
    let query = db.collection("members").orderBy(FieldPath.documentId()).limit(batchLimit);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const publicData = {
        displayName: data.displayName || "",
        role: data.role || "child",
        familyCode: data.familyCode || "",
      };
      const publicRef = db.collection("membersPublic").doc(docSnap.id);
      batch.set(publicRef, publicData, { merge: true });
    });

    await batch.commit();
    total += snap.size;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  console.log(`Backfill complete. Upserted ${total} member(s).`);
}

backfillMembersPublic().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
