const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { FieldPath, getFirestore } = require("firebase-admin/firestore");

const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credsPath) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function backfillMembersPublic() {
  const batchLimit = 400;
  let lastDoc = null;
  let total = 0;

  let hasMore = true;
  while (hasMore) {
    let query = db.collection("members").orderBy(FieldPath.documentId()).limit(batchLimit);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) {
      hasMore = false;
      break;
    }

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
