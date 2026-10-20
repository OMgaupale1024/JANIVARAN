import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { sendWelcomeEmail } from '@/lib/services/notification-service';
import { errorResponse, HttpError, requireUser } from '@/lib/server/auth';

/**
 * POST /api/user/welcome
 * Sends the welcome email once, only to the signed-in user's verified address.
 */
export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);
        if (!user.email) throw new HttpError(400, 'Account has no email address');

        const userRef = adminDb().collection('users').doc(user.uid);
        // Claim the send atomically so repeated calls cannot send again
        const firstSend = await adminDb().runTransaction(async tx => {
            const snap = await tx.get(userRef);
            if (!snap.exists) throw new HttpError(409, 'User profile not found');
            if (snap.data()?.welcomeEmailSentAt) return false;
            tx.update(userRef, { welcomeEmailSentAt: Timestamp.now() });
            return true;
        });

        if (!firstSend) return NextResponse.json({ success: true, notification: 'skipped', reason: 'already-sent' });

        const notification = await sendWelcomeEmail({ displayName: user.displayName, email: user.email });
        return NextResponse.json({ success: true, notification });
    } catch (error) {
        return errorResponse(error, 'POST /api/user/welcome');
    }
}
