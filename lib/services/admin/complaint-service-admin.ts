import { adminDb } from '@/lib/firebase-admin';
import { Complaint, ComplaintStatus } from '@/types/backend';
import { Timestamp } from 'firebase-admin/firestore';

const COMPLAINTS_COLLECTION = 'complaints';

/**
 * Get complaint by ID (Admin Bypass)
 */
export async function getComplaintByIdAdmin(id: string): Promise<Complaint | null> {
    try {
        if (!id) throw new Error('Complaint ID is required');

        const docRef = adminDb.collection(COMPLAINTS_COLLECTION).doc(id);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data, // Firestore admin returns native types, might need date conversion if using client types strictly, but for JSON response it's fine
                // ensuring Timestamps are handled if needed, for now passing through
            } as any as Complaint;
        }

        return null;
    } catch (error) {
        console.error('Error getting complaint (Admin):', error);
        throw error;
    }
}

/**
 * Update complaint status (Admin Bypass)
 */
export async function updateComplaintStatusAdmin(
    complaintId: string,
    newStatus: ComplaintStatus,
    user: any // simplified user obj
): Promise<void> {
    try {
        const docRef = adminDb.collection(COMPLAINTS_COLLECTION).doc(complaintId);

        // Verify existence first
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            throw new Error(`Complaint not found: ${complaintId}`);
        }

        const updateData: any = {
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

        await docRef.update(updateData);

        console.log(`✅ [ADMIN] Complaint ${complaintId} updated to ${newStatus}`);

    } catch (error) {
        console.error('Error updating complaint status (Admin):', error);
        throw error;
    }
}

/**
 * Add citizen intervention ticket (Admin Bypass)
 */
export async function addCitizenTicketAdmin(
    complaintId: string,
    reason: string,
    message: string,
    user: { uid: string; displayName: string; role: string }
): Promise<void> {
    try {
        const docRef = adminDb.collection(COMPLAINTS_COLLECTION).doc(complaintId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            throw new Error(`Complaint not found: ${complaintId}`);
        }

        const complaint = docSnap.data() as Complaint;

        const ticket = {
            reason,
            message,
            timestamp: Timestamp.now(),
        };

        // Auto-prioritize logic
        const newPriority = complaint.priority === 'critical' ? 'critical' : 'high';

        const updateData: any = {
            priority: newPriority,
            citizenTickets: [...(complaint.citizenTickets || []), ticket],
            updatedAt: Timestamp.now(),
        };

        if (!complaint.escalatedAt) {
            updateData.escalatedAt = Timestamp.now();
        }

        await docRef.update(updateData);

        console.log(`✅ [ADMIN] Ticket raised for ${complaintId}. Priority: ${newPriority}`);
        console.log(`📧 [MOCK EMAIL] To Admin/Officials: Citizen Ticket on #${complaint.trackingId}`);

    } catch (error) {
        console.error('Error adding citizen ticket (Admin):', error);
        throw error;
    }
}

/**
 * Assign complaint to official (Admin Bypass)
 */
export async function assignComplaintAdmin(
    complaintId: string,
    officialId: string,
    user: { uid: string; displayName: string; role: string }
): Promise<void> {
    try {
        const docRef = adminDb.collection(COMPLAINTS_COLLECTION).doc(complaintId);

        // Verify existence
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            throw new Error(`Complaint not found: ${complaintId}`);
        }

        const assignData = {
            assignedTo: officialId,
            status: 'in-progress',
            assignedAt: Timestamp.now(),
            inProgressAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        await docRef.update(assignData);

        console.log(`✅ [ADMIN] Complaint ${complaintId} assigned to ${officialId}`);

    } catch (error) {
        console.error('Error assigning complaint (Admin):', error);
        throw error;
    }
}

/**
 * Delete complaint (Admin Bypass)
 */
export async function deleteComplaintAdmin(id: string): Promise<void> {
    try {
        if (!id) throw new Error('Complaint ID is required');

        const docRef = adminDb.collection(COMPLAINTS_COLLECTION).doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            throw new Error(`Complaint not found: ${id}`);
        }

        await docRef.delete();
        console.log(`🗑️ [ADMIN] Complaint ${id} deleted`);

    } catch (error) {
        console.error('Error deleting complaint (Admin):', error);
        throw error;
    }
}
