import { calculateSLA, toMillis, SLAInput } from './sla-service';

// A complaint is stalled when its status has not changed for 70% of its SLA window
const STALLED_THRESHOLD_PERCENTAGE = 0.7;

type StallInput = SLAInput & { lastStatusChange?: unknown };

/**
 * Check if a complaint is stalled (not progressing)
 * A complaint is stalled if:
 * 1. SLA has already been breached, OR
 * 2. Status unchanged for >70% of the SLA window
 * Resolved/closed complaints are never stalled.
 */
export function isComplaintStalled(complaint: StallInput, now: number = Date.now()): boolean {
    const sla = calculateSLA(complaint, now);
    if (sla.closed) return false;
    if (sla.status === 'breached') return true;
    return getProgressPercentage(complaint, now) >= STALLED_THRESHOLD_PERCENTAGE;
}

/**
 * Check if SLA has been breached (open complaints only)
 */
export function isSLABreached(complaint: StallInput, now: number = Date.now()): boolean {
    const sla = calculateSLA(complaint, now);
    return !sla.closed && sla.status === 'breached';
}

/**
 * Fraction (0-1) of the SLA window elapsed since the last status change
 */
export function getProgressPercentage(complaint: StallInput, now: number = Date.now()): number {
    const sla = calculateSLA(complaint, now);
    const windowMs = sla.assignedHours * 60 * 60 * 1000;
    const lastChange = toMillis(complaint.lastStatusChange) ?? toMillis(complaint.createdAt) ?? now;
    return Math.min((now - lastChange) / windowMs, 1);
}

/**
 * Get stalled status label
 */
export function getStalledStatusLabel(complaint: StallInput, now: number = Date.now()): 'ACTION_REQUIRED' | 'DELAYED' | null {
    if (!isComplaintStalled(complaint, now)) return null;
    return isSLABreached(complaint, now) ? 'DELAYED' : 'ACTION_REQUIRED';
}

/**
 * Filter stalled complaints from a list
 */
export function getStalledComplaints<T extends StallInput>(complaints: T[], now: number = Date.now()): T[] {
    return complaints.filter(c => isComplaintStalled(c, now));
}
