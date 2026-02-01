import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
        console.log('✅ Firebase Admin Initialized');
    } catch (error: any) {
        console.error('❌ Firebase Admin Initialization Error:', error.stack);
        // Fallback for build time or missing credentials to prevent crash
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ Running without Admin SDK credentials. Backend operations may fail.');
        }
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();
