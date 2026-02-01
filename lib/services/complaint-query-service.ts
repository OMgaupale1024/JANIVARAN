import { collection, query, where, onSnapshot, Unsubscribe, Query, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase-config';
import { Complaint } from '@/types/backend';

export interface QueryOptions {
    role: 'citizen' | 'official' | 'admin';
    userId?: string;
    department?: string;
}

/**
 * Listen to complaints with role-based filtering
 * Returns an unsubscribe function to clean up the listener
 */
export function listenToComplaints(
    options: QueryOptions,
    callback: (complaints: Complaint[]) => void
): Unsubscribe {
    let q: Query<DocumentData>;

    switch (options.role) {
        case 'citizen':
            if (!options.userId) {
                throw new Error('userId is required for citizen role');
            }
            q = query(
                collection(db, 'complaints'),
                where('citizenId', '==', options.userId)
            );
            break;

        case 'official':
            if (!options.department) {
                throw new Error('department is required for official role');
            }
            q = query(
                collection(db, 'complaints'),
                where('assignedDepartment', '==', options.department)
            );
            break;

        case 'admin':
            // Admin sees all complaints
            q = query(collection(db, 'complaints'));
            break;

        default:
            throw new Error(`Invalid role: ${options.role}`);
    }

    // Set up real-time listener
    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const complaints = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Complaint[];

            callback(complaints);
        },
        (error) => {
            console.error('Error listening to complaints:', error);
            // Call callback with empty array on error
            callback([]);
        }
    );

    return unsubscribe;
}

/**
 * Get complaints once (no real-time updates)
 */
export async function getComplaints(options: QueryOptions): Promise<Complaint[]> {
    return new Promise((resolve, reject) => {
        const unsubscribe = listenToComplaints(options, (complaints) => {
            unsubscribe();
            resolve(complaints);
        });
    });
}
