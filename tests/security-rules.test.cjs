const { after, before, beforeEach, describe, test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} = require('firebase/firestore');
const { getBytes, ref, uploadBytes } = require('firebase/storage');

// Match .firebaserc so Storage's Firestore lookups hit the seeded emulator project.
const PROJECT_ID = 'goofy-chore-app';
const FAMILY = 'FAM1';
let testEnv;

const member = (familyCode, displayName, role, pushToken) => ({
  familyCode,
  displayName,
  role,
  points: 0,
  ...(pushToken ? { pushToken } : {}),
});

const chore = (assignedToUid, assignedTo, extra = {}) => ({
  familyCode: FAMILY,
  title: 'Test chore',
  status: 'pending',
  points: 5,
  assignedToUid,
  assignedTo,
  isBounty: false,
  archivedAt: null,
  ...extra,
});

async function seedFirestore() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(
        doc(database, 'members/parent'),
        member(FAMILY, 'Parent', 'parent', 'ExponentPushToken[legacy-parent]')
      ),
      setDoc(doc(database, 'members/child-a'), member(FAMILY, 'Kid A', 'child')),
      setDoc(doc(database, 'members/child-b'), member(FAMILY, 'Kid B', 'child')),
      setDoc(doc(database, 'members/outsider'), member('FAM2', 'Other Kid', 'child')),
      setDoc(doc(database, 'chores/own-chore'), chore('child-a', 'Kid A')),
      setDoc(doc(database, 'chores/sibling-chore'), chore('child-b', 'Kid B')),
      setDoc(
        doc(database, 'chores/bounty-chore'),
        chore(null, '', { isBounty: true })
      ),
      setDoc(doc(database, 'chores/legacy-chore'), chore(null, 'Kid A')),
      setDoc(doc(database, 'choreTemplates/template-1'), {
        familyCode: FAMILY,
        title: 'Private parent template',
      }),
      setDoc(doc(database, 'memberPrivate/child-a'), {
        familyCode: FAMILY,
        pushToken: 'ExponentPushToken[child-a]',
        updatedAt: new Date(),
      }),
      setDoc(doc(database, 'memberPrivate/child-b'), {
        familyCode: FAMILY,
        pushToken: 'ExponentPushToken[child-b]',
        updatedAt: new Date(),
      }),
    ]);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync(join(process.cwd(), 'storage.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await seedFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe('Firestore family privacy', () => {
  test('parents can read every family chore while children only see eligible chores', async () => {
    const parentDb = testEnv.authenticatedContext('parent').firestore();
    const childDb = testEnv.authenticatedContext('child-a').firestore();

    await assertSucceeds(getDoc(doc(parentDb, 'chores/sibling-chore')));
    await assertSucceeds(getDoc(doc(childDb, 'chores/own-chore')));
    await assertSucceeds(getDoc(doc(childDb, 'chores/legacy-chore')));
    await assertSucceeds(getDoc(doc(childDb, 'chores/bounty-chore')));
    await assertFails(getDoc(doc(childDb, 'chores/sibling-chore')));
  });

  test('child queries must prove assignment instead of listing the family', async () => {
    const childDb = testEnv.authenticatedContext('child-a').firestore();
    const assignedQuery = query(
      collection(childDb, 'chores'),
      where('familyCode', '==', FAMILY),
      where('assignedToUid', '==', 'child-a')
    );
    const broadFamilyQuery = query(
      collection(childDb, 'chores'),
      where('familyCode', '==', FAMILY)
    );

    await assertSucceeds(getDocs(assignedQuery));
    await assertFails(getDocs(broadFamilyQuery));
  });

  test('push tokens are private to the member and family parents', async () => {
    const parentDb = testEnv.authenticatedContext('parent').firestore();
    const childDb = testEnv.authenticatedContext('child-a').firestore();

    await assertSucceeds(getDoc(doc(childDb, 'memberPrivate/child-a')));
    await assertFails(getDoc(doc(childDb, 'memberPrivate/child-b')));
    await assertFails(getDoc(doc(childDb, 'members/parent')));
    await assertSucceeds(getDoc(doc(parentDb, 'memberPrivate/child-b')));
    await assertSucceeds(getDoc(doc(parentDb, 'members/child-b')));
    await assertFails(updateDoc(doc(childDb, 'members/child-a'), { pushToken: 'secret' }));
    await assertSucceeds(
      setDoc(doc(childDb, 'memberPrivate/child-a'), {
        familyCode: FAMILY,
        pushToken: 'ExponentPushToken[new-child-a]',
        updatedAt: serverTimestamp(),
      })
    );
  });

  test('chore templates remain parent-only', async () => {
    const parentDb = testEnv.authenticatedContext('parent').firestore();
    const childDb = testEnv.authenticatedContext('child-a').firestore();

    await assertSucceeds(getDoc(doc(parentDb, 'choreTemplates/template-1')));
    await assertFails(getDoc(doc(childDb, 'choreTemplates/template-1')));
  });
});

describe('Storage proof privacy', () => {
  const proofPath = `choreProofs/${FAMILY}/own-chore/proof.jpg`;
  const proofMetadata = {
    contentType: 'image/jpeg',
    customMetadata: {
      choreId: 'own-chore',
      uploaderUid: 'child-a',
    },
  };

  test('assigned children can upload and parents can read proof photos', async () => {
    const childStorage = testEnv.authenticatedContext('child-a').storage();
    const parentStorage = testEnv.authenticatedContext('parent').storage();

    await assertSucceeds(
      uploadBytes(ref(childStorage, proofPath), new Uint8Array([1, 2, 3]), proofMetadata)
    );
    await assertSucceeds(getBytes(ref(parentStorage, proofPath)));
  });

  test('siblings and outsiders cannot upload or read another child proof', async () => {
    const childStorage = testEnv.authenticatedContext('child-a').storage();
    const siblingStorage = testEnv.authenticatedContext('child-b').storage();
    const outsiderStorage = testEnv.authenticatedContext('outsider').storage();

    await assertSucceeds(
      uploadBytes(ref(childStorage, proofPath), new Uint8Array([1, 2, 3]), proofMetadata)
    );
    await assertFails(getBytes(ref(siblingStorage, proofPath)));
    await assertFails(getBytes(ref(outsiderStorage, proofPath)));
    await assertFails(
      uploadBytes(
        ref(siblingStorage, `choreProofs/${FAMILY}/own-chore/sibling.jpg`),
        new Uint8Array([1]),
        {
          contentType: 'image/jpeg',
          customMetadata: { choreId: 'own-chore', uploaderUid: 'child-b' },
        }
      )
    );
  });
});
