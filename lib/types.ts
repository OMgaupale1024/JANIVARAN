export type Department = 'Water' | 'Electricity' | 'Sanitation' | 'Roads' | 'Other';
export type GrievanceStatus = 'PENDING' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED' | 'NEW';
export type SLAState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';
export type UserRole = 'CITIZEN' | 'OFFICIAL' | 'AUTHORITY';
export type EscalationLevel = 'NONE' | 'L1_DEPT_HEAD' | 'L2_DISTRICT_DM' | 'L3_STATE_SEC';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface User {
    id: string;
    name: string;
    role: UserRole;
    department?: Department; // Only for OFFICIAL
}

export interface Grievance {
    id: string; // Firestore document ID for API calls
    trackingId?: string; // User-facing tracking ID like "JAN-123456"
    title: string;
    description?: string;
    category: string;
    department?: Department;
    location: string;
    status: GrievanceStatus;
    priority: Priority;

    // Timestamps
    submittedAt: string; // ISO String
    updatedAt?: string;
    resolvedAt?: string;

    // SLA Details
    slaHours?: number;
    slaDeadline: string;
    slaState?: SLAState;

    // Escalation
    escalationLevel: EscalationLevel;
    assignedTo?: string;

    // Audit Trail
    history: GrievanceHistory[];
}

export interface GrievanceHistory {
    timestamp: string;
    action: string;
    by: string; // "System", "Admin", "Citizen"
    details?: string;
}

export interface ClassificationResult {
    department: Department;
    slaHours: number;
}
