import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase-config';
import { User, UserRole } from '@/types/backend';

const USERS_COLLECTION = 'users';

/**
 * Get user by ID
 */
export async function getUserById(uid: string): Promise<User | null> {
    try {
        const docRef = doc(db, USERS_COLLECTION, uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data() as User;
        }

        return null;
    } catch (error) {
        console.error('Error getting user:', error);
        throw new Error('Failed to get user');
    }
}

/**
 * Get users by role
 */
export async function getUsersByRole(role: UserRole): Promise<User[]> {
    try {
        const q = query(
            collection(db, USERS_COLLECTION),
            where('role', '==', role)
        );

        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => doc.data() as User);
    } catch (error) {
        console.error('Error getting users by role:', error);
        throw new Error('Failed to get users');
    }
}

/**
 * Get officials by department
 */
export async function getOfficialsByDepartment(department: string): Promise<User[]> {
    try {
        const q = query(
            collection(db, USERS_COLLECTION),
            where('role', '==', 'official'),
            where('department', '==', department)
        );

        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => doc.data() as User);
    } catch (error) {
        console.error('Error getting officials by department:', error);
        throw new Error('Failed to get officials');
    }
}

/**
 * Get all admins
 */
export async function getAdmins(): Promise<User[]> {
    return getUsersByRole('admin');
}
