# Chore App (Firebase + Expo)

A family chore app for assigning work, earning rewards, and submitting photo proof. The mobile client uses Expo 57 and React Native Firebase; Cloud Functions own family creation and invite membership changes.

## Requirements

- Node.js 22 (matches the Cloud Functions runtime)
- Java 21 for the local Firebase emulators and Android builds
- A Firebase project with Authentication, Firestore, Storage, and Functions enabled
- EAS CLI for installable Android builds

## Firebase setup

1. Enable **Email/Password** and **Anonymous** providers in Firebase Authentication.
2. Put the Android `google-services.json` at the project root.
3. Copy `src/firebaseConfig.example.ts` to `src/firebaseConfig.ts` and enter the Firebase web-app values.
4. Deploy the protected backend configuration:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes,storage
```

Do not replace the checked-in rules with open development rules. The app depends on them to keep invites server-only, limit children to eligible chores and proof photos, and isolate push tokens in `memberPrivate/{uid}`.

## Install and verify

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run test:rules
```

`npm run test:rules` starts local Firestore and Storage emulators and verifies the parent/child privacy boundaries.

## Run locally

```bash
npm run android
```

Expo Go is not supported because the app uses native React Native Firebase modules. Native Android files are generated from `app.json` and are intentionally not committed.

## Account and family flow

- A parent registers with email/password, verifies the email, then creates a family.
- A parent creates a role-specific invite from the app.
- A child taps **Join as a Child**, signs in anonymously, and enters the child invite code. No child email address is required.
- A second parent signs in with a verified email account and uses a parent invite.

An anonymous child account belongs to that app installation. Clearing app data or uninstalling before the account is upgraded will disconnect that device; the parent must create a new child invite.

## Build an installable Android APK

```bash
eas build --platform android --profile preview
```

The `preview` profile produces an internally distributed APK for sideloading. The `production` profile produces an Android App Bundle for store submission.

## Security-sensitive paths

- Proof photos: `choreProofs/{familyCode}/{choreId}/{fileName}`
- Private device tokens: `memberPrivate/{uid}`
- Public family membership: `members/{uid}`
- Callable membership operations: `functions/index.js`

Parents can read all family chores and proof photos. Children can read their assigned chores, legacy name-assigned chores, and unclaimed bounties; sibling chores, sibling proofs, templates, and sibling push tokens are denied by the backend rules.
