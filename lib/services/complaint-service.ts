import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    Timestamp,
    QueryConstraint,
    onSnapshot,
    Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase-config';
import { Complaint, ComplaintFormData, ComplaintStatus, ComplaintFilter, User } from '@/types/backend';
import { classifyComplaint } from '../engines/classification-engine';
import { createInitialSLA, updateSLA } from '../engines/sla-engine';
import { logAudit } from './audit-service';

const COMPLAINTS_COLLECTION = 'complaints';

/**
 * Generate tracking ID
 */
function generateTrackingId(): string {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    return `JAN-${randomNum}`;
}

/**
 * Create a new complaint
 */
export async function createComplaint(
    formData: ComplaintFormData,
    user: User
): Promise<Complaint> {
    try {
        // Classify complaint
        const { department, slaHours, priority } = classifyComplaint(
            formData.description,
            formData.category
        );

        // Create SLA
        const sla = createInitialSLA(slaHours);

        // Create complaint object
        const complaintData: Omit<Complaint, 'id'> = {
            trackingId: generateTrackingId(),
            title: formData.title,
            description: formData.description,
            category: formData.category,
            department,
            status: 'pending',
            priority,
            location: formData.location,
            photoURLs: formData.photoURLs || [],
            citizenId: user.uid,
            citizenName: user.displayName,
            citizenEmail: user.email,
            sla,
            assignedDepartment: department,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        // Add to Firestore
        const docRef = await addDoc(collection(db, COMPLAINTS_COLLECTION), complaintData);

        const complaint: Complaint = {
            id: docRef.id,
            ...complaintData,
        };

        // Log audit
        await logAudit({
            complaintId: complaint.id,
            action: 'created',
            performedBy: user.uid,
            performedByName: user.displayName,
            performedByRole: user.role,
            newValue: { status: 'pending', department, priority },
        });

        return complaint;
    } catch (error: any) {
        console.error('Error creating complaint:', error);
        throw new Error(`Failed to create complaint: ${error.message}`);
    }
}

/**
 * Get complaint by ID
 */
export async function getComplaintById(id: string): Promise<Complaint | null> {
    try {
        console.log(`🔍 [DEBUG-GCI] getComplaintById called with ID: '${id}' (Type: ${typeof id})`);

        if (!id) {
            console.error('❌ [DEBUG-GCI] ID is empty or undefined!');
            return null;
        }

        const docRef = doc(db, COMPLAINTS_COLLECTION, id);
        console.log(`PATH: ${docRef.path}`);

        const docSnap = await getDoc(docRef);

        console.log(`🔍 [DEBUG-GCI] Document exists: ${docSnap.exists()}`);

        if (docSnap.exists()) {
            const complaint = {
                id: docSnap.id,
                ...docSnap.data(),
            } as Complaint;

            console.log('✅ [DEBUG-GCI] Found complaint:', {
                id: complaint.id,
                trackingId: complaint.trackingId,
                status: complaint.status
            });

            return complaint;
        }

        console.warn(`⚠️ [DEBUG-GCI] Complaint not found in Firestore for ID: ${id}`);
        return null;
    } catch (error) {
        console.error('❌ [DEBUG-GCI] Error in getComplaintById:', error);
        throw new Error('Failed to get complaint');
    }
}

/**
 * Get complaint by tracking ID
 */
export async function getComplaintByTrackingId(trackingId: string): Promise<Complaint | null> {
    try {
        const q = query(
            collection(db, COMPLAINTS_COLLECTION),
            where('trackingId', '==', trackingId),
            limit(1)
        );

        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            return {
                id: doc.id,
                ...doc.data(),
            } as Complaint;
        }

        return null;
    } catch (error) {
        console.error('Error getting complaint by tracking ID:', error);
        throw new Error('Failed to get complaint');
    }
}

/**
 * Update complaint status
 */
export async function updateComplaintStatus(
    complaintId: string,
    newStatus: ComplaintStatus,
    user: User
): Promise<void> {
    try {
        const complaint = await getComplaintById(complaintId);
        if (!complaint) {
            throw new Error('Complaint not found');
        }

        const updateData: Partial<Complaint> = {
            status: newStatus,
            updatedAt: Timestamp.now(),
        };

        if (newStatus === 'resolved') {
            updateData.resolvedAt = Timestamp.now();
        } else if (newStatus === 'closed') {
            updateData.closedAt = Timestamp.now();
        } else if (newStatus === 'escalated') {
            updateData.escalatedAt = Timestamp.now();
        } else if (newStatus === 'in-progress') {
            updateData.inProgressAt = Timestamp.now();
        }

        await updateDoc(doc(db, COMPLAINTS_COLLECTION, complaintId), updateData);

        // Log audit
        await logAudit({
            complaintId,
            action: 'status_changed',
            performedBy: user.uid,
            performedByName: user.displayName,
            performedByRole: user.role,
            oldValue: complaint.status,
            newValue: newStatus,
        });
    } catch (error: any) {
        console.error('Error updating complaint status:', error);
        // Throw the original error message to help with debugging
        throw new Error(`Failed to update complaint status: ${error.message}`);
    }
}

/**
 * Assign complaint to official
 */
export async function assignComplaint(
    complaintId: string,
    officialId: string,
    user: User
): Promise<void> {
    try {
        await updateDoc(doc(db, COMPLAINTS_COLLECTION, complaintId), {
            assignedTo: officialId,
            status: 'in-progress',
            assignedAt: Timestamp.now(),
            inProgressAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        // Log audit
        await logAudit({
            complaintId,
            action: 'assigned',
            performedBy: user.uid,
            performedByName: user.displayName,
            performedByRole: user.role,
            newValue: officialId,
        });
    } catch (error) {
        console.error('Error assigning complaint:', error);
        throw new Error('Failed to assign complaint');
    }
}

/**
 * Get complaints with filters
 */
export async function getComplaints(filter?: ComplaintFilter): Promise<Complaint[]> {
    try {
        const constraints: QueryConstraint[] = [];

        if (filter?.status && filter.status.length > 0) {
            constraints.push(where('status', 'in', filter.status));
        }

        if (filter?.department && filter.department.length > 0) {
            constraints.push(where('department', 'in', filter.department));
        }

        if (filter?.priority && filter.priority.length > 0) {
            constraints.push(where('priority', 'in', filter.priority));
        }

        constraints.push(orderBy('createdAt', 'desc'));

        const q = query(collection(db, COMPLAINTS_COLLECTION), ...constraints);
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        })) as Complaint[];
    } catch (error) {
        console.error('Error getting complaints:', error);
        throw new Error('Failed to get complaints');
    }
}

/**
 * Get complaints for a specific citizen
 */
export async function getComplaintsByCitizen(citizenId: string): Promise<Complaint[]> {
    try {
        const q = query(
            collection(db, COMPLAINTS_COLLECTION),
            where('citizenId', '==', citizenId),
            orderBy('createdAt', 'desc')
        );

        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        })) as Complaint[];
    } catch (error) {
        console.error('Error getting citizen complaints:', error);
        throw new Error('Failed to get complaints');
    }
}

/**
 * Listen to real-time updates for citizen complaints
 */
export function listenToComplaintsByCitizen(
    citizenId: string,
    callback: (complaints: Complaint[]) => void
): Unsubscribe {
    const q = query(
        collection(db, COMPLAINTS_COLLECTION),
        where('citizenId', '==', citizenId),
        orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (querySnapshot) => {
        const complaints = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        })) as Complaint[];
        callback(complaints);
    }, (error) => {
        console.error('Error listening to complaints:', error);
    });
}

/**
 * Update SLA for all active complaints
 */
export async function updateAllSLAs(): Promise<void> {
    try {
        const q = query(
            collection(db, COMPLAINTS_COLLECTION),
            where('status', 'in', ['pending', 'in-progress'])
        );

        const querySnapshot = await getDocs(q);

        const updates = querySnapshot.docs.map(async (docSnap) => {
            const complaint = docSnap.data() as Complaint;
            const updatedSLA = updateSLA(complaint.sla);

            if (updatedSLA.status !== complaint.sla.status) {
                await updateDoc(doc(db, COMPLAINTS_COLLECTION, docSnap.id), {
                    sla: updatedSLA,
                    updatedAt: Timestamp.now(),
                });
            }
        });

        await Promise.all(updates);
    } catch (error) {
        console.error('Error updating SLAs:', error);
        throw new Error('Failed to update SLAs');
    }
}
