import { collection, query, where, onSnapshot, Unsubscribe, Query, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase-config';
import { Complaint } from '@/types/backend';

export type QueryOptions =
    | { role: 'citizen'; userId: string }
    | { role: 'official'; department: string }
    | { role: 'admin' };

/**
 * Listen to complaints with role-based filtering. Security rules enforce the
 * same scoping, so a mismatched query fails instead of leaking data.
 * Failures are reported through onError, never as an empty list.
 */
export function listenToComplaints(
    options: QueryOptions,
    callback: (complaints: Complaint[]) => void,
    onError: (error: Error) => void
): Unsubscribe {
    let q: Query<DocumentData>;

    switch (options.role) {
        case 'citizen':
            q = query(collection(db, 'complaints'), where('citizenId', '==', options.userId));
            break;
        case 'official':
            q = query(collection(db, 'complaints'), where('assignedDepartment', '==', options.department));
            break;
        case 'admin':
            q = query(collection(db, 'complaints'));
            break;
    }

    return onSnapshot(
        q,
        (snapshot) => {
            callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Complaint[]);
        },
        (error) => {
            console.error('Error listening to complaints:', error);
            onError(error);
        }
    );
}
