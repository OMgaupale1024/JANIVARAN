import { NextRequest, NextResponse } from 'next/server';
import { getComplaints } from '@/lib/services/complaint-query-service';
import { complaintToGrievance } from '@/lib/utils/type-mappers';

/**
 * GET /api/grievances
 * Fetches complaints from Firestore and converts to Grievance format
 * 
 * Query params:
 * - role: 'admin' | 'official' | 'citizen'
 * - department: required if role=official
 * - userId: required if role=citizen
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const role = searchParams.get('role') || 'admin';
        const department = searchParams.get('department');
        const userId = searchParams.get('userId');

        // Validate role
        if (!['admin', 'official', 'citizen'].includes(role)) {
            return NextResponse.json(
                { error: 'Invalid role. Must be admin, official, or citizen' },
                { status: 400 }
            );
        }

        // Build query options
        const queryOptions: any = { role };

        if (role === 'official') {
            if (!department) {
                return NextResponse.json(
                    { error: 'department parameter required for official role' },
                    { status: 400 }
                );
            }
            queryOptions.department = department;
        }

        if (role === 'citizen') {
            if (!userId) {
                return NextResponse.json(
                    { error: 'userId parameter required for citizen role' },
                    { status: 400 }
                );
            }
            queryOptions.userId = userId;
        }

        // Fetch complaints from Firestore
        const complaints = await getComplaints(queryOptions);

        // Convert to Grievance format for admin UI compatibility
        const grievances = complaints.map(complaintToGrievance);

        return NextResponse.json(grievances);
    } catch (error) {
        console.error('Error fetching grievances:', error);
        return NextResponse.json(
            { error: 'Failed to fetch grievances' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/grievances
 * This endpoint is deprecated - use /api/complaints instead
 */
export async function POST(request: Request) {
    return NextResponse.json(
        { error: 'This endpoint is deprecated. Use /api/complaints instead' },
        { status: 410 }
    );
}
