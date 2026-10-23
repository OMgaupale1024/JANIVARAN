import { NextRequest, NextResponse } from 'next/server';
import { createComplaintAdmin, listComplaintsFor, serialize, REQUEST_ID } from '@/lib/services/admin/complaint-service-admin';
import { complaintSubmittedEmail, queueEmail } from '@/lib/services/notification-service';
import { validateNewComplaint } from '@/lib/complaint-policy';
import { errorResponse, HttpError, readJson, requireUser } from '@/lib/server/auth';

/**
 * GET /api/complaints
 * Complaints visible to the signed-in user (own / department / all by role)
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request);
        const complaints = await listComplaintsFor(user);
        return NextResponse.json({ success: true, data: serialize(complaints) });
    } catch (error) {
        return errorResponse(error, 'GET /api/complaints');
    }
}

/**
 * POST /api/complaints
 * Create a complaint for the signed-in user. An optional Idempotency-Key header
 * makes retries safe: the same key returns the complaint it already created.
 * The confirmation email is sent after the response (best effort).
 */
export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);
        const requestId = request.headers.get('idempotency-key') ?? undefined;
        if (requestId !== undefined && !REQUEST_ID.test(requestId)) {
            throw new HttpError(400, 'Invalid Idempotency-Key header');
        }
        const input = validateNewComplaint(await readJson(request));
        if (!input.ok) {
            return NextResponse.json({ success: false, error: input.error }, { status: 400 });
        }

        const { complaint, replayed } = await createComplaintAdmin(input.value, user, requestId);
        if (replayed) {
            return NextResponse.json({ success: true, data: serialize(complaint), notification: 'skipped', replayed: true });
        }

        const notification = queueEmail(complaintSubmittedEmail(complaint, user.email));
        return NextResponse.json({ success: true, data: serialize(complaint), notification }, { status: 201 });
    } catch (error) {
        return errorResponse(error, 'POST /api/complaints');
    }
}
