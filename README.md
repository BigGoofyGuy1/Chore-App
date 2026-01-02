# Chore App (Firebase + Expo)

A lightweight mobile app for parents to send chores to their kids' devices and get photo proof when each chore is done. Uses Firebase Firestore for real-time updates and Firebase Storage for photos. Built with Expo for quick Android sideloads.

## Prerequisites
- Node.js 18+
- Expo CLI (`npm install -g expo`) and EAS CLI for building APKs (`npm install -g eas-cli`)
- A Firebase project with Firestore + Storage enabled

## Setup
1) Install dependencies:
```bash
npm install
```
2) Create your Firebase config file:
```bash
cp src/firebaseConfig.example.ts src/firebaseConfig.ts
# Edit src/firebaseConfig.ts with your Firebase keys
```
3) Ensure Firebase services are enabled:
   - Firestore (in Native mode) and Storage.
   - For quick testing without auth, you can use very open rules; tighten before production:
```js
// Firestore rules (development only)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // replace with proper auth before release
    }
  }
}

// Storage rules (development only)
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true; // replace with proper auth before release
    }
  }
}
```

## Run the app
```bash
npm run start   # then press 'a' to open in Android emulator/device
```
- On first launch choose **Parent** or **Child**, enter a shared family code, and your name.
- Parents add chores (title + child name). Kids see chores assigned to their name and upload a photo to mark done.

## Build an Android APK for sideloading
Local APK build (no store submission):
```bash
eas build -p android --profile preview --local
```
- Output APK will be under `dist/` (default EAS output path); copy to device to sideload.
- You can also use the Expo-managed build service if you prefer remote builds.

## Folder structure
- `App.tsx` — main UI (role selection, parent/child views, chore list, upload flow)
- `src/firebase.ts` — Firebase initialization (Firestore + Storage)
- `src/types.ts` — shared TypeScript types
- `src/firebaseConfig.example.ts` — sample Firebase config; copy to `src/firebaseConfig.ts`
- `eas.json` — EAS config with an Android APK build profile

## Notes
- This sample omits auth/verification for simplicity. Add Firebase Auth and tighten rules before shipping.
- Images are uploaded to `choreProofs/{familyCode}/...` and download URLs are saved on the chore document.
- Firestore may prompt you to create an index for `familyCode + createdAt` on first run; accept the link in the console to generate it.
