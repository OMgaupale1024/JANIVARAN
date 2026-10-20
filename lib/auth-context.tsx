'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    User as FirebaseUser,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    updateProfile,
} from 'firebase/auth';
import { doc, getDoc, runTransaction, Timestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase-config';
import { apiFetch } from './api-client';
import { User, SignUpData } from '@/types/backend';

interface AuthContextType {
    user: User | null;
    firebaseUser: FirebaseUser | null;
    loading: boolean;
    authError: string | null;
    signUp: (data: SignUpData) => Promise<void>;
    signIn: (email: string, password: string) => Promise<User | null>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback;

// Fetch user profile from Firestore; throws on read failure (null = no profile yet)
async function fetchUserData(uid: string): Promise<User | null> {
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.exists() ? (userDoc.data() as User) : null;
}

/**
 * Create the citizen profile if it does not exist yet. Runs in a transaction
 * so concurrent callers (signup + auth listener) cannot overwrite each other.
 * Roles and departments are never set from the browser; admins assign them.
 */
async function ensureUserDocument(uid: string, email: string, displayName: string): Promise<boolean> {
    const ref = doc(db, 'users', uid);
    const created = await runTransaction(db, async tx => {
        if ((await tx.get(ref)).exists()) return false;
        tx.set(ref, { uid, email, displayName, role: 'citizen', createdAt: Timestamp.now(), lastLogin: Timestamp.now() });
        return true;
    });

    if (created) {
        // Welcome email is sent server-side to the verified address, at most once
        apiFetch('/api/user/welcome', { method: 'POST' })
            .catch(err => console.error('Failed to trigger welcome email:', err));
    }
    return created;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    // Sign up with email and password
    const signUp = async (data: SignUpData): Promise<void> => {
        try {
            const { user: created } = await createUserWithEmailAndPassword(auth, data.email, data.password);
            await updateProfile(created, { displayName: data.displayName });
            // Use the account's normalised email (rules require it to match the ID token)
            const isNew = await ensureUserDocument(created.uid, created.email ?? data.email, data.displayName);
            // The auth listener may have created the profile first with a placeholder name
            if (!isNew) await updateDoc(doc(db, 'users', created.uid), { displayName: data.displayName });
        } catch (error) {
            console.error('Sign up error:', error);
            throw new Error(errorMessage(error, 'Failed to sign up'));
        }
    };

    // Sign in with email and password; returns the trusted profile
    const signIn = async (email: string, password: string): Promise<User | null> => {
        try {
            const { user: signedIn } = await signInWithEmailAndPassword(auth, email, password);
            return await fetchUserData(signedIn.uid);
        } catch (error) {
            console.error('Sign in error:', error);
            throw new Error(errorMessage(error, 'Failed to sign in'));
        }
    };

    // Sign in with Google
    const signInWithGoogle = async (): Promise<void> => {
        try {
            const { user: signedIn } = await signInWithPopup(auth, new GoogleAuthProvider());
            await ensureUserDocument(signedIn.uid, signedIn.email || '', signedIn.displayName || 'User');
        } catch (error) {
            console.error('Google sign in error:', error);
            throw new Error(errorMessage(error, 'Failed to sign in with Google'));
        }
    };

    // Sign out
    const signOut = async (): Promise<void> => {
        try {
            await firebaseSignOut(auth);
            setUser(null);
            setFirebaseUser(null);
        } catch (error) {
            console.error('Sign out error:', error);
            throw new Error(errorMessage(error, 'Failed to sign out'));
        }
    };

    // Listen to auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            setFirebaseUser(fbUser);

            if (!fbUser) {
                setUser(null);
                setAuthError(null);
                setLoading(false);
                return;
            }

            try {
                let userData = await fetchUserData(fbUser.uid);
                if (!userData) {
                    await ensureUserDocument(fbUser.uid, fbUser.email || '', fbUser.displayName || 'User');
                    userData = await fetchUserData(fbUser.uid);
                }
                setUser(userData);
                setAuthError(null);

                // Update last login (non-critical)
                updateDoc(doc(db, 'users', fbUser.uid), { lastLogin: Timestamp.now() })
                    .catch(err => console.warn('Could not update last login:', err));
            } catch (error) {
                // Don't guess a profile on failure: show the error instead
                console.error('Error loading user profile:', error);
                setUser(null);
                setAuthError('We could not load your account. Check your connection and refresh the page.');
            } finally {
                setLoading(false);
            }
        });

        return unsubscribe;
    }, []);

    const value: AuthContextType = {
        user,
        firebaseUser,
        loading,
        authError,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
