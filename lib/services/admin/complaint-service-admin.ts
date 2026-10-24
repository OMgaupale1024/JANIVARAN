import { createHash, randomInt, randomUUID } from 'crypto';
import { FieldValue, Timestamp, Transaction } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from '@/lib/firebase-admin';
import { HttpError, AuthUser } from '@/lib/server/auth';
import { classifyComplaint } from '@/lib/engines/classification-engine';
import {
    Actor, NewComplaintInput, STATUS_TIMESTAMP_FIELD, MAX_TICKETS_PER_COMPLAINT, MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES, TransferInput,
    checkPriorityChange, checkStatusChange, checkTransfer, complaintDepartment, deletionMode, evidencePathFromURL, isStaffFor,
} from '@/lib/complaint-policy';
import { Complaint, ComplaintPriority, ComplaintStatus } from '@/types/backend';

const COMPLAINTS = 'complaints';
const AUDIT_LOGS = 'auditLogs';
// Server-only: one record per (user, request ID) pointing at the complaint it created
const COMPLAINT_REQUESTS = 'complaintRequests';
const HOUR_MS = 60 * 60 * 1000;

// Server-side complaint records carry Admin SDK Timestamps
export type StoredComplaint = Complaint;

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const TRACKING_ID = /^JAN-\d{6}$/;
export const REQUEST_ID = /^[A-Za-z0-9_-]{16,128}$/;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function complaintRef(id: string) {
    if (!DOC_ID.test(id)) throw new HttpError(400, 'Invalid complaint ID');
    return adminDb().collection(COMPLAINTS).doc(id);
}

function writeAudit(tx: Transaction, actor: AuthUser, complaintId: string, action: string, extra: Record<string, unknown> = {}) {
    tx.create(adminDb().collection(AUDIT_LOGS).doc(), {
        complaintId,
        action,
        performedBy: actor.uid,
        performedByName: actor.displayName,
        performedByRole: actor.role,
        timestamp: Timestamp.now(),
        ...extra,
    });
}

/** Convert Timestamps to ISO strings so API responses are plain JSON. */
export function serialize<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
        return (value as unknown as Timestamp).toDate().toISOString() as T;
    }
    if (Array.isArray(value)) return value.map(serialize) as T;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)])) as T;
}

export async function getComplaintByIdAdmin(id: string): Promise<StoredComplaint | null> {
    const snap = await complaintRef(id).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() } as StoredComplaint) : null;
}

export async function getComplaintByTrackingIdAdmin(trackingId: string): Promise<StoredComplaint | null> {
    if (!TRACKING_ID.test(trackingId)) return null;
    const snap = await adminDb().collection(COMPLAINTS).where('trackingId', '==', trackingId).limit(1).get();
    return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as StoredComplaint);
}

/** Complaints visible to the actor: own (citizen), department (official), all (admin). */
export async function listComplaintsFor(actor: Actor): Promise<StoredComplaint[]> {
    const col = adminDb().collection(COMPLAINTS);
    let query;
    if (actor.role === 'admin') query = col.orderBy('createdAt', 'desc');
    else if (actor.role === 'official') {
        if (!actor.department) throw new HttpError(403, 'Your official account has no department assigned');
        query = col.where('assignedDepartment', '==', actor.department);
    } else query = col.where('citizenId', '==', actor.uid).orderBy('createdAt', 'desc');

    const snap = await query.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoredComplaint));
}

/** Check that each evidence URL is an image the caller uploaded to their own folder. */
async function verifyEvidence(urls: string[], uid: string): Promise<void> {
    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '';
    for (const url of urls) {
        const path = evidencePathFromURL(url, { uid, bucket, emulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST });
        if (!path) throw new HttpError(400, 'Photo evidence must be uploaded through the complaint form');
        const [metadata] = await adminBucket().file(path).getMetadata().catch((err: { code?: unknown; message?: string }) => {
            if (err.code === 404 && !/bucket does not exist/i.test(err.message ?? '')) {
                throw new HttpError(400, 'Uploaded photo was not found; please upload it again');
            }
            // Missing bucket, no access or outage: the server's setup, not the citizen's photo (no URL in logs)
            console.error(`Evidence check failed for bucket ${bucket}: code=${String(err.code)}`);
            throw new HttpError(503, 'The server could not check your photos right now. Please try again later or submit without photos.');
        });
        if (!PHOTO_CONTENT_TYPES.includes(metadata.contentType ?? '') || Number(metadata.size) > MAX_PHOTO_BYTES) {
            throw new HttpError(400, 'Photos must be JPG, PNG or WebP images up to 5MB');
        }
    }
}

/**
 * Create a complaint. Classification, SLA deadline and a unique tracking ID
 * are assigned server-side; the tracking ID is reserved in trackingIds/{id}
 * inside the same transaction so two complaints can never share one.
 *
 * With a requestId, the (user, requestId) record is created in that same
 * transaction, so a retry of the same request returns the original complaint
 * (replayed) and a reuse with different details is rejected with 409.
 */
export async function createComplaintAdmin(
    input: NewComplaintInput, user: AuthUser, requestId?: string,
): Promise<{ complaint: StoredComplaint; replayed: boolean }> {
    await verifyEvidence(input.photoURLs, user.uid);

    const db = adminDb();
    const { department, slaHours, priority } = classifyComplaint(input.description, input.category);
    const now = Timestamp.now();
    const ref = db.collection(COMPLAINTS).doc();
    const data = {
        title: input.title,
        description: input.description,
        category: input.category,
        department,
        assignedDepartment: department,
        status: 'pending' as ComplaintStatus,
        priority,
        location: input.location,
        photoURLs: input.photoURLs,
        citizenId: user.uid,
        citizenName: user.displayName,
        citizenEmail: user.email,
        // remainingHours/status are a creation-time snapshot; live values come from sla-service
        sla: { assignedHours: slaHours, deadline: Timestamp.fromMillis(now.toMillis() + slaHours * HOUR_MS), remainingHours: slaHours, status: 'on-track' },
        createdAt: now,
        updatedAt: now,
        lastStatusChange: now,
    };

    const request = requestId ? db.collection(COMPLAINT_REQUESTS).doc(sha256(`${user.uid}\n${requestId}`)) : null;
    const fingerprint = sha256(JSON.stringify(input));

    for (let attempt = 0; attempt < 5; attempt++) {
        const trackingId = `JAN-${randomInt(100000, 1000000)}`;
        const reservation = db.collection('trackingIds').doc(trackingId);
        const outcome = await db.runTransaction(async tx => {
            const [prior, reserved, legacy] = await Promise.all([
                request ? tx.get(request) : null,
                tx.get(reservation),
                tx.get(db.collection(COMPLAINTS).where('trackingId', '==', trackingId).limit(1)),
            ]);
            if (prior?.exists) {
                const original = await tx.get(db.collection(COMPLAINTS).doc(prior.get('complaintId')));
                if (!original.exists) throw new HttpError(409, 'This submission was already processed');
                if (prior.get('fingerprint') !== fingerprint) {
                    throw new HttpError(409, 'This request was already used for a different complaint', { trackingId: original.get('trackingId') });
                }
                return { id: original.id, ...original.data() } as StoredComplaint;
            }
            if (reserved.exists || !legacy.empty) return null; // tracking ID taken: try another
            tx.create(reservation, { complaintId: ref.id, createdAt: now });
            tx.create(ref, { ...data, trackingId });
            if (request) tx.create(request, { uid: user.uid, requestId, complaintId: ref.id, fingerprint, createdAt: now });
            writeAudit(tx, user, ref.id, 'created', { newValue: { status: 'pending', department, priority } });
            return 'created' as const;
        });
        if (outcome === 'created') return { complaint: { id: ref.id, trackingId, ...data } as unknown as StoredComplaint, replayed: false };
        if (outcome) return { complaint: outcome, replayed: true };
    }
    throw new HttpError(503, 'Could not allocate a tracking ID. Please try again.');
}

export interface ComplaintChanges {
    status?: unknown;
    priority?: unknown;
    officialId?: unknown;
}

/**
 * Apply staff changes (status, priority, assignment) atomically with their
 * audit records. Policy is checked against the record read in the transaction.
 */
export async function updateComplaintAdmin(id: string, actor: AuthUser, changes: ComplaintChanges) {
    const ref = complaintRef(id);
    const db = adminDb();

    return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'Complaint not found');
        const complaint = { id: snap.id, ...snap.data() } as StoredComplaint;
        if (!isStaffFor(actor, complaint)) throw new HttpError(403, 'Not authorized to update this complaint');
        const now = Timestamp.now();
        const update: Record<string, unknown> = {};
        const audits: Array<[string, Record<string, unknown>]> = [];
        let nextStatus: ComplaintStatus | undefined;

        if (changes.officialId !== undefined) {
            if (actor.role !== 'admin') throw new HttpError(403, 'Only an authority can assign complaints');
            if (typeof changes.officialId !== 'string' || !DOC_ID.test(changes.officialId)) throw new HttpError(400, 'Invalid official');
            const official = (await tx.get(db.collection('users').doc(changes.officialId))).data();
            if (official?.role !== 'official') throw new HttpError(400, 'Assignee must be an official');
            // Access follows assignedDepartment, so only an official of that department could work it
            const department = complaintDepartment(complaint);
            if (!department) throw new HttpError(409, 'This complaint has no department to assign within');
            if (official.department !== department) throw new HttpError(400, `Assignee must be an official of ${department}`);
            Object.assign(update, { assignedTo: changes.officialId, assignedAt: now });
            audits.push(['assigned', { oldValue: complaint.assignedTo ?? null, newValue: changes.officialId }]);
            if (complaint.status !== 'in-progress' && !checkStatusChange(actor, complaint, 'in-progress')) nextStatus = 'in-progress';
        }

        if (changes.status !== undefined && changes.status !== complaint.status) {
            const error = checkStatusChange(actor, complaint, changes.status);
            if (error) throw new HttpError(error.startsWith('Only') ? 403 : 400, error);
            nextStatus = changes.status as ComplaintStatus;
        }

        if (nextStatus) {
            update.status = nextStatus;
            update.lastStatusChange = now;
            const field = STATUS_TIMESTAMP_FIELD[nextStatus];
            if (field) update[field] = now;
            audits.push(['status_changed', { oldValue: complaint.status, newValue: nextStatus }]);
        }

        if (changes.priority !== undefined && changes.priority !== complaint.priority) {
            const error = checkPriorityChange(actor, complaint, changes.priority);
            if (error) throw new HttpError(error.startsWith('Only') ? 403 : 400, error);
            update.priority = changes.priority as ComplaintPriority;
            audits.push(['priority_changed', { oldValue: complaint.priority, newValue: changes.priority }]);
        }

        if (!audits.length) return { complaint, changed: false };

        update.updatedAt = now;
        tx.update(ref, update);
        for (const [action, extra] of audits) writeAudit(tx, actor, id, action, extra);
        return { complaint, changed: true, oldStatus: complaint.status, newStatus: nextStatus };
    });
}

/**
 * Authority moves a complaint to the department that should handle it (for
 * example one filed under the wrong category). It stays the same complaint:
 * tracking ID, citizen, evidence, status, priority and SLA deadline are kept;
 * the filed category stays as submitted. Access follows assignedDepartment,
 * so the old department loses it on commit. An assignee who doesn't belong
 * to the destination is cleared.
 */
export async function transferComplaintAdmin(id: string, actor: AuthUser, input: TransferInput) {
    const ref = complaintRef(id);
    const db = adminDb();

    return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'Complaint not found');
        const complaint = { id: snap.id, ...snap.data() } as StoredComplaint;
        const refused = checkTransfer(actor, complaint, input);
        if (refused) throw new HttpError(...refused);

        const from = complaintDepartment(complaint) ?? null;
        const to = input.department;
        const assignee = complaint.assignedTo ? (await tx.get(db.collection('users').doc(complaint.assignedTo))).data() : undefined;
        const unassign = !!complaint.assignedTo && !(assignee?.role === 'official' && assignee.department === to);
        const now = Timestamp.now();

        tx.update(ref, {
            department: to,
            assignedDepartment: to,
            // Shown on the citizen's timeline; who did it stays in the audit log
            transfers: FieldValue.arrayUnion({ from, to, reason: input.reason, at: now }),
            ...(unassign ? { assignedTo: FieldValue.delete() } : {}),
            updatedAt: now,
        });
        writeAudit(tx, actor, id, 'transferred', {
            oldValue: from,
            newValue: to,
            metadata: { reason: input.reason, ...(unassign ? { unassigned: complaint.assignedTo } : {}) },
        });
        return { complaint, from, to };
    });
}

/** Citizen raises a ticket on their own complaint; priority is upgraded atomically. */
export async function addCitizenTicketAdmin(id: string, actor: AuthUser, reason: string, message: string) {
    const ref = complaintRef(id);
    return adminDb().runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'Complaint not found');
        const complaint = snap.data() as StoredComplaint;
        if (complaint.citizenId !== actor.uid) throw new HttpError(403, 'You can only raise tickets on your own complaints');
        if (complaint.status === 'resolved' || complaint.status === 'closed') throw new HttpError(409, 'This complaint is already closed');
        if ((complaint.citizenTickets?.length ?? 0) >= MAX_TICKETS_PER_COMPLAINT) throw new HttpError(429, 'Ticket limit reached for this complaint');

        const now = Timestamp.now();
        const ticket = { id: randomUUID(), userId: actor.uid, reason, message, timestamp: now };
        const priority: ComplaintPriority = complaint.priority === 'critical' ? 'critical' : 'high';
        tx.update(ref, {
            citizenTickets: FieldValue.arrayUnion(ticket),
            priority,
            updatedAt: now,
            ...(complaint.escalatedAt ? {} : { escalatedAt: now }),
        });
        writeAudit(tx, actor, id, 'citizen_ticket_raised', { newValue: { reason, priority }, metadata: { ticketId: ticket.id } });
        return { ticketId: ticket.id, priority };
    });
}

export async function logCitizenCall(id: string, actor: AuthUser): Promise<StoredComplaint> {
    const ref = complaintRef(id);
    return adminDb().runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'Complaint not found');
        const complaint = { id: snap.id, ...snap.data() } as StoredComplaint;
        if (complaint.citizenId !== actor.uid) throw new HttpError(403, 'You can only act on your own complaints');
        writeAudit(tx, actor, id, 'citizen_called_authority');
        return complaint;
    });
}

/**
 * DELETE policy: admins permanently delete; citizens may only withdraw their
 * own pending/under-review complaint (kept as closed for the audit trail).
 */
export async function removeComplaintAdmin(id: string, actor: AuthUser): Promise<'deleted' | 'withdrawn'> {
    const ref = complaintRef(id);
    const result = await adminDb().runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'Complaint not found');
        const complaint = snap.data() as StoredComplaint;
        const mode = deletionMode(actor, complaint);
        if (!mode) {
            throw new HttpError(403, complaint.citizenId === actor.uid
                ? 'Complaints can only be withdrawn before work has started'
                : 'Not authorized to delete this complaint');
        }
        const now = Timestamp.now();
        if (mode === 'withdraw') {
            tx.update(ref, { status: 'closed', closedAt: now, withdrawnAt: now, closedReason: 'withdrawn-by-citizen', lastStatusChange: now, updatedAt: now });
            writeAudit(tx, actor, id, 'withdrawn', { oldValue: complaint.status, newValue: 'closed' });
            return { mode: 'withdrawn' as const, photos: [] };
        }
        tx.delete(ref);
        writeAudit(tx, actor, id, 'deleted', { oldValue: { trackingId: complaint.trackingId, title: complaint.title, citizenId: complaint.citizenId, status: complaint.status } });
        return { mode: 'deleted' as const, photos: complaint.photoURLs ?? [] };
    });

    // Best-effort cleanup of evidence belonging to a permanently deleted complaint
    if (result.photos.length) {
        const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '';
        await Promise.all(result.photos.map(url => {
            const ownerUid = /\/o\/complaints%2F([^%]+)%2F/.exec(url)?.[1] ?? '';
            const path = evidencePathFromURL(url, { uid: ownerUid, bucket, emulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST });
            return path ? adminBucket().file(path).delete().catch(err => console.warn('Evidence cleanup failed:', err.message)) : null;
        }));
    }
    return result.mode;
}

export async function getAuditLogsAdmin(complaintId: string) {
    const snap = await adminDb().collection(AUDIT_LOGS).where('complaintId', '==', complaintId).orderBy('timestamp', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getEscalationsAdmin(complaintId: string) {
    const snap = await adminDb().collection('escalations').where('complaintId', '==', complaintId).orderBy('escalatedAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
