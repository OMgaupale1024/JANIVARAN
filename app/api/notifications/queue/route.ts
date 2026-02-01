import { NextRequest, NextResponse } from 'next/server';
import { getEmailQueue } from '@/lib/services/notification-service';

// GET /api/notifications/queue - View mock email queue (demo purposes)
export async function GET(request: NextRequest) {
    try {
        const queue = getEmailQueue();

        return NextResponse.json({
            success: true,
            count: queue.length,
            emails: queue.map(email => ({
                to: email.to,
                subject: email.subject,
                type: email.type,
                timestamp: email.timestamp,
            })),
        });
    } catch (error) {
        console.error('Error fetching email queue:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch email queue' },
            { status: 500 }
        );
    }
}
