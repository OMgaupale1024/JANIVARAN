import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats, getDepartmentStats, getSLAComplianceRate } from '@/lib/services/dashboard-service';

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get('type') || 'overview';

        let data;

        switch (type) {
            case 'overview':
                data = await getDashboardStats();
                break;
            case 'departments':
                data = await getDepartmentStats();
                break;
            case 'sla-compliance':
                const rate = await getSLAComplianceRate();
                data = { complianceRate: rate };
                break;
            default:
                return NextResponse.json(
                    { success: false, error: 'Invalid stats type' },
                    { status: 400 }
                );
        }

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('GET /api/dashboard/stats error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch stats' },
            { status: 500 }
        );
    }
}
