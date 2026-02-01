import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/services/notification-service';

export async function POST(request: NextRequest) {
    try {
        const { user } = await request.json();

        if (!user || !user.email) {
            return NextResponse.json({ success: false, error: 'Invalid user data' }, { status: 400 });
        }

        await sendWelcomeEmail(user);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Welcome email error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
