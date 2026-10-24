import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { queueEmail, welcomeEmail } from '@/lib/services/notification-service';
import { errorResponse, HttpError, requireUser } from '@/lib/server/auth';

/**
 * POST /api/user/welcome
 * Requests the welcome email once, only to the signed-in user's verified address.
 * welcomeEmailStatus records what actually happened: sent, failed or skipped.
 */
export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);
        if (!user.email) throw new HttpError(400, 'Account has no email address');

        const userRef = adminDb().collection('users').doc(user.uid);
        // Claim the request atomically so repeated calls cannot send again
        const firstRequest = await adminDb().runTransaction(async tx => {
            const snap = await tx.get(userRef);
            if (!snap.exists) throw new HttpError(409, 'User profile not found');
            // welcomeEmailSentAt: accounts claimed before delivery status was recorded
            if (snap.get('welcomeEmailRequestedAt') || snap.get('welcomeEmailSentAt')) return false;
            tx.update(userRef, { welcomeEmailRequestedAt: Timestamp.now() });
            return true;
        });

        if (!firstRequest) return NextResponse.json({ success: true, notification: 'skipped', reason: 'already-requested' });

        const notification = queueEmail(welcomeEmail({ displayName: user.displayName, email: user.email }),
            status => userRef.update({ welcomeEmailStatus: status }));
        if (notification === 'skipped') await userRef.update({ welcomeEmailStatus: 'skipped' });
        return NextResponse.json({ success: true, notification });
    } catch (error) {
        return errorResponse(error, 'POST /api/user/welcome');
    }
}
