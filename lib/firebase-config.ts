import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, FirebaseStorage } from 'firebase/storage';

// Firebase configuration
// TODO: Replace with your actual Firebase config from Firebase Console
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const fresh = !getApps().length;
const app: FirebaseApp = fresh ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

// Local emulators for browser tests and offline demos (ports from firebase.json).
// Opt-in at build time; deployed builds never set NEXT_PUBLIC_FIREBASE_EMULATORS.
if (fresh && process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
}

// Give up on unreachable storage in seconds, not the SDK's 10-minute (upload) / 2-minute retry windows
storage.maxUploadRetryTime = 20_000;
storage.maxOperationRetryTime = 15_000;

export default app;
