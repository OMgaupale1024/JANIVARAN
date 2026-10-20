import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot,
    Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase-config';
import { Complaint } from '@/types/backend';

/**
 * Browser-side complaint reads. Security rules restrict these queries to the
 * signed-in citizen's own complaints. All writes go through /api/complaints.
 */

const COMPLAINTS_COLLECTION = 'complaints';

const citizenQuery = (citizenId: string) => query(
    collection(db, COMPLAINTS_COLLECTION),
    where('citizenId', '==', citizenId),
    orderBy('createdAt', 'desc')
);

/**
 * Get complaints for a specific citizen
 */
export async function getComplaintsByCitizen(citizenId: string): Promise<Complaint[]> {
    const querySnapshot = await getDocs(citizenQuery(citizenId));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Complaint[];
}

/**
 * Listen to real-time updates for citizen complaints
 */
export function listenToComplaintsByCitizen(
    citizenId: string,
    callback: (complaints: Complaint[]) => void,
    onError: (error: Error) => void
): Unsubscribe {
    return onSnapshot(citizenQuery(citizenId), (querySnapshot) => {
        callback(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Complaint[]);
    }, (error) => {
        console.error('Error listening to complaints:', error);
        onError(error);
    });
}
