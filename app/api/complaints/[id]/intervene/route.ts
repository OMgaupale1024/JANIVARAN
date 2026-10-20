import { NextRequest, NextResponse } from 'next/server';
import { addCitizenTicketAdmin, logCitizenCall } from '@/lib/services/admin/complaint-service-admin';
import { getAuthorityContact } from '@/lib/services/intervention-service';
import { validateTicket } from '@/lib/complaint-policy';
import { errorResponse, HttpError, readJson, requireUser } from '@/lib/server/auth';

/**
 * POST /api/complaints/[id]/intervene
 * Citizen intervention on their own complaint: 'call' or 'raise-ticket'
 */
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireUser(request);
        const { id } = await props.params;
        const body = await readJson(request);

        if (body.action === 'call') {
            const complaint = await logCitizenCall(id, user);
            return NextResponse.json({ success: true, contact: getAuthorityContact(complaint.category) });
        }

        if (body.action === 'raise-ticket') {
            const ticket = validateTicket(body);
            if (!ticket.ok) throw new HttpError(400, ticket.error);

            const result = await addCitizenTicketAdmin(id, user, ticket.value.reason, ticket.value.message);
            return NextResponse.json({
                success: true,
                ticketId: result.ticketId,
                message: 'Ticket raised and priority upgraded',
            });
        }

        throw new HttpError(400, 'Invalid action');
    } catch (error) {
        return errorResponse(error, 'POST /api/complaints/[id]/intervene');
    }
}
