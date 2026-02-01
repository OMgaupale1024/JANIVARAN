import { collection, addDoc, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase-config';
import { AuditLog, UserRole } from '@/types/backend';

const AUDIT_LOGS_COLLECTION = 'auditLogs';

/**
 * Log an audit entry
 */
export async function logAudit(data: {
    complaintId: string;
    action: string;
    performedBy: string;
    performedByName: string;
    performedByRole: UserRole;
    oldValue?: any;
    newValue?: any;
    metadata?: Record<string, any>;
}): Promise<void> {
    try {
        const auditLog: Omit<AuditLog, 'id'> = {
            ...data,
            timestamp: Timestamp.now(),
        };

        await addDoc(collection(db, AUDIT_LOGS_COLLECTION), auditLog);
    } catch (error) {
        console.error('Error logging audit:', error);
        // Don't throw - audit logging should not break the main flow
    }
}

/**
 * Get audit logs for a complaint
 */
export async function getAuditLogs(complaintId: string): Promise<AuditLog[]> {
    try {
        const q = query(
            collection(db, AUDIT_LOGS_COLLECTION),
            where('complaintId', '==', complaintId),
            orderBy('timestamp', 'desc')
        );

        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        })) as AuditLog[];
    } catch (error) {
        console.error('Error getting audit logs:', error);
        throw new Error('Failed to get audit logs');
    }
}
