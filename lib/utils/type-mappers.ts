import { Complaint, ComplaintStatus, ComplaintPriority } from '@/types/backend';
import { Grievance } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';

/**
 * Convert Complaint (Firestore) to Grievance (Admin UI)
 */
export function complaintToGrievance(complaint: Complaint): Grievance {
    const createdAt = complaint.createdAt instanceof Timestamp
        ? complaint.createdAt.toDate()
        : new Date(complaint.createdAt);

    // Calculate SLA deadline
    const slaHours = getSLAHoursForPriority(complaint.priority);
    const deadline = new Date(createdAt.getTime() + slaHours * 60 * 60 * 1000);

    return {
        id: complaint.id, // Use Firestore document ID for API calls
        trackingId: complaint.trackingId, // Keep tracking ID for display
        title: complaint.title,
        category: complaint.category,
        location: complaint.location,
        status: mapComplaintStatusToGrievanceStatus(complaint.status),
        priority: mapComplaintPriorityToGrievancePriority(complaint.priority),
        submittedAt: createdAt.toISOString(),
        slaDeadline: deadline.toISOString(),
        escalationLevel: complaint.status === 'escalated' ? 'L1_DEPT_HEAD' : 'NONE',
        assignedTo: complaint.assignedTo || 'Unassigned',
        history: [
            {
                timestamp: createdAt.toISOString(),
                action: 'SUBMITTED',
                details: 'Complaint submitted via portal',
                by: complaint.citizenName || 'Citizen'
            }
        ]
    };
}

/**
 * Map Complaint status to Grievance status
 */
function mapComplaintStatusToGrievanceStatus(status: ComplaintStatus): 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED' {
    const statusMap: Record<ComplaintStatus, 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED'> = {
        'pending': 'PENDING',
        'in-progress': 'IN_PROGRESS',
        'resolved': 'RESOLVED',
        'escalated': 'ESCALATED',
        'closed': 'RESOLVED'
    };

    return statusMap[status] || 'PENDING';
}

/**
 * Map Complaint priority to Grievance priority
 */
function mapComplaintPriorityToGrievancePriority(priority: ComplaintPriority): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const priorityMap: Record<ComplaintPriority, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
        'low': 'LOW',
        'medium': 'MEDIUM',
        'high': 'HIGH',
        'critical': 'CRITICAL'
    };

    return priorityMap[priority] || 'MEDIUM';
}

/**
 * Get SLA hours for a priority level
 */
function getSLAHoursForPriority(priority: ComplaintPriority): number {
    const slaHours: Record<ComplaintPriority, number> = {
        'critical': 24,
        'high': 72,
        'medium': 168,
        'low': 336
    };

    return slaHours[priority] || 168;
}

/**
 * Map Grievance status back to Complaint status
 */
export function grievanceStatusToComplaintStatus(status: string): ComplaintStatus {
    const statusMap: Record<string, ComplaintStatus> = {
        'PENDING': 'pending',
        'IN_PROGRESS': 'in-progress',
        'RESOLVED': 'resolved',
        'ESCALATED': 'escalated'
    };

    return statusMap[status] || 'pending';
}

/**
 * Map Grievance priority back to Complaint priority
 */
export function grievancePriorityToComplaintPriority(priority: string): ComplaintPriority {
    const priorityMap: Record<string, ComplaintPriority> = {
        'LOW': 'low',
        'MEDIUM': 'medium',
        'HIGH': 'high',
        'CRITICAL': 'critical'
    };

    return priorityMap[priority] || 'medium';
}
