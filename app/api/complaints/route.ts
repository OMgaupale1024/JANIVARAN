import { NextRequest, NextResponse } from 'next/server';
import { createComplaintAdmin, listComplaintsFor, serialize } from '@/lib/services/admin/complaint-service-admin';
import { sendComplaintSubmittedEmail } from '@/lib/services/notification-service';
import { validateNewComplaint } from '@/lib/complaint-policy';
import { errorResponse, readJson, requireUser } from '@/lib/server/auth';

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
 * Create a complaint for the signed-in user
 */
export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);
        const input = validateNewComplaint(await readJson(request));
        if (!input.ok) {
            return NextResponse.json({ success: false, error: input.error }, { status: 400 });
        }

        const complaint = await createComplaintAdmin(input.value, user);
        const notification = await sendComplaintSubmittedEmail(complaint, user.email);

        return NextResponse.json({ success: true, data: serialize(complaint), notification }, { status: 201 });
    } catch (error) {
        return errorResponse(error, 'POST /api/complaints');
    }
}
