import { Complaint, ComplaintStatus, ComplaintPriority } from '@/types/backend';
import { Grievance, GrievanceHistory, GrievanceStatus, Priority } from '@/lib/types';
import { calculateSLA, getSLADeadline, toMillis } from '@/lib/services/sla-service';

const STATUS_MAP: Record<ComplaintStatus, GrievanceStatus> = {
    'pending': 'PENDING',
    'under-review': 'UNDER_REVIEW',
    'in-progress': 'IN_PROGRESS',
    'resolved': 'RESOLVED',
    'escalated': 'ESCALATED',
    'closed': 'CLOSED', // withdrawn or closed without resolution: not the same as resolved
};

/** Resolved and closed complaints are finished; work and the SLA clock have stopped. */
export const isCompleted = (g: Pick<Grievance, 'status'>) => g.status === 'RESOLVED' || g.status === 'CLOSED';

/** Live SLA for a mapped grievance (same answer as sla-service gives for the stored complaint). */
export function grievanceSLA(g: Grievance, now: number) {
    return calculateSLA({
        createdAt: g.submittedAt,
        sla: { deadline: g.slaDeadline, assignedHours: g.slaHours },
        status: isCompleted(g) ? 'resolved' : 'open',
        resolvedAt: g.resolvedAt,
    }, now);
}

const PRIORITY_MAP: Record<ComplaintPriority, Priority> = {
    'low': 'LOW',
    'medium': 'MEDIUM',
    'high': 'HIGH',
    'critical': 'CRITICAL',
};

// Status-change timestamps that make up the admin timeline
const HISTORY_FIELDS: Array<[keyof Complaint, string]> = [
    ['underReviewAt', 'UNDER_REVIEW'],
    ['assignedAt', 'ASSIGNED'],
    ['inProgressAt', 'IN_PROGRESS'],
    ['escalatedAt', 'ESCALATED'],
    ['resolvedAt', 'RESOLVED'],
    ['closedAt', 'CLOSED'],
];

const iso = (value: unknown): string | undefined => {
    const ms = toMillis(value);
    return ms === null ? undefined : new Date(ms).toISOString();
};

/**
 * Convert Complaint (Firestore) to Grievance (Admin UI)
 */
export function complaintToGrievance(complaint: Complaint): Grievance {
    const submittedAt = iso(complaint.createdAt) ?? new Date().toISOString();

    const history: GrievanceHistory[] = [
        { timestamp: submittedAt, action: 'SUBMITTED', details: 'Complaint submitted via portal', by: complaint.citizenName || 'Citizen' },
    ];
    for (const [field, action] of HISTORY_FIELDS) {
        const timestamp = iso(complaint[field]);
        if (timestamp) history.push({ timestamp, action, by: 'Official' });
    }
    for (const t of complaint.transfers ?? []) {
        const timestamp = iso(t.at);
        if (timestamp) history.push({ timestamp, action: 'TRANSFERRED', by: 'Authority', details: `${t.from ?? 'No department'} → ${t.to}: ${t.reason}` });
    }
    history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
        id: complaint.id, // Firestore document ID for API calls
        trackingId: complaint.trackingId, // Tracking ID for display
        title: complaint.title,
        description: complaint.description,
        category: complaint.category,
        department: complaint.assignedDepartment ?? complaint.department,
        location: complaint.location,
        status: STATUS_MAP[complaint.status] || 'PENDING',
        closedReason: complaint.closedReason,
        priority: PRIORITY_MAP[complaint.priority] || 'MEDIUM',
        submittedAt,
        updatedAt: iso(complaint.updatedAt),
        resolvedAt: iso(complaint.resolvedAt) ?? iso(complaint.closedAt),
        slaHours: complaint.sla?.assignedHours,
        slaDeadline: getSLADeadline(complaint).toISOString(),
        escalationLevel: complaint.status === 'escalated' ? 'L1_DEPT_HEAD' : 'NONE',
        assignedTo: complaint.assignedTo || 'Unassigned',
        photoURLs: complaint.photoURLs ?? [],
        history,
    };
}
