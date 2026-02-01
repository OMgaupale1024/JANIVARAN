import { NextRequest, NextResponse } from 'next/server';
import { addCitizenTicketAdmin } from '@/lib/services/admin/complaint-service-admin';
import { logAudit } from '@/lib/services/audit-service';

/**
 * POST /api/complaints/[id]/intervene
 * Handle citizen intervention actions: 'call' or 'raise-ticket'
 */
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const { id } = params;
        const body = await request.json();
        const { action, reason, message, user } = body;

        console.log(`📡 [API] Intervene: ${action} on ${id}`);

        if (!user || !user.uid) {
            return NextResponse.json(
                { success: false, error: 'User information required' },
                { status: 401 }
            );
        }

        if (action === 'call') {
            // Log the call action
            await logAudit({
                complaintId: id,
                action: 'citizen_called_authority',
                performedBy: user.uid,
                performedByName: user.displayName || 'Citizen',
                performedByRole: 'citizen',
                metadata: { message: 'Citizen initiated call to authority' }
            });
            return NextResponse.json({ success: true, message: 'Call logged' });
        }

        if (action === 'raise-ticket') {
            if (!reason) {
                return NextResponse.json(
                    { success: false, error: 'Reason is required for raising a ticket' },
                    { status: 400 }
                );
            }

            await addCitizenTicketAdmin(id, reason, message || '', user);

            return NextResponse.json({
                success: true,
                message: 'Ticket raised and priority upgraded'
            });
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action' },
            { status: 400 }
        );

    } catch (error: any) {
        console.error('Intervention API Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to process intervention' },
            { status: 500 }
        );
    }
}
