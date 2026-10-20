import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * Server-only Firebase Admin access. Initialised lazily so a missing
 * configuration fails the request with a clear 503 instead of crashing the
 * build or every route at import time.
 */
function getAdminApp(): App {
    const existing = getApps()[0];
    if (existing) return existing;

    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

    // Local emulators need no service-account credentials
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        return initializeApp({ projectId, storageBucket });
    }

    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) {
        throw Object.assign(new Error('Server is missing Firebase Admin configuration'), { status: 503 });
    }
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId, storageBucket });
}

export const adminDb = () => getFirestore(getAdminApp());
export const adminAuth = () => getAuth(getAdminApp());
export const adminBucket = () => getStorage(getAdminApp()).bucket();
