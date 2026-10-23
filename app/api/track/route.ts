import { NextRequest, NextResponse } from 'next/server';
import { getComplaintByTrackingIdAdmin, serialize, TRACKING_ID } from '@/lib/services/admin/complaint-service-admin';
import { errorResponse } from '@/lib/server/auth';

// Fields safe to show to anyone holding a tracking ID. Tracking IDs are short
// and guessable, so citizen identity, evidence, tickets and all free text
// (title, description, location: they can contain addresses or names) are excluded.
const PUBLIC_FIELDS = [
    'trackingId', 'category', 'department', 'assignedDepartment', 'status', 'priority', 'sla',
    'createdAt', 'updatedAt', 'underReviewAt', 'assignedAt', 'inProgressAt', 'escalatedAt', 'resolvedAt', 'closedAt',
] as const;

/**
 * GET /api/track?trackingId=JAN-123456
 * Public, read-only status lookup.
 */
export async function GET(request: NextRequest) {
    try {
        const trackingId = (request.nextUrl.searchParams.get('trackingId') ?? '').trim().toUpperCase();
        if (!TRACKING_ID.test(trackingId)) {
            return NextResponse.json({ success: false, error: 'Tracking IDs look like JAN-123456' }, { status: 400 });
        }

        const complaint = await getComplaintByTrackingIdAdmin(trackingId);
        if (!complaint) {
            return NextResponse.json({ success: false, error: 'Complaint not found' }, { status: 404 });
        }

        const record = complaint as unknown as Record<string, unknown>;
        const publicView = Object.fromEntries(PUBLIC_FIELDS.filter(f => record[f] !== undefined).map(f => [f, record[f]]));
        return NextResponse.json({ success: true, data: serialize(publicView) });
    } catch (error) {
        return errorResponse(error, 'GET /api/track');
    }
}
