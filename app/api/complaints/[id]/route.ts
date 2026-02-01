import { NextRequest, NextResponse } from 'next/server';
import {
    getComplaintByIdAdmin,
    updateComplaintStatusAdmin,
    assignComplaintAdmin
} from '@/lib/services/admin/complaint-service-admin';
import { getAuditLogs } from '@/lib/services/audit-service';
import { getEscalationsByComplaint } from '@/lib/services/escalation-service';
import { Timestamp } from 'firebase-admin/firestore'; // Use Admin Timestamp
import { sendStatusChangeEmail, sendComplaintRoutedEmail } from '@/lib/services/notification-service';

/**
 * GET /api/complaints/[id]
 */
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const { id } = params;

        // Use Admin SDK for consistent reading (or Client if preferred for reads, but Admin is reliable here)
        // User asked to REMOVE Client SDK from API routes, so using Admin.
        const complaint = await getComplaintByIdAdmin(id);

        if (!complaint) {
            return NextResponse.json(
                { success: false, error: 'Complaint not found' },
                { status: 404 }
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const includeAudit = searchParams.get('includeAudit') === 'true';
        const includeEscalations = searchParams.get('includeEscalations') === 'true';

        const response: any = { complaint };

        if (includeAudit) {
            response.auditLogs = await getAuditLogs(id);
        }

        if (includeEscalations) {
            response.escalations = await getEscalationsByComplaint(id);
        }

        return NextResponse.json({ success: true, data: response });
    } catch (error: any) {
        console.error('GET /api/complaints/[id] error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch complaint' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/complaints/[id]
 */
export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const { id } = params;
        const body = await request.json();

        console.log(`📡 [API-ADMIN] PATCH /api/complaints/${id}`);
        // console.log('📦 Body:', JSON.stringify(body, null, 2));

        const { action, status, priority, officialId, user } = body;

        // 1. Basic Validation
        if (!user) {
            return NextResponse.json({ success: false, error: 'User info required' }, { status: 400 });
        }

        // 2. Fetch Complaint (Existence Check & Data for Emails)
        const complaint = await getComplaintByIdAdmin(id);
        if (!complaint) {
            return NextResponse.json({ success: false, error: 'Complaint not found' }, { status: 404 });
        }

        // Email Handling Prep
        // Prioritize citizenEmail, fallback to userEmail if exists (schema variation)
        const targetEmail = complaint.citizenEmail || (complaint as any).userEmail;

        // 3. Handle Actions
        if (action === 'updateStatus' && status) {
            const oldStatus = complaint.status;

            console.log(`⚡ [API-ADMIN] Updating status: ${oldStatus} -> ${status}`);

            // 3a. Update Status (Admin SDK)
            try {
                await updateComplaintStatusAdmin(id, status, user); // User obj simplified
            } catch (err: any) {
                console.error("❌ DB Update Failed:", err);
                return NextResponse.json({ success: false, error: 'Database update failed' }, { status: 500 });
            }

            // 3b. Send Email (Fail-safe)
            if (targetEmail) {
                try {
                    console.log(`📧 Sending status email to ${targetEmail}`);
                    await sendStatusChangeEmail(complaint, targetEmail, oldStatus, status);
                } catch (emailErr) {
                    console.error("⚠️ Email send failed (non-blocking):", emailErr);
                }
            } else {
                console.warn(`⚠️ No email found for complaint ${id}`);
            }

            return NextResponse.json({ success: true, message: 'Status updated' });
        }

        if (action === 'assign' && officialId) {
            // 3a. Assign (Admin SDK)
            await assignComplaintAdmin(id, officialId, user);

            // 3b. Send Message (Complaint Routed)
            if (targetEmail) {
                try {
                    // Try to get dept name? Or just use ID or query dept
                    const deptName = body.departmentName || 'the department';
                    await sendComplaintRoutedEmail(complaint, targetEmail, deptName);
                } catch (emailErr) {
                    console.error("⚠️ Email send failed (non-blocking):", emailErr);
                }
            }

            return NextResponse.json({ success: true, message: 'Complaint assigned' });
        }

        // Priority Update (if separate from status, or mixed)
        // If simply updating priority
        if (priority && !action) {
            // We need a updatePriorityAdmin? Or generic update. 
            // For now, user request focused on status/email stability.
            // If priority update is needed, likely need to add that helper.
            // Assuming updateStatus handles specific requirement for now directly.
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('PATCH Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/complaints/[id]
 */
export async function DELETE(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const { id } = params;
        const { deleteComplaintAdmin } = await import('@/lib/services/admin/complaint-service-admin');

        console.log(`🗑️ [API-ADMIN] DELETE /api/complaints/${id}`);

        await deleteComplaintAdmin(id);

        return NextResponse.json({ success: true, message: 'Complaint deleted successfully' });

    } catch (error: any) {
        console.error('DELETE Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to delete complaint' },
            { status: 500 }
        );
    }
}
