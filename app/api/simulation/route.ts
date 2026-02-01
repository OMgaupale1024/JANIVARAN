import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: Request) {
    const { action, hours } = await request.json();

    try {
        if (action === 'FORWARD_TIME') {
            const shiftHours = hours || 1;
            const shiftMillis = shiftHours * 60 * 60 * 1000;

            console.log(`⏩ [SIMULATION] Forwarding time by ${shiftHours} hours`);

            const snapshot = await adminDb.collection('complaints')
                .where('status', 'not-in', ['resolved', 'closed'])
                .get();

            if (snapshot.empty) {
                return NextResponse.json({ success: true, message: 'No active complaints to shift' });
            }

            const batch = adminDb.batch();

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.createdAt) {
                    // Shift createdAt BACKWARDS to simulate time passing (making the complaint older)
                    const oldTime = data.createdAt.toDate().getTime();
                    const newTime = new Date(oldTime - shiftMillis);

                    batch.update(doc.ref, {
                        createdAt: Timestamp.fromDate(newTime),
                        // Also shift updatedAt to keep it consistent usually, but not strictly required for SLA
                    });
                }
            });

            await batch.commit();
            return NextResponse.json({ success: true, message: `Simulated ${shiftHours} hours passing (Shifted creation times back)` });
        }

        if (action === 'FORCE_BREACH') {
            console.log(`⚠️ [SIMULATION] Forcing Breach`);

            // Find a candidate: Active, not escalated, not critical (optional)
            const snapshot = await adminDb.collection('complaints')
                .where('status', 'in', ['pending', 'in-progress', 'under-review'])
                .limit(1)
                .get();

            if (snapshot.empty) {
                return NextResponse.json({ success: false, message: 'No active complaints found to breach' });
            }

            const doc = snapshot.docs[0];

            // Force breach by setting createdAt to 3 days ago (72 hours) - assumes 48h SLA
            const threeDaysAgo = new Date(Date.now() - (72 * 60 * 60 * 1000));

            await doc.ref.update({
                createdAt: Timestamp.fromDate(threeDaysAgo),
                // We don't auto-escalate here, the frontend or a background job would pick it up. 
                // But for visual breach, this is enough. 
                // If we want to test auto-escalation trigger, we might need to call that service.
            });

            return NextResponse.json({ success: true, message: `Forced breach on complaint ${doc.id}` });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('Simulation Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
