import { NextRequest, NextResponse } from 'next/server';
import { createComplaint, getComplaints, getComplaintsByCitizen } from '@/lib/services/complaint-service';
import { ComplaintFormData } from '@/types/backend';

/**
 * GET /api/complaints
 * Get all complaints or filter by citizen
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const citizenId = searchParams.get('citizenId');

        let complaints;
        if (citizenId) {
            complaints = await getComplaintsByCitizen(citizenId);
        } else {
            complaints = await getComplaints();
        }

        return NextResponse.json({ success: true, data: complaints });
    } catch (error: any) {
        console.error('GET /api/complaints error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch complaints' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/complaints
 * Create a new complaint
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { formData, user } = body;

        if (!formData || !user) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const complaint = await createComplaint(formData as ComplaintFormData, user);

        return NextResponse.json({ success: true, data: complaint }, { status: 201 });
    } catch (error: any) {
        console.error('POST /api/complaints error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to create complaint' },
            { status: 500 }
        );
    }
}
