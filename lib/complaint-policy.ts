import { ComplaintPriority, ComplaintStatus, UserRole } from '@/types/backend';
import { DEPARTMENT_CONFIG } from '@/lib/engines/classification-engine';

/**
 * Server-side authorization and validation policy for complaints.
 * Pure functions: callers pass a verified actor (from an ID token + the
 * trusted users/{uid} record) and the stored complaint.
 *
 * Roles:
 *  - citizen:  files complaints; sees and acts only on their own.
 *  - official: sees and works complaints routed to their department.
 *  - admin ("Authority"): sees everything; exclusive rights to resolve/close,
 *              change priority, assign, and permanently delete.
 *
 * Withdrawal vs deletion:
 *  - A citizen may WITHDRAW their own complaint while it is still pending or
 *    under review. The record is kept and closed (closedReason
 *    'withdrawn-by-citizen') so the audit trail survives.
 *  - Only an admin may permanently DELETE a complaint.
 */

export interface Actor {
    uid: string;
    role: UserRole;
    department?: string;
}

export interface ComplaintScope {
    citizenId: string;
    status: ComplaintStatus;
    department?: string;
    assignedDepartment?: string;
}

export const COMPLAINT_STATUSES: ComplaintStatus[] = ['pending', 'under-review', 'in-progress', 'escalated', 'resolved', 'closed'];
export const PRIORITIES: ComplaintPriority[] = ['low', 'medium', 'high', 'critical'];
export const WITHDRAWABLE_STATUSES: ComplaintStatus[] = ['pending', 'under-review'];

const ADMIN_ONLY_STATUSES: ComplaintStatus[] = ['resolved', 'closed'];

export const STATUS_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
    'pending': ['under-review', 'in-progress', 'escalated', 'resolved', 'closed'],
    'under-review': ['in-progress', 'escalated', 'resolved', 'closed'],
    'in-progress': ['under-review', 'escalated', 'resolved', 'closed'],
    'escalated': ['under-review', 'in-progress', 'resolved', 'closed'],
    'resolved': ['closed'],
    'closed': [],
};

// Timestamp field recorded when a complaint enters each status
export const STATUS_TIMESTAMP_FIELD: Partial<Record<ComplaintStatus, string>> = {
    'under-review': 'underReviewAt',
    'in-progress': 'inProgressAt',
    'escalated': 'escalatedAt',
    'resolved': 'resolvedAt',
    'closed': 'closedAt',
};

export const TICKET_REASONS = [
    'No progress for extended period',
    'SLA deadline breached',
    'Unsatisfactory response',
    'Urgent matter requiring immediate attention',
    'Other',
];
export const MAX_TICKETS_PER_COMPLAINT = 10;
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function complaintDepartment(c: ComplaintScope): string | undefined {
    return c.assignedDepartment ?? c.department;
}

export function isStaffFor(actor: Actor, c: ComplaintScope): boolean {
    if (actor.role === 'admin') return true;
    return actor.role === 'official' && !!actor.department && actor.department === complaintDepartment(c);
}

export function canViewComplaint(actor: Actor, c: ComplaintScope): boolean {
    return c.citizenId === actor.uid || isStaffFor(actor, c);
}

/** Returns an error message, or null when the status change is allowed. */
export function checkStatusChange(actor: Actor, c: ComplaintScope, next: unknown): string | null {
    if (!isStaffFor(actor, c)) return 'Not authorized to update this complaint';
    if (!COMPLAINT_STATUSES.includes(next as ComplaintStatus)) return 'Invalid status';
    const target = next as ComplaintStatus;
    if (ADMIN_ONLY_STATUSES.includes(target) && actor.role !== 'admin') return 'Only an authority can resolve or close complaints';
    if (!STATUS_TRANSITIONS[c.status]?.includes(target)) return `Cannot change status from ${c.status} to ${target}`;
    return null;
}

export function checkPriorityChange(actor: Actor, c: ComplaintScope, next: unknown): string | null {
    if (actor.role !== 'admin') return 'Only an authority can change priority';
    if (!PRIORITIES.includes(next as ComplaintPriority)) return 'Invalid priority';
    if (c.status === 'resolved' || c.status === 'closed') return 'Cannot change priority of a closed complaint';
    return null;
}

export function deletionMode(actor: Actor, c: ComplaintScope): 'delete' | 'withdraw' | null {
    if (actor.role === 'admin') return 'delete';
    if (c.citizenId === actor.uid && WITHDRAWABLE_STATUSES.includes(c.status)) return 'withdraw';
    return null;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function text(value: unknown, field: string, min: number, max: number): Result<string> {
    if (typeof value !== 'string') return { ok: false, error: `${field} must be text` };
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) {
        return { ok: false, error: `${field} must be between ${min} and ${max} characters` };
    }
    return { ok: true, value: trimmed };
}

export interface NewComplaintInput {
    title: string;
    description: string;
    category: string;
    location: string;
    photoURLs: string[];
}

const COMPLAINT_FIELDS = ['title', 'description', 'category', 'location', 'photoURLs'];

export function validateNewComplaint(body: unknown): Result<NewComplaintInput> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid request body' };
    const input = body as Record<string, unknown>;
    const unknownField = Object.keys(input).find(k => !COMPLAINT_FIELDS.includes(k));
    if (unknownField) return { ok: false, error: `Unexpected field: ${unknownField}` };

    if (typeof input.category !== 'string' || !(input.category in DEPARTMENT_CONFIG)) {
        return { ok: false, error: 'Invalid category' };
    }
    const description = text(input.description, 'Description', 10, 2000);
    if (!description.ok) return description;
    const location = text(input.location, 'Location', 3, 300);
    if (!location.ok) return location;
    const rawTitle = typeof input.title === 'string' && input.title.trim() ? input.title : `${input.category} Issue`;
    const title = text(rawTitle, 'Title', 3, 120);
    if (!title.ok) return title;

    const photos = input.photoURLs ?? [];
    if (!Array.isArray(photos) || photos.length > MAX_PHOTOS || photos.some(p => typeof p !== 'string' || p.length > 2048)) {
        return { ok: false, error: `Up to ${MAX_PHOTOS} photo URLs are allowed` };
    }

    return {
        ok: true,
        value: {
            title: title.value,
            description: description.value,
            category: input.category,
            location: location.value,
            photoURLs: photos as string[],
        },
    };
}

/**
 * Parse a Firebase Storage download URL and return its object path when it
 * points into the uploader's own evidence folder (complaints/{uid}/...).
 */
export function evidencePathFromURL(url: string, opts: { uid: string; bucket: string; emulatorHost?: string }): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    const prodHost = parsed.protocol === 'https:' && parsed.host === 'firebasestorage.googleapis.com';
    const emulatorHost = !!opts.emulatorHost && parsed.protocol === 'http:' && parsed.host === opts.emulatorHost;
    if (!prodHost && !emulatorHost) return null;

    const prefix = `/v0/b/${opts.bucket}/o/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    let objectPath: string;
    try {
        objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length));
    } catch {
        return null;
    }
    const segments = objectPath.split('/');
    if (segments.length !== 4 || segments[0] !== 'complaints' || segments[1] !== opts.uid) return null;
    if (segments.some(s => !s || s === '.' || s === '..')) return null;
    return objectPath;
}

export function validateTicket(body: Record<string, unknown>): Result<{ reason: string; message: string }> {
    if (typeof body.reason !== 'string' || !TICKET_REASONS.includes(body.reason)) {
        return { ok: false, error: 'A valid reason is required for raising a ticket' };
    }
    const message = body.message ?? '';
    if (typeof message !== 'string' || message.length > 1000) {
        return { ok: false, error: 'Message must be text of at most 1000 characters' };
    }
    return { ok: true, value: { reason: body.reason, message: message.trim() } };
}
