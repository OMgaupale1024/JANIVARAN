import { NextRequest, NextResponse } from 'next/server';
import { listComplaintsFor } from '@/lib/services/admin/complaint-service-admin';
import { complaintToGrievance } from '@/lib/utils/type-mappers';
import { errorResponse, requireUser } from '@/lib/server/auth';

/**
 * GET /api/grievances
 * Complaints visible to the signed-in user, in the admin UI's Grievance format.
 * Role and department come from the verified user record, never from query params.
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request);
        const complaints = await listComplaintsFor(user);
        return NextResponse.json(complaints.map(complaintToGrievance));
    } catch (error) {
        return errorResponse(error, 'GET /api/grievances');
    }
}

/**
 * POST /api/grievances
 * This endpoint is deprecated - use /api/complaints instead
 */
export async function POST() {
    return NextResponse.json(
        { error: 'This endpoint is deprecated. Use /api/complaints instead' },
        { status: 410 }
    );
}
