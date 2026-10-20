import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { errorResponse, HttpError, readJson, requireUser } from '@/lib/server/auth';

const HOUR_MS = 60 * 60 * 1000;

// Shift a timestamp field back in time (simulates the clock moving forward)
const shifted = (value: unknown, ms: number) =>
    value instanceof Timestamp ? Timestamp.fromMillis(value.toMillis() - ms) : value;

/**
 * POST /api/simulation  (development demo only)
 * Disabled in production. In development it requires an authority account and
 * only touches complaints explicitly marked `testData: true`.
 */
export async function POST(request: NextRequest) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    try {
        const user = await requireUser(request);
        if (user.role !== 'admin') throw new HttpError(403, 'Authority access required');
        const { action, hours } = await readJson(request);

        const db = adminDb();
        const active = await db.collection('complaints')
            .where('testData', '==', true)
            .where('status', 'in', ['pending', 'under-review', 'in-progress', 'escalated'])
            .get();

        if (action === 'FORWARD_TIME') {
            const shiftHours = typeof hours === 'number' && hours > 0 && hours <= 72 ? hours : 1;
            const batch = db.batch();
            // createdAt and the stored deadline move together so the SLA window is preserved
            active.docs.forEach(doc => {
                const data = doc.data();
                batch.update(doc.ref, {
                    createdAt: shifted(data.createdAt, shiftHours * HOUR_MS),
                    'sla.deadline': shifted(data.sla?.deadline, shiftHours * HOUR_MS),
                });
            });
            await batch.commit();
            return NextResponse.json({ success: true, message: `Simulated ${shiftHours}h on ${active.size} test complaint(s)` });
        }

        if (action === 'FORCE_BREACH') {
            const doc = active.docs[0];
            if (!doc) return NextResponse.json({ success: false, message: 'No active test complaints found to breach' });
            const data = doc.data();
            const overdueBy = (data.sla?.assignedHours ?? 48) * HOUR_MS + HOUR_MS;
            await doc.ref.update({
                createdAt: shifted(data.createdAt, overdueBy),
                'sla.deadline': shifted(data.sla?.deadline, overdueBy),
            });
            return NextResponse.json({ success: true, message: `Forced breach on test complaint ${doc.id}` });
        }

        throw new HttpError(400, 'Invalid action');
    } catch (error) {
        return errorResponse(error, 'POST /api/simulation');
    }
}
