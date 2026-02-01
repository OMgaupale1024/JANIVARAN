import { Complaint, ComplaintStatus } from '@/types/backend';
import { Timestamp } from 'firebase/firestore';

// Configuration for stalled detection
const STALLED_THRESHOLD_PERCENTAGE = 0.7; // 70% of SLA duration

// SLA durations in hours by priority
const SLA_HOURS: Record<string, number> = {
    CRITICAL: 24,
    HIGH: 72,
    MEDIUM: 168, // 7 days
    LOW: 336, // 14 days
};

/**
 * Check if a complaint is stalled (not progressing)
 * A complaint is stalled if:
 * 1. Status unchanged for >70% of SLA duration, OR
 * 2. SLA has already been breached
 */
export function isComplaintStalled(complaint: Complaint): boolean {
    // Resolved complaints are never stalled
    if (complaint.status === 'RESOLVED') {
        return false;
    }

    // Check if SLA is breached
    if (isSLABreached(complaint)) {
        return true;
    }

    // Check if status unchanged for significant portion of SLA
    const progressPercentage = getProgressPercentage(complaint);
    return progressPercentage >= STALLED_THRESHOLD_PERCENTAGE;
}

/**
 * Check if SLA has been breached
 */
export function isSLABreached(complaint: Complaint): boolean {
    const slaHours = SLA_HOURS[complaint.priority] || SLA_HOURS.MEDIUM;
    const createdAt = complaint.createdAt instanceof Timestamp
        ? complaint.createdAt.toDate()
        : new Date(complaint.createdAt);

    const slaDeadline = new Date(createdAt.getTime() + slaHours * 60 * 60 * 1000);
    return new Date() > slaDeadline;
}

/**
 * Get progress percentage (0-1) based on time elapsed since last status change
 */
export function getProgressPercentage(complaint: Complaint): number {
    const slaHours = SLA_HOURS[complaint.priority] || SLA_HOURS.MEDIUM;
    const slaDurationMs = slaHours * 60 * 60 * 1000;

    // Use lastStatusChange if available, otherwise use createdAt
    const lastChange = complaint.lastStatusChange
        ? (complaint.lastStatusChange instanceof Timestamp
            ? complaint.lastStatusChange.toDate()
            : new Date(complaint.lastStatusChange))
        : (complaint.createdAt instanceof Timestamp
            ? complaint.createdAt.toDate()
            : new Date(complaint.createdAt));

    const elapsedMs = Date.now() - lastChange.getTime();
    return Math.min(elapsedMs / slaDurationMs, 1);
}

/**
 * Get remaining time in hours until SLA breach
 */
export function getRemainingHours(complaint: Complaint): number {
    const slaHours = SLA_HOURS[complaint.priority] || SLA_HOURS.MEDIUM;
    const createdAt = complaint.createdAt instanceof Timestamp
        ? complaint.createdAt.toDate()
        : new Date(complaint.createdAt);

    const slaDeadline = new Date(createdAt.getTime() + slaHours * 60 * 60 * 1000);
    const remainingMs = slaDeadline.getTime() - Date.now();
    return remainingMs / (60 * 60 * 1000); // Convert to hours
}

/**
 * Get stalled status label
 */
export function getStalledStatusLabel(complaint: Complaint): 'ACTION_REQUIRED' | 'DELAYED' | null {
    if (!isComplaintStalled(complaint)) {
        return null;
    }

    if (isSLABreached(complaint)) {
        return 'DELAYED';
    }

    return 'ACTION_REQUIRED';
}

/**
 * Filter stalled complaints from a list
 */
export function getStalledComplaints(complaints: Complaint[]): Complaint[] {
    return complaints.filter(isComplaintStalled);
}

/**
 * Check if complaint needs SLA warning email (within 20% of deadline)
 */
export function needsSLAWarning(complaint: Complaint): boolean {
    if (complaint.status === 'RESOLVED') {
        return false;
    }

    const remainingHours = getRemainingHours(complaint);
    const slaHours = SLA_HOURS[complaint.priority] || SLA_HOURS.MEDIUM;
    const warningThreshold = slaHours * 0.2; // 20% of SLA duration

    return remainingHours > 0 && remainingHours <= warningThreshold;
}

/**
 * Get human-readable time remaining
 */
export function formatTimeRemaining(hours: number): string {
    if (hours < 0) {
        const overdue = Math.abs(hours);
        if (overdue < 1) return `${Math.round(overdue * 60)} minutes overdue`;
        if (overdue < 24) return `${Math.round(overdue)} hours overdue`;
        return `${Math.round(overdue / 24)} days overdue`;
    }

    if (hours < 1) return `${Math.round(hours * 60)} minutes`;
    if (hours < 24) return `${Math.round(hours)} hours`;
    return `${Math.round(hours / 24)} days`;
}

/**
 * Get SLA deadline date
 */
export function getSLADeadline(complaint: Complaint): Date {
    const slaHours = SLA_HOURS[complaint.priority] || SLA_HOURS.MEDIUM;
    const createdAt = complaint.createdAt instanceof Timestamp
        ? complaint.createdAt.toDate()
        : new Date(complaint.createdAt);

    return new Date(createdAt.getTime() + slaHours * 60 * 60 * 1000);
}
