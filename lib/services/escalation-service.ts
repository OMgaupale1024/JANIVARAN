import {
    collection,
    addDoc,
    query,
    where,
    getDocs,
    updateDoc,
    doc,
    Timestamp,
    orderBy,
} from 'firebase/firestore';
import { db } from '../firebase-config';
import { Escalation, EscalationReason, User, Complaint } from '@/types/backend';
import { logAudit } from './audit-service';

const ESCALATIONS_COLLECTION = 'escalations';

/**
 * Create an escalation
 */
export async function createEscalation(
    complaint: Complaint,
    reason: EscalationReason,
    escalatedTo: string,
    user: User,
    notes?: string
): Promise<Escalation> {
    try {
        const escalationData: Omit<Escalation, 'id'> = {
            complaintId: complaint.id,
            complaintTrackingId: complaint.trackingId,
            reason,
            escalatedFrom: complaint.assignedDepartment,
            escalatedTo,
            escalatedBy: user.uid,
            escalatedAt: Timestamp.now(),
            resolved: false,
            notes,
        };

        const docRef = await addDoc(collection(db, ESCALATIONS_COLLECTION), escalationData);

        const escalation: Escalation = {
            id: docRef.id,
            ...escalationData,
        };

        // Update complaint status to escalated
        await updateDoc(doc(db, 'complaints', complaint.id), {
            status: 'escalated',
            updatedAt: Timestamp.now(),
        });

        // Log audit
        await logAudit({
            complaintId: complaint.id,
            action: 'escalated',
            performedBy: user.uid,
            performedByName: user.displayName,
            performedByRole: user.role,
            newValue: { reason, escalatedTo },
            metadata: { notes },
        });

        return escalation;
    } catch (error) {
        console.error('Error creating escalation:', error);
        throw new Error('Failed to create escalation');
    }
}

/**
 * Auto-escalate complaints with breached SLAs
 */
export async function autoEscalateBreachedComplaints(): Promise<number> {
    try {
        const q = query(
            collection(db, 'complaints'),
            where('status', 'in', ['pending', 'in-progress']),
            where('sla.status', '==', 'breached')
        );

        const querySnapshot = await getDocs(q);
        let escalatedCount = 0;

        for (const docSnap of querySnapshot.docs) {
            const complaint = { id: docSnap.id, ...docSnap.data() } as Complaint;

            // Check if already escalated
            const existingEscalation = await getEscalationsByComplaint(complaint.id);
            if (existingEscalation.length === 0) {
                // Create system escalation
                const systemUser: User = {
                    uid: 'system',
                    email: 'system@jannivaran.gov',
                    displayName: 'System',
                    role: 'admin',
                    createdAt: Timestamp.now(),
                    lastLogin: Timestamp.now(),
                };

                await createEscalation(
                    complaint,
                    'sla-breach',
                    'Higher Authority',
                    systemUser,
                    'Automatic escalation due to SLA breach'
                );

                escalatedCount++;
            }
        }

        return escalatedCount;
    } catch (error) {
        console.error('Error auto-escalating complaints:', error);
        throw new Error('Failed to auto-escalate complaints');
    }
}

/**
 * Resolve an escalation
 */
export async function resolveEscalation(
    escalationId: string,
    user: User
): Promise<void> {
    try {
        await updateDoc(doc(db, ESCALATIONS_COLLECTION, escalationId), {
            resolved: true,
            resolvedAt: Timestamp.now(),
        });

        // Log audit
        const escalation = await getEscalationById(escalationId);
        if (escalation) {
            await logAudit({
                complaintId: escalation.complaintId,
                action: 'escalation_resolved',
                performedBy: user.uid,
                performedByName: user.displayName,
                performedByRole: user.role,
            });
        }
    } catch (error) {
        console.error('Error resolving escalation:', error);
        throw new Error('Failed to resolve escalation');
    }
}

/**
 * Get escalation by ID
 */
async function getEscalationById(id: string): Promise<Escalation | null> {
    try {
        const docRef = doc(db, ESCALATIONS_COLLECTION, id);
        const docSnap = await (await import('firebase/firestore')).getDoc(docRef);

        if (docSnap.exists()) {
            return {
                id: docSnap.id,
                ...docSnap.data(),
            } as Escalation;
        }

        return null;
    } catch (error) {
        console.error('Error getting escalation:', error);
        return null;
    }
}

/**
 * Get escalations for a complaint
 */
export async function getEscalationsByComplaint(complaintId: string): Promise<Escalation[]> {
    try {
        const q = query(
            collection(db, ESCALATIONS_COLLECTION),
            where('complaintId', '==', complaintId),
            orderBy('escalatedAt', 'desc')
        );

        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        })) as Escalation[];
    } catch (error) {
        console.error('Error getting escalations:', error);
        throw new Error('Failed to get escalations');
    }
}

/**
 * Get all unresolved escalations
 */
export async function getUnresolvedEscalations(): Promise<Escalation[]> {
    try {
        const q = query(
            collection(db, ESCALATIONS_COLLECTION),
            where('resolved', '==', false),
            orderBy('escalatedAt', 'desc')
        );

        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        })) as Escalation[];
    } catch (error) {
        console.error('Error getting unresolved escalations:', error);
        throw new Error('Failed to get escalations');
    }
}
