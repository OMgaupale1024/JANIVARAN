import { NextRequest, NextResponse } from 'next/server';
import {
    getAuditLogsAdmin,
    getComplaintByIdAdmin,
    getEscalationsAdmin,
    removeComplaintAdmin,
    serialize,
    updateComplaintAdmin,
} from '@/lib/services/admin/complaint-service-admin';
import { sendStatusChangeEmail, sendComplaintRoutedEmail, DeliveryStatus } from '@/lib/services/notification-service';
import { canViewComplaint, isStaffFor } from '@/lib/complaint-policy';
import { errorResponse, HttpError, readJson, requireUser } from '@/lib/server/auth';

type Params = { params: Promise<{ id: string }> };

const PATCH_FIELDS = ['action', 'status', 'priority', 'officialId', 'departmentName'];

/**
 * GET /api/complaints/[id]
 */
export async function GET(request: NextRequest, props: Params) {
    try {
        const user = await requireUser(request);
        const { id } = await props.params;

        const complaint = await getComplaintByIdAdmin(id);
        if (!complaint || !canViewComplaint(user, complaint)) {
            // Same response for missing and forbidden so IDs can't be probed
            throw new HttpError(404, 'Complaint not found');
        }

        const response: Record<string, unknown> = { complaint };
        const searchParams = request.nextUrl.searchParams;
        if (isStaffFor(user, complaint)) {
            if (searchParams.get('includeAudit') === 'true') response.auditLogs = await getAuditLogsAdmin(id);
            if (searchParams.get('includeEscalations') === 'true') response.escalations = await getEscalationsAdmin(id);
        }

        return NextResponse.json({ success: true, data: serialize(response) });
    } catch (error) {
        return errorResponse(error, 'GET /api/complaints/[id]');
    }
}

/**
 * PATCH /api/complaints/[id]
 * Staff actions:
 *  - { action: 'updateStatus', status?, priority? }  (status and/or priority, saved atomically)
 *  - { action: 'assign', officialId }                (authority only)
 */
export async function PATCH(request: NextRequest, props: Params) {
    try {
        const user = await requireUser(request);
        const { id } = await props.params;
        const body = await readJson(request);

        const unknownField = Object.keys(body).find(k => !PATCH_FIELDS.includes(k));
        if (unknownField) throw new HttpError(400, `Unexpected field: ${unknownField}`);

        let changes;
        if (body.action === 'updateStatus' && (body.status !== undefined || body.priority !== undefined)) {
            changes = { status: body.status, priority: body.priority };
        } else if (body.action === 'assign' && body.officialId !== undefined) {
            changes = { officialId: body.officialId };
        } else {
            throw new HttpError(400, 'Invalid action');
        }

        const result = await updateComplaintAdmin(id, user, changes);
        if (!result.changed) {
            return NextResponse.json({ success: true, message: 'No changes', notification: 'skipped' });
        }

        // Notify the citizen after the change is committed; delivery outcome is reported, not assumed
        const { complaint } = result;
        let notification: DeliveryStatus = 'skipped';
        if (complaint.citizenEmail && result.newStatus && result.oldStatus) {
            if (changes.officialId !== undefined) {
                const deptName = typeof body.departmentName === 'string' ? body.departmentName.slice(0, 100) : complaint.assignedDepartment;
                notification = await sendComplaintRoutedEmail({ ...complaint, status: result.newStatus }, complaint.citizenEmail, deptName);
            } else {
                notification = await sendStatusChangeEmail(complaint, complaint.citizenEmail, result.oldStatus, result.newStatus);
            }
        }

        return NextResponse.json({ success: true, message: 'Complaint updated', notification });
    } catch (error) {
        return errorResponse(error, 'PATCH /api/complaints/[id]');
    }
}

/**
 * DELETE /api/complaints/[id]
 * Authority: permanent delete. Citizen: withdraw own pending/under-review complaint.
 */
export async function DELETE(request: NextRequest, props: Params) {
    try {
        const user = await requireUser(request);
        const { id } = await props.params;

        const outcome = await removeComplaintAdmin(id, user);
        const message = outcome === 'deleted' ? 'Complaint deleted' : 'Complaint withdrawn';
        return NextResponse.json({ success: true, outcome, message });
    } catch (error) {
        return errorResponse(error, 'DELETE /api/complaints/[id]');
    }
}
