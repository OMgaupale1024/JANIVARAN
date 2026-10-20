import { DEPARTMENT_CONFIG } from '../engines/classification-engine';

/**
 * Single source of truth for SLA calculations.
 *
 * The deadline stored on the complaint at creation (`sla.deadline`, derived from
 * the category's SLA hours) is authoritative. Older records without a stored
 * deadline fall back to `createdAt + sla.assignedHours`, then to the category's
 * configured hours. Priority never changes the deadline.
 */

const HOUR_MS = 60 * 60 * 1000;

// A complaint is "at risk" once 25% or less of its SLA window remains.
export const AT_RISK_FRACTION = 0.25;

export type SLAStatus = 'on-track' | 'at-risk' | 'breached';

export interface SLAResult {
    status: SLAStatus;
    remainingHours: number; // negative when overdue
    deadline: Date;
    assignedHours: number;
    progress: number; // 0-100 of the SLA window used
    closed: boolean; // resolved/closed: the clock stopped at closure
}

// Accepts the shapes timestamps arrive in: client/admin Timestamp, Date,
// ISO string, epoch ms, or a JSON-serialised Timestamp.
export function toMillis(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const ms = Date.parse(value);
        return Number.isNaN(ms) ? null : ms;
    }
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
    if (typeof value === 'object') {
        const v = value as { toMillis?: () => number; seconds?: number; _seconds?: number; nanoseconds?: number; _nanoseconds?: number };
        if (typeof v.toMillis === 'function') return v.toMillis();
        const seconds = v.seconds ?? v._seconds;
        if (typeof seconds === 'number') return seconds * 1000 + Math.floor((v.nanoseconds ?? v._nanoseconds ?? 0) / 1e6);
    }
    return null;
}

export interface SLAInput {
    createdAt?: unknown;
    category?: string;
    status?: string;
    sla?: { assignedHours?: number; deadline?: unknown } | null;
    resolvedAt?: unknown;
    closedAt?: unknown;
    updatedAt?: unknown;
}

export function isClosedStatus(status?: string): boolean {
    return status === 'resolved' || status === 'closed';
}

export function slaHoursForCategory(category?: string): number {
    const config = DEPARTMENT_CONFIG[category as keyof typeof DEPARTMENT_CONFIG] ?? DEPARTMENT_CONFIG.Other;
    return config.slaHours;
}

export function getAssignedHours(c: SLAInput): number {
    const stored = c.sla?.assignedHours;
    return typeof stored === 'number' && stored > 0 ? stored : slaHoursForCategory(c.category);
}

export function getSLADeadline(c: SLAInput): Date {
    const stored = toMillis(c.sla?.deadline);
    if (stored !== null) return new Date(stored);
    const created = toMillis(c.createdAt) ?? Date.now();
    return new Date(created + getAssignedHours(c) * HOUR_MS);
}

export function calculateSLA(c: SLAInput, now: number = Date.now()): SLAResult {
    const assignedHours = getAssignedHours(c);
    const deadline = getSLADeadline(c).getTime();
    const created = toMillis(c.createdAt) ?? deadline - assignedHours * HOUR_MS;
    const windowMs = Math.max(deadline - created, 1);
    const closed = isClosedStatus(c.status);
    const end = closed
        ? toMillis(c.resolvedAt) ?? toMillis(c.closedAt) ?? toMillis(c.updatedAt) ?? now
        : now;
    const remainingMs = deadline - end;

    let status: SLAStatus;
    if (remainingMs <= 0) status = 'breached';
    else if (remainingMs <= windowMs * AT_RISK_FRACTION) status = 'at-risk';
    else status = 'on-track';

    return {
        status,
        remainingHours: remainingMs / HOUR_MS,
        deadline: new Date(deadline),
        assignedHours,
        progress: Math.min(100, Math.max(0, ((end - created) / windowMs) * 100)),
        closed,
    };
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
