import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats, getDepartmentStats, getSLAComplianceRate } from '@/lib/services/dashboard-service';
import { listComplaintsFor } from '@/lib/services/admin/complaint-service-admin';
import { errorResponse, HttpError, requireUser } from '@/lib/server/auth';

/**
 * GET /api/dashboard/stats
 * Statistics for staff, scoped to the complaints they may see.
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request);
        if (user.role === 'citizen') throw new HttpError(403, 'Staff access required');

        const type = request.nextUrl.searchParams.get('type') || 'overview';
        if (!['overview', 'departments', 'sla-compliance'].includes(type)) {
            throw new HttpError(400, 'Invalid stats type');
        }

        const complaints = await listComplaintsFor(user);
        const data = type === 'overview' ? getDashboardStats(complaints)
            : type === 'departments' ? getDepartmentStats(complaints)
                : { complianceRate: getSLAComplianceRate(complaints) };

        return NextResponse.json({ success: true, data });
    } catch (error) {
        return errorResponse(error, 'GET /api/dashboard/stats');
    }
}
