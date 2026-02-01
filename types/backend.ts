import { Timestamp } from 'firebase/firestore';

// User Types
export type UserRole = 'citizen' | 'official' | 'admin';

export interface User {
    uid: string;
    email: string;
    displayName: string;
    role: UserRole;
    department?: string;
    photoURL?: string;
    createdAt: Timestamp;
    lastLogin: Timestamp;
}

// Complaint Types
export type ComplaintStatus = 'pending' | 'in-progress' | 'resolved' | 'closed' | 'escalated';
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'critical';
export type SLAStatus = 'on-track' | 'at-risk' | 'breached';

export interface SLA {
    assignedHours: number;
    deadline: Timestamp;
    remainingHours: number;
    status: SLAStatus;
}

export interface Complaint {
    id: string;
    trackingId: string;
    title: string;
    description: string;
    category: string;
    department: string;
    status: ComplaintStatus;
    priority: ComplaintPriority;
    location: string;
    photoURLs?: string[];

    // User info
    citizenId: string;
    citizenName: string;
    citizenEmail: string;

    // SLA tracking
    sla: SLA;

    // Assignment
    assignedTo?: string;
    assignedDepartment: string;

    // Timestamps
    createdAt: Timestamp;
    updatedAt: Timestamp;
    resolvedAt?: Timestamp;
    closedAt?: Timestamp;
    lastStatusChange?: Timestamp;
    assignedAt?: Timestamp;
    inProgressAt?: Timestamp;
    escalatedAt?: Timestamp;

    // Intervention actions
    interventionActions?: Array<{
        type: 'call' | 'escalation';
        timestamp: Timestamp;
        reason?: string;
        message?: string;
        userId: string;
        userName?: string;
    }>;

    // Citizen intervention tickets
    citizenTickets?: Array<{
        reason: string;
        message?: string;
        timestamp: Timestamp;
    }>;
}

// Escalation Types
export type EscalationReason = 'sla-breach' | 'manual' | 'priority';

export interface Escalation {
    id: string;
    complaintId: string;
    complaintTrackingId: string;
    reason: EscalationReason;
    escalatedFrom: string;
    escalatedTo: string;
    escalatedBy: string;
    escalatedAt: Timestamp;
    resolved: boolean;
    resolvedAt?: Timestamp;
    notes?: string;
}

// Audit Log Types
export interface AuditLog {
    id: string;
    complaintId: string;
    action: string;
    performedBy: string;
    performedByName: string;
    performedByRole: UserRole;
    oldValue?: any;
    newValue?: any;
    timestamp: Timestamp;
    metadata?: Record<string, any>;
}

// Department Types
export interface Department {
    id: string;
    name: string;
    categories: string[];
    slaHours: number;
    officials: string[];
    contactEmail: string;
    isActive: boolean;
}

// Dashboard Types
export interface DashboardStats {
    totalComplaints: number;
    pending: number;
    inProgress: number;
    resolved: number;
    escalated: number;
    breached: number;
    atRisk: number;
    avgResolutionTime: number;
}

export interface ComplaintFilter {
    status?: ComplaintStatus[];
    department?: string[];
    priority?: ComplaintPriority[];
    slaStatus?: SLAStatus[];
    dateFrom?: Date;
    dateTo?: Date;
}

// Form Types
export interface ComplaintFormData {
    title: string;
    description: string;
    category: string;
    location: string;
    photoURLs?: string[];
}

export interface SignUpData {
    email: string;
    password: string;
    displayName: string;
    role: UserRole;
    department?: string;
}
