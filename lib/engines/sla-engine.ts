import { Timestamp } from 'firebase/firestore';
import { SLA, SLAStatus, ComplaintPriority } from '@/types/backend';

/**
 * Calculate SLA deadline based on assigned hours
 */
export function calculateSLADeadline(assignedHours: number, createdAt: Timestamp = Timestamp.now()): Timestamp {
    const deadlineMs = createdAt.toMillis() + (assignedHours * 60 * 60 * 1000);
    return Timestamp.fromMillis(deadlineMs);
}

/**
 * Calculate remaining hours until deadline
 */
export function calculateRemainingHours(deadline: Timestamp, now: Timestamp = Timestamp.now()): number {
    const remainingMs = deadline.toMillis() - now.toMillis();
    const remainingHours = remainingMs / (60 * 60 * 1000);
    return Math.max(0, remainingHours);
}

/**
 * Determine SLA status based on remaining time
 */
export function determineSLAStatus(remainingHours: number, assignedHours: number): SLAStatus {
    if (remainingHours <= 0) {
        return 'breached';
    }

    const percentRemaining = (remainingHours / assignedHours) * 100;

    if (percentRemaining <= 25) {
        return 'at-risk';
    }

    return 'on-track';
}

/**
 * Create initial SLA object for a new complaint
 */
export function createInitialSLA(assignedHours: number, createdAt: Timestamp = Timestamp.now()): SLA {
    const deadline = calculateSLADeadline(assignedHours, createdAt);
    const remainingHours = calculateRemainingHours(deadline);
    const status = determineSLAStatus(remainingHours, assignedHours);

    return {
        assignedHours,
        deadline,
        remainingHours,
        status,
    };
}

/**
 * Update SLA with current status
 */
export function updateSLA(sla: SLA, now: Timestamp = Timestamp.now()): SLA {
    const remainingHours = calculateRemainingHours(sla.deadline, now);
    const status = determineSLAStatus(remainingHours, sla.assignedHours);

    return {
        ...sla,
        remainingHours,
        status,
    };
}

/**
 * Adjust SLA based on priority escalation
 */
export function adjustSLAForPriority(sla: SLA, newPriority: ComplaintPriority): SLA {
    const priorityMultipliers: Record<ComplaintPriority, number> = {
        critical: 0.5,  // Halve the time
        high: 0.75,
        medium: 1.0,
        low: 1.25,
    };

    const multiplier = priorityMultipliers[newPriority];
    const newAssignedHours = sla.assignedHours * multiplier;

    return createInitialSLA(newAssignedHours);
}

/**
 * Check if SLA should trigger escalation
 */
export function shouldEscalate(sla: SLA): boolean {
    return sla.status === 'breached' || sla.status === 'at-risk';
}

/**
 * Format remaining time for display
 */
export function formatRemainingTime(remainingHours: number): string {
    if (remainingHours <= 0) {
        return 'Overdue';
    }

    if (remainingHours < 1) {
        const minutes = Math.floor(remainingHours * 60);
        return `${minutes} minutes`;
    }

    if (remainingHours < 24) {
        return `${Math.floor(remainingHours)} hours`;
    }

    const days = Math.floor(remainingHours / 24);
    const hours = Math.floor(remainingHours % 24);
    return `${days}d ${hours}h`;
}
