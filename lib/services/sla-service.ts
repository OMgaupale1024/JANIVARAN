import { Timestamp } from 'firebase/firestore';
import { Complaint, ComplaintPriority } from '@/types/backend';

// SLA durations in hours by priority
const SLA_HOURS: Record<ComplaintPriority, number> = {
    critical: 24,
    high: 72,
    medium: 168, // 7 days
    low: 336, // 14 days
};

export type SLAStatus = 'on-track' | 'at-risk' | 'breached';

export interface SLAResult {
    status: SLAStatus;
    remainingHours: number;
    deadline: Date;
    progress: number; // 0-100
}

/**
 * Calculate SLA status for a complaint
 */
export function calculateSLA(complaint: Complaint): SLAResult {
    const now = Date.now();
    const createdAt = complaint.createdAt instanceof Timestamp
        ? complaint.createdAt.toMillis()
        : new Date(complaint.createdAt).getTime();

    const slaHours = SLA_HOURS[complaint.priority] || SLA_HOURS.medium;
    const slaDurationMs = slaHours * 60 * 60 * 1000;
    const deadline = createdAt + slaDurationMs;
    const elapsed = now - createdAt;
    const remaining = deadline - now;

    // Calculate progress (0-100)
    const progress = Math.min(100, Math.max(0, (elapsed / slaDurationMs) * 100));

    // Determine status
    let status: SLAStatus;
    if (remaining <= 0) {
        status = 'breached';
    } else if (remaining < slaDurationMs * 0.5) {
        status = 'at-risk';
    } else {
        status = 'on-track';
    }

    return {
        status,
        remainingHours: remaining / (60 * 60 * 1000),
        deadline: new Date(deadline),
        progress
    };
}

/**
 * Get SLA hours for a priority level
 */
export function getSLAHours(priority: ComplaintPriority): number {
    return SLA_HOURS[priority] || SLA_HOURS.medium;
}

/**
 * Format remaining time as human-readable string
 */
export function formatRemainingTime(hours: number): string {
    const absHours = Math.abs(hours);

    if (absHours < 1) {
        const minutes = Math.round(absHours * 60);
        return hours < 0 ? `-${minutes}m` : `${minutes}m`;
    }

    if (absHours < 24) {
        const h = Math.floor(absHours);
        const m = Math.round((absHours - h) * 60);
        return hours < 0 ? `-${h}h ${m}m` : `${h}h ${m}m`;
    }

    const days = Math.floor(absHours / 24);
    const h = Math.floor(absHours % 24);
    return hours < 0 ? `-${days}d ${h}h` : `${days}d ${h}h`;
}
