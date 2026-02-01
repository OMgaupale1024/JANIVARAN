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
    UserCredential
} from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from './firebase-config';
import { User, UserRole, SignUpData } from '@/types/backend';

interface AuthContextType {
    user: User | null;
    firebaseUser: FirebaseUser | null;
    loading: boolean;
    signUp: (data: SignUpData) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch user data from Firestore
    const fetchUserData = async (uid: string): Promise<User | null> => {
        try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
                return userDoc.data() as User;
            }
            return null;
        } catch (error) {
            console.error('Error fetching user data:', error);
            return null;
        }
    };

    // Create user document in Firestore
    const createUserDocument = async (
        uid: string,
        email: string,
        displayName: string,
        role: UserRole,
        department?: string
    ): Promise<void> => {
        const userData: any = {
            uid,
            email,
            displayName,
            role,
            createdAt: Timestamp.now(),
            lastLogin: Timestamp.now(),
        };

        // Only add department if it's provided
        if (department) {
            userData.department = department;
        }

        await setDoc(doc(db, 'users', uid), userData);

        // Send Welcome Email (via API)
        // We do this via API because we can't use NodeMailer in client context
        fetch('/api/user/welcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: { displayName, email } }),
        }).catch(err => console.error('Failed to trigger welcome email:', err));

    };

    // Sign up with email and password
    const signUp = async (data: SignUpData): Promise<void> => {
        try {
            const userCredential = await createUserWithEmailAndPassword(
                auth,
                data.email,
                data.password
            );

            await createUserDocument(
                userCredential.user.uid,
                data.email,
                data.displayName,
                data.role,
                data.department
            );
        } catch (error: any) {
            console.error('Sign up error:', error);
            throw new Error(error.message || 'Failed to sign up');
        }
    };

    // Sign in with email and password
    const signIn = async (email: string, password: string): Promise<void> => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error: any) {
            console.error('Sign in error:', error);
            throw new Error(error.message || 'Failed to sign in');
        }
    };

    // Sign in with Google
    const signInWithGoogle = async (): Promise<void> => {
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);

            // Check if user document exists, if not create one with default role
            const userData = await fetchUserData(result.user.uid);
            if (!userData) {
                await createUserDocument(
                    result.user.uid,
                    result.user.email || '',
                    result.user.displayName || 'User',
                    'citizen' // Default role for Google sign-in
                );
            }
        } catch (error: any) {
            console.error('Google sign in error:', error);
            throw new Error(error.message || 'Failed to sign in with Google');
        }
    };

    // Sign out
    const signOut = async (): Promise<void> => {
        try {
            await firebaseSignOut(auth);
            setUser(null);
            setFirebaseUser(null);
        } catch (error: any) {
            console.error('Sign out error:', error);
            throw new Error(error.message || 'Failed to sign out');
        }
    };

    // Listen to auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setFirebaseUser(firebaseUser);

            if (firebaseUser) {
                let userData = await fetchUserData(firebaseUser.uid);

                if (!userData) {
                    console.log('User profile missing, auto-creating...');
                    await createUserDocument(
                        firebaseUser.uid,
                        firebaseUser.email || '',
                        firebaseUser.displayName || 'User',
                        'citizen'
                    );
                    userData = await fetchUserData(firebaseUser.uid);
                }

                setUser(userData);

                // Update last login
                if (userData) {
                    await setDoc(
                        doc(db, 'users', firebaseUser.uid),
                        { lastLogin: Timestamp.now() },
                        { merge: true }
                    );
                }
            } else {
                setUser(null);
            }

            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const value: AuthContextType = {
        user,
        firebaseUser,
        loading,
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
